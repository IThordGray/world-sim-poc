import { describe, expect, it } from 'vitest';
import { blendInto, type Snapshot } from './climate';
import { H, LAT, N, W } from './grid';
import { World } from './world';

describe('world', () => {
  const a = new World(7, 225, 12);

  it('is deterministic: the same seed gives the same weather', () => {
    const b = new World(7, 225, 12);
    for (let k = 0; k < 6; k++) { a.step(); b.step(); }
    expect(Array.from(b.pressure)).toEqual(Array.from(a.pressure));
    expect(b.systems).toEqual(a.systems);
  });

  it('gives a different world for a different seed', () => {
    const c = new World(8, 225, 0);
    expect(Array.from(c.terrain.elev)).not.toEqual(Array.from(a.terrain.elev));
  });

  it('has trade winds from the NE in the tropics and westerlies in mid-latitudes', () => {
    const zonalMean = (lat: number) => {
      let y = 0;
      while (y < H - 1 && LAT[y] > lat) y++;
      let u = 0, v = 0, n = 0;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (a.terrain.land[i]) continue;
        u += a.prevailingU[i]; v += a.prevailingV[i]; n++;
      }
      return { u: u / n, v: v / n };
    };
    const trades = zonalMean(15), westerlies = zonalMean(45);
    expect(trades.u).toBeLessThan(0); // toward the west…
    expect(trades.v).toBeLessThan(0); // …and the equator
    expect(westerlies.u).toBeGreaterThan(0);
  });
});

describe('seasonal blend', () => {
  const snaps = [0, 1, 2, 3].map((s) => ({ pressure: new Float32Array(N).fill(s) }) as Snapshot);
  const at = (day: number) => { const out = new Float32Array(N); blendInto(out, snaps, 'pressure', day); return out[0]; };

  it('equals the season snapshot at mid-season', () => {
    expect(at(195)).toBeCloseTo(2);
  });

  it('has no step at a season boundary', () => {
    expect(at(150)).toBeCloseTo(1.5);
    expect(Math.abs(at(150.01) - at(149.99))).toBeLessThan(0.001);
  });

  it('wraps from autumn back into winter', () => {
    expect(at(375)).toBeCloseTo(0);
    expect(at(330)).toBeCloseTo(1.5);
  });
});
