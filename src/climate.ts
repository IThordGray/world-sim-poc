import { H, LAT, N, W } from './grid';
import { P } from './params';
import type { Terrain } from './terrain';
import { newWindField, resolveWind } from './wind';

/** One seasonal snapshot per climate cell. Computed once at world-gen, never at runtime. */
export interface Snapshot {
  pressure: Float32Array;
  temp: Float32Array;
  windU: Float32Array;
  windV: Float32Array;
}

export type ClimateField = keyof Snapshot;

/** Mid-season days for winter, spring, summer, autumn (360-day year, January = days 0–29). */
const SEASON_CENTRE_DAY = [15, 105, 195, 285];

/** −1 at mid-winter, +1 at mid-summer. */
export const summerness = (day: number) => -Math.cos((2 * Math.PI * (day - SEASON_CENTRE_DAY[0])) / 360);

export const beltShiftDeg = (day: number) => P.belts.seasonalShiftDeg * summerness(day);

/** Belt pressure offset at a latitude, given how far the belts have shifted poleward. */
export function beltOffset(lat: number, shiftDeg: number): number {
  const a = Math.abs(lat - shiftDeg);
  const pts = P.belts.profile;
  for (let k = 1; k < pts.length; k++) {
    const [l0, p0] = pts[k - 1], [l1, p1] = pts[k];
    if (a <= l1) {
      const t = (a - l0) / (l1 - l0);
      return p0 + (p1 - p0) * (0.5 - 0.5 * Math.cos(Math.PI * t));
    }
  }
  return pts[pts.length - 1][1];
}

function buildSnapshot(t: Terrain, centreDay: number): Snapshot {
  const s = summerness(centreDay);
  const shift = beltShiftDeg(centreDay);
  const b = P.belts, c = P.temperature;
  const pressure = new Float32Array(N);
  const temp = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    const lat = LAT[y];
    const belt = b.baseHPa + beltOffset(lat, shift);
    const swing = c.swingPerDegLat * Math.abs(lat);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const inland = Math.min(1, t.seaDist[i] / c.maritimeCells);
      const continentality = Math.min(1, t.seaDist[i] / b.continentalityCells);
      // Monsoon: a thermal low over land in summer, a high in winter.
      pressure[i] = belt - (t.land[i] ? b.monsoonHPa * s * continentality : 0);
      const swingFactor = t.land[i] ? c.coastSwing + (c.inlandSwing - c.coastSwing) * inland : c.seaSwing;
      temp[i] = c.equatorC - c.dropPerDegLatSq * lat * lat + swing * swingFactor * s - c.lapseCPerElev * Math.max(0, t.elev[i]);
    }
  }
  const wind = newWindField();
  resolveWind(pressure, t, wind);
  return { pressure, temp, windU: wind.u, windV: wind.v };
}

export const buildClimate = (t: Terrain): Snapshot[] => SEASON_CENTRE_DAY.map((d) => buildSnapshot(t, d));

/** Cosine blend of the two nearest snapshots, each peaking mid-season: no step at season boundaries. */
export function blendWeights(day: number): { a: number; b: number; wb: number } {
  const pos = ((((day - SEASON_CENTRE_DAY[0]) / 90) % 4) + 4) % 4;
  const a = Math.floor(pos);
  const f = pos - a;
  return { a, b: (a + 1) % 4, wb: 0.5 - 0.5 * Math.cos(Math.PI * f) };
}

export function blendInto(out: Float32Array, snaps: Snapshot[], field: ClimateField, day: number): void {
  const { a, b, wb } = blendWeights(day);
  const fa = snaps[a][field], fb = snaps[b][field];
  for (let i = 0; i < N; i++) out[i] = fa[i] * (1 - wb) + fb[i] * wb;
}
