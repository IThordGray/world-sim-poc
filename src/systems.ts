import { bilinear, CELLS_PER_HOUR_PER_MS, H, latOfRow, rowOfLat, W, wrapX } from './grid';
import { capacity } from './moisture';
import { P } from './params';
import { pick } from './rng';
import type { Terrain } from './terrain';

export type Kind = 'SemiPermanentHigh' | 'Depression' | 'TropicalStorm' | 'Squall';
export type State = 'Forming' | 'Deepening' | 'Mature' | 'Decaying';

export interface PressureSystem {
  id: number;
  kind: Kind;
  state: State;
  /** Climate-grid cells; x wraps east–west. */
  x: number;
  y: number;
  /** Cells per hour, east and north. */
  vx: number;
  vy: number;
  /** Signed: negative for lows. */
  peak: number;
  strength: number;
  radius: number;
  moisture: number;
  age: number;
  lifespan: number;
  recurved: boolean;
}

/** What systems read from the rest of the world. */
export interface SystemInputs {
  terrain: Terrain;
  temp: Float32Array;
  hum: Float32Array;
  prevailingU: Float32Array;
  prevailingV: Float32Array;
  windU: Float32Array;
  windV: Float32Array;
}

const S = P.systems;

/** Every system is telegraphed: it ramps up through Forming before it reaches full strength. */
export function applyLifecycle(s: PressureSystem): void {
  if (s.kind === 'SemiPermanentHigh') { s.state = 'Mature'; s.strength = s.peak; return; }
  const f = s.age / s.lifespan, l = S.lifecycle, f0 = S.formingStrength;
  if (f < l.forming) { s.state = 'Forming'; s.strength = s.peak * f0 * (f / l.forming); }
  else if (f < l.deepening) { s.state = 'Deepening'; s.strength = s.peak * (f0 + (1 - f0) * (f - l.forming) / (l.deepening - l.forming)); }
  else if (f < l.mature) { s.state = 'Mature'; s.strength = s.peak; }
  else { s.state = 'Decaying'; s.strength = s.peak * Math.max(0, 1 - (f - l.mature) / (1 - l.mature)); }
}

/** One semi-permanent high per ocean basin along the subtropical belt. */
export function placeHighs(t: Terrain, firstId: number, rng: () => number): PressureSystem[] {
  const y = Math.round(rowOfLat(S.high.latDeg));
  const sea = (x: number) => !t.land[y * W + wrapX(x)];
  let start = 0;
  while (start < W && sea(start)) start++; // begin the scan at land so runs don't straddle the seam
  const highs: PressureSystem[] = [];
  let run = 0;
  for (let k = 1; k <= W; k++) {
    const x = start + k;
    if (sea(x)) { run++; continue; }
    if (run >= S.high.minBasinCells) {
      const s: PressureSystem = {
        id: firstId + highs.length, kind: 'SemiPermanentHigh', state: 'Mature', x: wrapX(x - run / 2), y,
        vx: 0, vy: 0, peak: pick(rng, S.high.peakHPa), strength: 0, radius: S.high.radius, moisture: 0,
        age: 0, lifespan: Infinity, recurved: false,
      };
      applyLifecycle(s);
      highs.push(s);
    }
    run = 0;
  }
  return highs;
}

function create(id: number, kind: Kind, x: number, y: number, rng: () => number,
  cfg: { peakHPa: [number, number]; radius: [number, number]; lifespanH: [number, number]; moisture: number }): PressureSystem {
  const s: PressureSystem = {
    id, kind, state: 'Forming', x, y, vx: 0, vy: 0, peak: pick(rng, cfg.peakHPa), strength: 0,
    radius: pick(rng, cfg.radius), moisture: cfg.moisture, age: 0, lifespan: Math.round(pick(rng, cfg.lifespanH)),
    recurved: false,
  };
  applyLifecycle(s);
  return s;
}

/** Spawn check for each kind this tick. Returns the next free id. */
export function spawnSystems(systems: PressureSystem[], nextId: number, rng: () => number,
  month: number, hour: number, shiftDeg: number, w: SystemInputs): number {
  const count = (k: Kind) => systems.reduce((n, s) => n + (s.kind === k ? 1 : 0), 0);
  const sea = (i: number) => w.terrain.land[i] === 0;
  const inBand = (band: [number, number]) => {
    const x = Math.floor(rng() * W);
    const y = Math.round(rowOfLat(pick(rng, band) + shiftDeg));
    return y >= 0 && y < H ? { x, y, i: y * W + x } : null;
  };

  const d = S.depression;
  if (count('Depression') < d.cap && rng() < d.rate[month]) {
    const c = inBand(d.band);
    if (c && sea(c.i)) systems.push(create(nextId++, 'Depression', c.x, c.y, rng, d));
  }

  const ts = S.tropical;
  if (count('TropicalStorm') < ts.cap && rng() < ts.rate[month]) {
    const c = inBand(ts.band);
    if (c && sea(c.i) && w.temp[c.i] >= ts.minSeaC) systems.push(create(nextId++, 'TropicalStorm', c.x, c.y, rng, ts));
  }

  const q = S.squall;
  const daytime = hour >= q.afternoon.from && hour < q.afternoon.to ? q.afternoon.factor : q.afternoon.otherwise;
  if (count('Squall') < q.cap && rng() < q.rate * daytime) {
    const x = Math.floor(rng() * W), y = Math.floor(rng() * H), i = y * W + x;
    if (w.hum[i] >= q.minRelHumidity * capacity(w.temp[i])) systems.push(create(nextId++, 'Squall', x, y, rng, q));
  }
  return nextId;
}

/** Prevailing wind averaged over the system's radius (centre plus four points at half radius). */
function steering(s: PressureSystem, u: Float32Array, v: Float32Array): [number, number] {
  const r = s.radius / 2;
  const pts: [number, number][] = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]];
  let su = 0, sv = 0;
  for (const [dx, dy] of pts) { su += bilinear(u, s.x + dx, s.y + dy); sv += bilinear(v, s.x + dx, s.y + dy); }
  su /= pts.length;
  sv /= pts.length;
  const a = S.steerVeerDeg * (Math.PI / 180);
  return [su * Math.cos(a) + sv * Math.sin(a), -su * Math.sin(a) + sv * Math.cos(a)];
}

/** Move, age and transform systems by one tick. Returns the survivors. */
export function moveSystems(systems: PressureSystem[], shiftDeg: number, w: SystemInputs): PressureSystem[] {
  const ts = S.tropical;
  const k = CELLS_PER_HOUR_PER_MS * S.steer;
  const survivors: PressureSystem[] = [];
  for (const s of systems) {
    if (s.kind === 'SemiPermanentHigh') {
      s.y = rowOfLat(S.high.latDeg + shiftDeg);
      survivors.push(s);
      continue;
    }
    const lat = latOfRow(s.y);
    if (s.kind === 'TropicalStorm') {
      if (!s.recurved && lat > S.high.latDeg + shiftDeg - ts.recurveMarginDeg) s.recurved = true;
      if (lat > ts.westerliesDeg + shiftDeg) {
        s.kind = 'Depression';
        s.radius *= ts.toDepression.radius;
        s.peak *= ts.toDepression.strength;
        s.moisture = S.depression.moisture;
      }
    }

    const [u, v] = s.kind === 'Squall' ? steering(s, w.windU, w.windV) : steering(s, w.prevailingU, w.prevailingV);
    // Drift is in m/s like the wind, so both convert to cells at the same scale.
    let driftE = 0, driftN = 0;
    if (s.kind === 'Depression') driftN = S.depression.polewardMs;
    if (s.kind === 'TropicalStorm') {
      driftN = s.recurved ? ts.recurvePolewardMs : ts.polewardMs;
      if (s.recurved) driftE = ts.recurveEastMs;
    }
    s.vx = u * k + driftE * CELLS_PER_HOUR_PER_MS;
    s.vy = v * k + driftN * CELLS_PER_HOUR_PER_MS;
    s.x = wrapX(s.x + s.vx);
    s.y -= s.vy;

    const i = Math.round(Math.min(H - 1, Math.max(0, s.y))) * W + Math.round(s.x) % W;
    s.age += s.kind === 'TropicalStorm' && w.terrain.land[i] ? S.tropicalLandDecay : 1;
    applyLifecycle(s);
    if (s.age < s.lifespan && s.y >= 0 && s.y <= H - 1) survivors.push(s);
  }
  return survivors;
}

/** Add every system's pressure bump (strength × exp(−d²/r²)) and record where lows converge and rain. */
export function applySystems(systems: PressureSystem[], pressure: Float32Array, lowInfluence: Float32Array, systemRain: Float32Array): void {
  for (const s of systems) {
    const r2 = s.radius * s.radius;
    const reach = Math.ceil(3 * s.radius);
    const cx = Math.round(s.x);
    const y0 = Math.max(0, Math.ceil(s.y - reach)), y1 = Math.min(H - 1, Math.floor(s.y + reach));
    const isLow = s.strength < 0;
    const lowWeight = Math.min(1, -s.strength / 20);
    const rainWeight = s.peak !== 0 ? s.moisture * (s.strength / s.peak) : 0;
    for (let y = y0; y <= y1; y++) {
      const dy = y - s.y;
      for (let dx = -reach; dx <= reach; dx++) {
        const ddx = cx + dx - s.x;
        const wgt = Math.exp(-(ddx * ddx + dy * dy) / r2);
        const i = y * W + wrapX(cx + dx);
        pressure[i] += s.strength * wgt;
        if (isLow) {
          lowInfluence[i] += wgt * lowWeight;
          systemRain[i] += wgt * rainWeight;
        }
      }
    }
  }
}
