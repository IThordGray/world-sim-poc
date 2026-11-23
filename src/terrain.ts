import { H, N, W, wrapX } from './grid';
import { P } from './params';
import { hash01, Subsystem } from './rng';

export interface Terrain {
  /** Land 0..1 above sea level, sea -1..0 below. */
  elev: Float32Array;
  land: Uint8Array;
  /** Cells to the nearest sea cell (0 on sea). */
  seaDist: Float32Array;
  /** Uphill direction of land elevation, east and north components per cell. */
  slopeE: Float32Array;
  slopeN: Float32Array;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function valueNoise(seed: number, x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = smooth(x - xi), fy = smooth(y - yi), fz = smooth(z - zi);
  const c = (dx: number, dy: number, dz: number) => hash01(seed, xi + dx, yi + dy, zi + dz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy),
    l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz,
  );
}

/** fBm sampled on a cylinder so the map wraps east–west without a seam. */
function cylinderNoise(seed: number, x: number, y: number): number {
  const a = (x / W) * Math.PI * 2;
  const r = W / (Math.PI * 2);
  let sum = 0, amp = 1, freq = P.terrain.baseFrequency, norm = 0;
  for (let o = 0; o < P.terrain.octaves; o++) {
    sum += amp * valueNoise(seed + o * 1013, Math.cos(a) * r * freq, y * freq, Math.sin(a) * r * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** 4-neighbour BFS distance to the nearest cell where `isSource` holds. */
function distanceTo(isSource: (i: number) => boolean): Float32Array {
  const dist = new Float32Array(N).fill(Infinity);
  const queue = new Int32Array(N);
  let head = 0, tail = 0;
  for (let i = 0; i < N; i++) if (isSource(i)) { dist[i] = 0; queue[tail++] = i; }
  while (head < tail) {
    const i = queue[head++], x = i % W, y = (i - x) / W, d = dist[i] + 1;
    const visit = (j: number) => { if (d < dist[j]) { dist[j] = d; queue[tail++] = j; } };
    visit(y * W + wrapX(x - 1));
    visit(y * W + wrapX(x + 1));
    if (y > 0) visit(i - W);
    if (y < H - 1) visit(i + W);
  }
  return dist;
}

export function generateTerrain(seed: number): Terrain {
  const noiseSeed = seed * 7919 + Subsystem.Terrain;
  const raw = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) raw[y * W + x] = cylinderNoise(noiseSeed, x, y);

  // Sea level at the percentile that gives the configured land share.
  const sorted = Float32Array.from(raw).sort();
  const seaLevel = sorted[Math.floor(N * (1 - P.terrain.landFraction))];
  const max = sorted[N - 1], min = sorted[0];

  const elev = new Float32Array(N);
  const land = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const v = raw[i];
    land[i] = v >= seaLevel ? 1 : 0;
    elev[i] = land[i] ? (v - seaLevel) / (max - seaLevel) : -(seaLevel - v) / (seaLevel - min);
  }

  const slopeE = new Float32Array(N);
  const slopeN = new Float32Array(N);
  const h = (x: number, y: number) => Math.max(0, elev[y * W + wrapX(x)]);
  for (let y = 0; y < H; y++) {
    const yn = Math.max(0, y - 1), ys = Math.min(H - 1, y + 1);
    for (let x = 0; x < W; x++) {
      slopeE[y * W + x] = (h(x + 1, y) - h(x - 1, y)) / 2;
      slopeN[y * W + x] = (h(x, yn) - h(x, ys)) / (ys - yn);
    }
  }

  return { elev, land, seaDist: distanceTo((i) => !land[i]), slopeE, slopeN };
}
