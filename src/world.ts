import { beltShiftDeg, blendInto, buildClimate, type Snapshot } from './climate';
import { N } from './grid';
import { capacity, stepMoisture, type Moisture } from './moisture';
import { P } from './params';
import { rngFor, Subsystem } from './rng';
import { applySystems, moveSystems, placeHighs, spawnSystems, type PressureSystem, type SystemInputs } from './systems';
import { generateTerrain, type Terrain } from './terrain';
import { gustOffset, newWindField, resolveWind, sampleWind, type WindField, type WindSample } from './wind';

const HOURS_PER_DAY = 24;
const DAYS_PER_YEAR = 360;

export class World {
  readonly terrain: Terrain;
  readonly climate: Snapshot[];
  tick: number;
  systems: PressureSystem[];
  private nextId: number;

  // Climate blended for the current day; refreshed once per game day.
  readonly basePressure = new Float32Array(N);
  readonly temp = new Float32Array(N);
  readonly prevailingU = new Float32Array(N);
  readonly prevailingV = new Float32Array(N);
  private blendedDay = -1;

  // Weather, resolved every tick. Wind is double-buffered so sampling never snaps.
  readonly pressure = new Float32Array(N);
  windPrev: WindField = newWindField();
  windNext: WindField = newWindField();
  readonly moisture: Moisture = { hum: new Float32Array(N), cloud: new Float32Array(N), rain: new Float32Array(N) };
  private readonly lowInfluence = new Float32Array(N);
  private readonly systemRain = new Float32Array(N);

  constructor(readonly seed: number, startDay = P.startDay, spinUpTicks = P.spinUpTicks) {
    this.terrain = generateTerrain(seed);
    this.climate = buildClimate(this.terrain);
    this.tick = startDay * HOURS_PER_DAY - spinUpTicks;
    this.refreshClimate();
    this.systems = placeHighs(this.terrain, 1, rngFor(seed, Subsystem.Spawn, -1));
    this.nextId = this.systems.length + 1;
    for (let i = 0; i < N; i++) this.moisture.hum[i] = P.moisture.initialRelHumidity * capacity(this.temp[i]);
    this.resolvePressureAndWind();
    this.windPrev.u.set(this.windNext.u);
    this.windPrev.v.set(this.windNext.v);
    this.windPrev.gust.set(this.windNext.gust);
    for (let k = 0; k < spinUpTicks; k++) this.step();
  }

  get dayOfYear(): number { return Math.floor(this.tick / HOURS_PER_DAY) % DAYS_PER_YEAR; }
  get month(): number { return Math.floor(this.dayOfYear / 30); }
  get hour(): number { return this.tick % HOURS_PER_DAY; }
  get year(): number { return Math.floor(this.tick / HOURS_PER_DAY / DAYS_PER_YEAR) + 1; }

  private get inputs(): SystemInputs {
    return {
      terrain: this.terrain, temp: this.temp, hum: this.moisture.hum,
      prevailingU: this.prevailingU, prevailingV: this.prevailingV, windU: this.windNext.u, windV: this.windNext.v,
    };
  }

  private refreshClimate(): void {
    const day = this.dayOfYear;
    if (day === this.blendedDay) return;
    this.blendedDay = day;
    blendInto(this.basePressure, this.climate, 'pressure', day);
    blendInto(this.temp, this.climate, 'temp', day);
    blendInto(this.prevailingU, this.climate, 'windU', day);
    blendInto(this.prevailingV, this.climate, 'windV', day);
  }

  private resolvePressureAndWind(): void {
    this.pressure.set(this.basePressure);
    this.lowInfluence.fill(0);
    this.systemRain.fill(0);
    applySystems(this.systems, this.pressure, this.lowInfluence, this.systemRain);
    [this.windPrev, this.windNext] = [this.windNext, this.windPrev];
    resolveWind(this.pressure, this.terrain, this.windNext);
  }

  /** One weather tick (one game hour). */
  step(): void {
    this.refreshClimate();
    const shift = beltShiftDeg(this.dayOfYear);
    const rng = rngFor(this.seed, Subsystem.Spawn, this.tick);
    this.nextId = spawnSystems(this.systems, this.nextId, rng, this.month, this.hour, shift, this.inputs);
    this.systems = moveSystems(this.systems, shift, this.inputs);
    this.resolvePressureAndWind();
    stepMoisture(this.moisture, this.windNext, this.temp, this.terrain, this.lowInfluence, this.systemRain);
    this.tick++;
  }

  /** What every consumer of wind calls. `frac` is how far game time is into the next tick (0..1). */
  windAt(x: number, y: number, frac: number): WindSample {
    return sampleWind(this.windPrev, this.windNext, frac, x, y);
  }

  gustAt(x: number, y: number, sample: WindSample): number {
    return gustOffset(this.seed, x, y, this.tick, sample);
  }
}
