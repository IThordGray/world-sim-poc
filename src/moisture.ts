import { bilinear, CELLS_PER_HOUR_PER_MS, H, N, W } from './grid';
import { P } from './params';
import type { Terrain } from './terrain';
import type { WindField } from './wind';

export interface Moisture {
  hum: Float32Array;
  cloud: Float32Array;
  /** Rain rate this tick. */
  rain: Float32Array;
}

export const capacity = (tempC: number) => P.moisture.capBase * Math.exp(P.moisture.capPerC * tempC);

const advected = new Float32Array(N);

/** Semi-Lagrangian: look upwind one tick, sample, copy. */
function advect(f: Float32Array, wind: WindField): void {
  const k = CELLS_PER_HOUR_PER_MS;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      advected[i] = bilinear(f, x - wind.u[i] * k, y + wind.v[i] * k);
    }
  }
  f.set(advected);
}

/**
 * One weather tick of humidity, cloud and rain.
 * `lowInfluence` is 0..1 inside lows (convergence); `systemRain` is the extra rain lows drop on their track.
 */
export function stepMoisture(
  m: Moisture,
  wind: WindField,
  temp: Float32Array,
  t: Terrain,
  lowInfluence: Float32Array,
  systemRain: Float32Array,
): void {
  const c = P.moisture;
  advect(m.hum, wind);
  advect(m.cloud, wind);
  for (let i = 0; i < N; i++) {
    const u = wind.u[i], v = wind.v[i];
    const onLand = t.land[i] === 1;
    const conv = Math.min(1, lowInfluence[i]);
    const cap = capacity(temp[i]) * (1 - c.lowLift * conv);
    let h = m.hum[i], cl = m.cloud[i];

    if (!onLand) h += c.evapRate * Math.max(0, cap - h) * (1 + c.evapWind * Math.sqrt(u * u + v * v));
    if (h > cap) {
      cl += h - cap;
      h = cap;
    } else if (cl > 0) {
      const back = Math.min(c.cloudReturn * cl, cap - h);
      cl -= back;
      h += back;
    }

    const uplift = onLand ? Math.max(0, u * t.slopeE[i] + v * t.slopeN[i]) : 0;
    const trigger = c.background + c.uplift * uplift + c.convergence * conv + c.cooling * Math.max(0, v);
    let rain = cl > c.rainThreshold ? cl * Math.min(1, trigger * c.rainRate) : 0;
    cl -= rain;
    rain += systemRain[i];
    if (onLand) h += c.landReturn * rain;

    m.hum[i] = h;
    m.cloud[i] = cl;
    m.rain[i] = rain;
  }
}
