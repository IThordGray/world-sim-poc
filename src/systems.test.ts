import { describe, expect, it } from 'vitest';
import { N, rowOfLat, W } from './grid';
import { applyLifecycle, applySystems, moveSystems, type PressureSystem, type SystemInputs } from './systems';

const still: SystemInputs = {
  terrain: { elev: new Float32Array(N), land: new Uint8Array(N), seaDist: new Float32Array(N), slopeE: new Float32Array(N), slopeN: new Float32Array(N) },
  temp: new Float32Array(N), hum: new Float32Array(N),
  prevailingU: new Float32Array(N), prevailingV: new Float32Array(N), windU: new Float32Array(N), windV: new Float32Array(N),
};

function storm(over: Partial<PressureSystem>): PressureSystem {
  const s: PressureSystem = {
    id: 1, kind: 'TropicalStorm', state: 'Forming', x: 100, y: rowOfLat(15), vx: 0, vy: 0, peak: -40, strength: 0,
    radius: 6, moisture: 1, age: 0, lifespan: 100, recurved: false, ...over,
  };
  applyLifecycle(s);
  return s;
}

describe('pressure system lifecycle', () => {
  it('telegraphs: a new system is Forming and well below peak strength', () => {
    const s = storm({});
    expect(s.state).toBe('Forming');
    expect(Math.abs(s.strength)).toBeLessThan(Math.abs(s.peak) * 0.5);
  });

  it('passes Forming, Deepening, Mature, Decaying in that order and then dies', () => {
    const s = storm({ lifespan: 40 });
    const states: string[] = [];
    let systems = [s];
    while (systems.length) {
      if (states[states.length - 1] !== s.state) states.push(s.state);
      systems = moveSystems(systems, 0, still);
    }
    expect(states).toEqual(['Forming', 'Deepening', 'Mature', 'Decaying']);
  });

  it('only a Mature system reaches its full strength', () => {
    const s = storm({ age: 50 });
    expect(s.state).toBe('Mature');
    expect(s.strength).toBe(-40);
  });
});

describe('tropical storm track', () => {
  it('recurves once it reaches the subtropical high', () => {
    const s = storm({ y: rowOfLat(29), age: 50 });
    moveSystems([s], 0, still);
    expect(s.recurved).toBe(true);
    expect(s.vx).toBeGreaterThan(0); // now heading east
  });

  it('becomes a wider, weaker Depression in the westerlies, keeping its state', () => {
    const s = storm({ y: rowOfLat(36), age: 50, radius: 6, peak: -40 });
    moveSystems([s], 0, still);
    expect(s.kind).toBe('Depression');
    expect(s.radius).toBe(12);
    expect(s.peak).toBeCloseTo(-28);
    expect(s.state).toBe('Mature');
  });
});

describe('pressure contribution', () => {
  it('adds strength × exp(−d²/r²), wrapping east–west', () => {
    const s = storm({ x: 0, y: 40, age: 50, radius: 10, peak: -20 });
    const p = new Float32Array(N);
    applySystems([s], p, new Float32Array(N), new Float32Array(N));
    expect(p[40 * W]).toBeCloseTo(-20);
    expect(p[40 * W + W - 10]).toBeCloseTo(-20 * Math.exp(-1)); // 10 cells west, across the seam
  });
});
