import { P } from './params';

export const W = P.grid.w;
export const H = P.grid.h;
export const N = W * H;

/** Climate-grid cells travelled per game hour at 1 m/s. */
export const CELLS_PER_HOUR_PER_MS = 3600 / 1852 / P.cellNm;

const latSpan = P.latitude.north - P.latitude.south;

export const wrapX = (x: number) => ((x % W) + W) % W;
export const clampRow = (y: number) => (y < 0 ? 0 : y >= H ? H - 1 : y);
export const latOfRow = (y: number) => P.latitude.north - (latSpan * (y + 0.5)) / H;
export const rowOfLat = (lat: number) => ((P.latitude.north - lat) / latSpan) * H - 0.5;
/** Shortest east–west offset on the cylinder. */
export const wrapDx = (dx: number) => (dx > W / 2 ? dx - W : dx < -W / 2 ? dx + W : dx);

export const LAT: Float32Array = Float32Array.from({ length: H }, (_, y) => latOfRow(y));

/** Bilinear sample with cell values at integer positions; wraps east–west, clamps north–south. */
export function bilinear(f: Float32Array, x: number, y: number): number {
  y = y < 0 ? 0 : y > H - 1 ? H - 1 : y;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const xa = wrapX(x0), xb = wrapX(x0 + 1);
  const ra = y0 * W, rb = Math.min(H - 1, y0 + 1) * W;
  const top = f[ra + xa] * (1 - fx) + f[ra + xb] * fx;
  const bottom = f[rb + xa] * (1 - fx) + f[rb + xb] * fx;
  return top * (1 - fy) + bottom * fy;
}
