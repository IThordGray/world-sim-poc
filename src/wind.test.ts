import { describe, expect, it } from 'vitest';
import { N, rowOfLat, W } from './grid';
import { applySystems, type PressureSystem } from './systems';
import type { Terrain } from './terrain';
import { beaufort, newWindField, resolveWind } from './wind';

const openSea: Terrain = {
  elev: new Float32Array(N).fill(-0.5),
  land: new Uint8Array(N),
  seaDist: new Float32Array(N),
  slopeE: new Float32Array(N),
  slopeN: new Float32Array(N),
};

function windAround(strength: number) {
  const cx = 128, cy = Math.round(rowOfLat(45)), radius = 12;
  const system = { x: cx, y: cy, radius, strength, peak: strength, moisture: 0 } as PressureSystem;
  const p = new Float32Array(N).fill(1013);
  applySystems([system], p, new Float32Array(N), new Float32Array(N));
  const wind = newWindField();
  resolveWind(p, openSea, wind);
  const at = (dx: number, dy: number) => {
    const i = (cy + dy) * W + cx + dx;
    return { u: wind.u[i], v: wind.v[i], speed: Math.hypot(wind.u[i], wind.v[i]) };
  };
  return { at, r: radius };
}

describe('wind from pressure', () => {
  it('turns anticlockwise around a low in the north', () => {
    const { at, r } = windAround(-20);
    expect(at(r, 0).v).toBeGreaterThan(0); // east side blows north
    expect(at(-r, 0).v).toBeLessThan(0); // west side blows south
    expect(at(0, -r).u).toBeLessThan(0); // north side (row above) blows west
  });

  it('turns clockwise around a high in the north', () => {
    const { at, r } = windAround(20);
    expect(at(r, 0).v).toBeLessThan(0);
    expect(at(0, -r).u).toBeGreaterThan(0);
  });

  it('leaves a calm eye at the centre of a storm', () => {
    const { at, r } = windAround(-30);
    expect(at(0, 0).speed).toBeLessThan(at(Math.round(r * 0.7), 0).speed * 0.3);
  });

  it('blows straight into the low near the equator, without turning', () => {
    const p = new Float32Array(N);
    const yEq = Math.round(rowOfLat(0.3));
    // Pressure rising northward only: down-gradient is due south.
    for (let i = 0; i < N; i++) p[i] = 1013 - Math.floor(i / W);
    const wind = newWindField();
    resolveWind(p, openSea, wind);
    const i = yEq * W + 50;
    expect(wind.v[i]).toBeLessThan(0);
    expect(Math.abs(wind.u[i])).toBeLessThan(Math.abs(wind.v[i]) * 0.1);
  });
});

describe('Beaufort conversion', () => {
  it('maps m/s onto the standard scale', () => {
    expect(beaufort(0.3)).toBe(0);
    expect(beaufort(7)).toBe(4);
    expect(beaufort(15)).toBe(7);
    expect(beaufort(40)).toBe(12);
  });
});
