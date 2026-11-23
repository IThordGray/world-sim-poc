/** Subsystem ids that key every RNG stream, so each stream depends only on (seed, subsystem, tick). */
export const Subsystem = { Terrain: 1, Spawn: 2, Gust: 3 } as const;

function mix(h: number, k: number): number {
  k = Math.imul(k, 0xcc9e2d51);
  k = (k << 15) | (k >>> 17);
  k = Math.imul(k, 0x1b873593);
  h ^= k;
  h = (h << 13) | (h >>> 19);
  return (Math.imul(h, 5) + 0xe6546b64) | 0;
}

/** 32-bit hash of up to four integers (murmur3 mixing). */
export function hash(a: number, b = 0, c = 0, d = 0): number {
  let h = mix(mix(mix(mix(0, a | 0), b | 0), c | 0), d | 0);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export const hash01 = (a: number, b = 0, c = 0, d = 0) => hash(a, b, c, d) / 4294967296;

/** mulberry32 stream for one (seed, subsystem, tick). */
export function rngFor(seed: number, subsystem: number, tick: number): () => number {
  let s = hash(seed, subsystem, tick);
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const pick = (r: () => number, [a, b]: [number, number]) => lerp(a, b, r());
