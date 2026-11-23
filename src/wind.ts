import { bilinear, H, LAT, N, W } from './grid';
import { P } from './params';
import { hash01, Subsystem } from './rng';
import type { Terrain } from './terrain';

/** Wind in m/s as east (u) and north (v) components, plus gustiness 0..1. */
export interface WindField {
  u: Float32Array;
  v: Float32Array;
  gust: Float32Array;
}

export const newWindField = (): WindField => ({ u: new Float32Array(N), v: new Float32Array(N), gust: new Float32Array(N) });

const BEAUFORT_MS = [0.5, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];

export function beaufort(ms: number): number {
  let b = 0;
  while (b < 12 && ms >= BEAUFORT_MS[b]) b++;
  return b;
}

const DEG = Math.PI / 180;
const rawU = new Float32Array(N);
const rawV = new Float32Array(N);
const rowU = new Float32Array(N);
const rowV = new Float32Array(N);

/** The only writer of wind: pressure gradient → deflection → friction → terrain → smoothing. */
export function resolveWind(p: Float32Array, t: Terrain, out: WindField): void {
  const c = P.wind;
  const high = P.terrain.highLand;
  for (let y = 0; y < H; y++) {
    const yn = Math.max(0, y - 1), ys = Math.min(H - 1, y + 1);
    const row = y * W, rowN = yn * W, rowS = ys * W, dyInv = 1 / (ys - yn);
    // Down the gradient, turned right in the north (left in the south), less so near the equator.
    const lat = LAT[y];
    const turn = (lat >= 0 ? 1 : -1) * Math.min(1, Math.abs(lat) / c.deflectRampDeg) * DEG;
    const cosSea = Math.cos(turn * c.deflectSeaDeg), sinSea = Math.sin(turn * c.deflectSeaDeg);
    const cosLand = Math.cos(turn * c.deflectLandDeg), sinLand = Math.sin(turn * c.deflectLandDeg);
    for (let x = 0; x < W; x++) {
      const i = row + x;
      const xl = x === 0 ? W - 1 : x - 1, xr = x === W - 1 ? 0 : x + 1;
      const gE = (p[row + xr] - p[row + xl]) / 2;
      const gN = (p[rowN + x] - p[rowS + x]) * dyInv;
      const mag = Math.sqrt(gE * gE + gN * gN);
      const onLand = t.land[i] === 1;
      let gust = c.baseGust + (onLand ? c.landGust : 0);
      if (mag < 1e-9) { rawU[i] = 0; rawV[i] = 0; out.gust[i] = gust; continue; }

      const cos = onLand ? cosLand : cosSea, sin = onLand ? sinLand : sinSea;
      const dE = -gE / mag, dN = -gN / mag;
      let dirE = dE * cos + dN * sin;
      let dirN = -dE * sin + dN * cos;
      let speed = Math.min(c.maxMs, c.msPerHpaPerCell * mag) * (onLand ? c.landFriction : 1);

      if (t.elev[i] < high) {
        // Blocking: wind into high land slides along it instead.
        const stepE = Math.round(dirE), stepN = Math.round(dirN);
        const jy = y - stepN;
        if (jy >= 0 && jy < H) {
          const j = jy * W + (stepE === 0 ? x : stepE > 0 ? xr : xl);
          if (t.elev[j] >= high) {
            const sE = t.slopeE[j], sN = t.slopeN[j], sm = Math.sqrt(sE * sE + sN * sN);
            const into = sm > 0 ? (dirE * sE + dirN * sN) / sm : 0;
            if (into > 0) {
              dirE -= (into * sE) / sm;
              dirN -= (into * sN) / sm;
              const dm = Math.sqrt(dirE * dirE + dirN * dirN) || 1;
              speed *= dm;
              dirE /= dm;
              dirN /= dm;
            }
          }
        }
        // Lee: high land a few cells upwind shelters this cell.
        for (let k = 1; k <= c.leeCells; k++) {
          const uy = y + Math.round(dirN * k);
          if (uy < 0 || uy >= H) break;
          if (t.elev[uy * W + ((x - Math.round(dirE * k) + W) % W)] >= high) { speed *= c.leeFactor; gust += c.leeGust; break; }
        }
      }

      rawU[i] = dirE * speed;
      rawV[i] = dirN * speed;
      out.gust[i] = Math.min(1, gust);
    }
  }

  // One 3×3 box blur to remove grid artefacts (separable: across, then down).
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const l = row + (x === 0 ? W - 1 : x - 1), r = row + (x === W - 1 ? 0 : x + 1), i = row + x;
      rowU[i] = (rawU[l] + rawU[i] + rawU[r]) / 3;
      rowV[i] = (rawV[l] + rawV[i] + rawV[r]) / 3;
    }
  }
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - 1), y1 = Math.min(H - 1, y + 1), n = y1 - y0 + 1;
    for (let x = 0; x < W; x++) {
      let su = 0, sv = 0;
      for (let yy = y0; yy <= y1; yy++) { su += rowU[yy * W + x]; sv += rowV[yy * W + x]; }
      out.u[y * W + x] = su / n;
      out.v[y * W + x] = sv / n;
    }
  }
}

export interface WindSample {
  u: number;
  v: number;
  speed: number;
  beaufort: number;
  gust: number;
}

/** Bilinear in space, linear between the previous and next tick. */
export function sampleWind(prev: WindField, next: WindField, frac: number, x: number, y: number): WindSample {
  const u = bilinear(prev.u, x, y) * (1 - frac) + bilinear(next.u, x, y) * frac;
  const v = bilinear(prev.v, x, y) * (1 - frac) + bilinear(next.v, x, y) * frac;
  const gust = bilinear(prev.gust, x, y) * (1 - frac) + bilinear(next.gust, x, y) * frac;
  const speed = Math.hypot(u, v);
  return { u, v, speed, beaufort: beaufort(speed), gust };
}

/** Instantaneous gust offset in m/s: deterministic noise keyed on cell and tick, scaled by gustiness. */
export function gustOffset(seed: number, x: number, y: number, tick: number, sample: WindSample): number {
  const n = hash01(seed * 31 + Subsystem.Gust, Math.floor(x), Math.floor(y), tick) * 2 - 1;
  return n * sample.gust * sample.speed;
}
