import { CELLS_PER_HOUR_PER_MS, H, N, W, wrapDx, wrapX } from './grid';
import { P } from './params';
import type { Kind, PressureSystem } from './systems';
import { beaufort } from './wind';
import type { World } from './world';

export type Layer = 'weather' | 'pressure' | 'wind' | 'temperature';

type RGB = [number, number, number];
type Stops = [number, RGB][];

function ramp(stops: Stops, v: number): RGB {
  if (v <= stops[0][0]) return stops[0][1];
  for (let k = 1; k < stops.length; k++) {
    const [v1, c1] = stops[k];
    if (v <= v1) {
      const [v0, c0] = stops[k - 1];
      const t = (v - v0) / (v1 - v0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return stops[stops.length - 1][1];
}

const SEA: Stops = [[-1, [9, 32, 58]], [-0.3, [24, 72, 110]], [0, [48, 110, 150]]];
const LAND: Stops = [[0, [104, 140, 82]], [0.25, [140, 150, 96]], [0.5, [150, 128, 96]], [0.75, [130, 118, 110]], [0.85, [235, 235, 235]]];
const PRESSURE: Stops = [[-25, [40, 60, 160]], [-8, [110, 150, 220]], [0, [235, 235, 235]], [8, [235, 160, 110]], [25, [170, 40, 40]]];
const BEAUFORT: Stops = [[0, [20, 30, 60]], [3, [40, 110, 160]], [5, [70, 170, 120]], [7, [230, 210, 80]], [9, [235, 120, 50]], [12, [180, 20, 90]]];
const TEMP: Stops = [[-20, [70, 50, 160]], [0, [120, 170, 230]], [12, [230, 230, 210]], [24, [240, 160, 80]], [35, [190, 40, 40]]];

const SYSTEM_COLOUR: Record<Kind, string> = {
  SemiPermanentHigh: '#5aa9ff', Depression: '#ff7a59', TropicalStorm: '#e05cff', Squall: '#ffd166',
};
const SYSTEM_LABEL: Record<Kind, string> = { SemiPermanentHigh: 'H', Depression: 'L', TropicalStorm: 'TS', Squall: 'Sq' };

export class Renderer {
  private readonly grid = document.createElement('canvas');
  private readonly gridCtx: CanvasRenderingContext2D;
  private readonly baseCtx: CanvasRenderingContext2D;
  private readonly trailCtx: CanvasRenderingContext2D;
  private readonly overlayCtx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private terrainRGB = new Uint8ClampedArray(N * 3);
  private systems: PressureSystem[] = [];
  private dpr = 1;
  // View: zoom level and the cell at the centre of the screen. x wraps; y keeps the view on the map.
  private zoomLevel = 1;
  private cx = W / 2;
  private cy = H / 2;
  private readonly px = new Float32Array(P.view.particles);
  private readonly py = new Float32Array(P.view.particles);
  private readonly life = new Float32Array(P.view.particles);

  constructor(private readonly base: HTMLCanvasElement, private readonly trails: HTMLCanvasElement, private readonly overlay: HTMLCanvasElement) {
    this.grid.width = W;
    this.grid.height = H;
    this.gridCtx = this.grid.getContext('2d')!;
    this.baseCtx = base.getContext('2d')!;
    this.trailCtx = trails.getContext('2d')!;
    this.overlayCtx = overlay.getContext('2d')!;
    this.image = this.gridCtx.createImageData(W, H);
    for (let k = 0; k < this.px.length; k++) this.respawn(k);
  }

  get zoom(): number { return this.zoomLevel; }
  private get viewW(): number { return W / this.zoomLevel; }
  private get viewH(): number { return H / this.zoomLevel; }
  private get left(): number { return this.cx - this.viewW / 2; }
  private get top(): number { return this.cy - this.viewH / 2; }
  /** Screen pixels per cell at the current zoom. */
  private get ppc(): number { return this.base.width / this.viewW; }

  /** Terrain colours depend only on the world, so they are computed once per world. */
  setWorld(world: World): void {
    const e = world.terrain.elev;
    for (let i = 0; i < N; i++) {
      const c = ramp(e[i] < 0 ? SEA : LAND, e[i]);
      this.terrainRGB[i * 3] = c[0];
      this.terrainRGB[i * 3 + 1] = c[1];
      this.terrainRGB[i * 3 + 2] = c[2];
    }
    this.clearTrails();
  }

  resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    for (const c of [this.base, this.trails, this.overlay]) {
      c.width = Math.round(c.clientWidth * this.dpr);
      c.height = Math.round(c.clientHeight * this.dpr);
    }
    this.redrawView();
  }

  /** Cell under a point given as a fraction (0..1) of the map's width and height. */
  toCell(fx: number, fy: number): { x: number; y: number } {
    return {
      x: wrapX(this.left + fx * this.viewW - 0.5),
      y: Math.min(H - 1, Math.max(0, this.top + fy * this.viewH - 0.5)),
    };
  }

  /** Zoom by `factor`, keeping the point at (fx, fy) where it is on screen. */
  zoomAt(factor: number, fx = 0.5, fy = 0.5): void {
    const anchorX = this.left + fx * this.viewW, anchorY = this.top + fy * this.viewH;
    this.zoomLevel = Math.min(P.view.maxZoom, Math.max(1, this.zoomLevel * factor));
    this.setCentre(anchorX - (fx - 0.5) * this.viewW, anchorY - (fy - 0.5) * this.viewH);
  }

  /** Pan by a fraction of the view's width and height. */
  panBy(dfx: number, dfy: number): void {
    this.setCentre(this.cx - dfx * this.viewW, this.cy - dfy * this.viewH);
  }

  resetView(): void {
    this.zoomLevel = 1;
    this.setCentre(W / 2, H / 2);
  }

  private setCentre(x: number, y: number): void {
    const half = this.viewH / 2;
    this.cx = wrapX(x);
    this.cy = Math.min(H - half, Math.max(half, y));
    this.clearTrails();
    for (let k = 0; k < this.px.length; k++) this.respawn(k);
    this.redrawView();
  }

  private redrawView(): void {
    this.drawBase();
    this.drawSystems(this.systems);
  }

  /** Repaint the grid layer. Called once per weather tick, not per frame. */
  paintBase(world: World, layer: Layer): void {
    const d = this.image.data, t = this.terrainRGB, land = world.terrain.land;
    const { cloud, rain } = world.moisture;
    const { u, v } = world.windNext;
    for (let i = 0; i < N; i++) {
      let r = t[i * 3], g = t[i * 3 + 1], b = t[i * 3 + 2];
      if (layer === 'weather') {
        const ca = Math.min(0.8, Math.max(0, cloud[i] - 1) / P.view.cloudFull);
        r += (225 - r) * ca; g += (230 - g) * ca; b += (238 - b) * ca;
        const ra = Math.min(0.85, rain[i] / P.view.rainFull);
        r += (40 - r) * ra; g += (90 - g) * ra; b += (200 - b) * ra;
      } else {
        let c: RGB;
        if (layer === 'pressure') c = ramp(PRESSURE, world.pressure[i] - P.belts.baseHPa);
        else if (layer === 'wind') c = ramp(BEAUFORT, beaufort(Math.sqrt(u[i] * u[i] + v[i] * v[i])));
        else c = ramp(TEMP, world.temp[i]);
        // Keep coastlines readable: land shows through slightly.
        const k = land[i] ? 0.35 : 0;
        r = c[0] * (1 - k) + r * k; g = c[1] * (1 - k) + g * k; b = c[2] * (1 - k) + b * k;
      }
      d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
    }
    this.gridCtx.putImageData(this.image, 0, 0);
    this.drawBase();
  }

  /** Draw the grid image through the view; copies either side cover the east–west seam. */
  private drawBase(): void {
    const ctx = this.baseCtx, ppc = this.ppc;
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, this.base.width, this.base.height);
    for (const off of [-W, 0, W]) {
      const dx = (off - this.left) * ppc;
      if (dx > this.base.width || dx + W * ppc < 0) continue;
      ctx.drawImage(this.grid, dx, -this.top * ppc, W * ppc, H * ppc);
    }
  }

  drawSystems(systems: PressureSystem[]): void {
    this.systems = systems;
    const ctx = this.overlayCtx, ppc = this.ppc, d = this.dpr;
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    ctx.lineWidth = 1.5 * d;
    ctx.font = `${Math.round(12 * d)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const sys of systems) {
      const forming = sys.state === 'Forming';
      ctx.strokeStyle = SYSTEM_COLOUR[sys.kind];
      ctx.fillStyle = SYSTEM_COLOUR[sys.kind];
      ctx.globalAlpha = forming ? 0.6 : 1;
      ctx.setLineDash(forming ? [6 * d, 5 * d] : []);
      const r = sys.radius * ppc * (sys.kind === 'SemiPermanentHigh' ? 0.5 : 1);
      const cy = (sys.y + 0.5 - this.top) * ppc;
      // A ring near the seam can show on both sides of the view.
      for (const off of [-W, 0, W]) {
        const cx = (sys.x + off + 0.5 - this.left) * ppc;
        if (cx + r < 0 || cx - r > this.overlay.width || cy + r < 0 || cy - r > this.overlay.height) continue;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillText(SYSTEM_LABEL[sys.kind], cx, cy);
        if (sys.kind !== 'Squall') ctx.fillText(`${Math.round(P.belts.baseHPa + sys.strength)}`, cx, cy + r + 10 * d);
      }
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }

  clearTrails(): void {
    this.trailCtx.clearRect(0, 0, this.trails.width, this.trails.height);
  }

  /** Particles live only in the visible part of the map. */
  private respawn(k: number): void {
    this.px[k] = wrapX(this.left + Math.random() * this.viewW);
    this.py[k] = Math.min(H - 1, this.top + Math.random() * this.viewH);
    this.life[k] = 1 + Math.random() * 4;
  }

  /**
   * Particles sample the same wind every consumer does. They move at a fixed pace on screen,
   * whatever the game speed or zoom.
   */
  stepParticles(world: World, frac: number, dtSeconds: number): void {
    const ctx = this.trailCtx, ppc = this.ppc;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, 0, this.trails.width, this.trails.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.2 * this.dpr;
    ctx.beginPath();
    const k = (CELLS_PER_HOUR_PER_MS * P.view.visualHoursPerSecond * dtSeconds) / this.zoomLevel;
    const halfW = this.viewW / 2, midX = this.trails.width / 2, top = this.top, bottom = top + this.viewH;
    for (let p = 0; p < this.px.length; p++) {
      const x0 = this.px[p], y0 = this.py[p];
      const w = world.windAt(x0, y0, frac);
      const x1 = wrapX(x0 + w.u * k), y1 = y0 - w.v * k;
      this.life[p] -= dtSeconds;
      // Screen x relative to the view centre, so the seam never splits a segment.
      const d0 = wrapDx(x0 + 0.5 - this.cx), d1 = wrapDx(x1 + 0.5 - this.cx);
      if (this.life[p] <= 0 || y1 < Math.max(0, top) || y1 > Math.min(H - 1, bottom) || Math.abs(d1) > halfW || Math.abs(d1 - d0) > halfW) {
        this.respawn(p);
        continue;
      }
      ctx.moveTo(midX + d0 * ppc, (y0 + 0.5 - top) * ppc);
      ctx.lineTo(midX + d1 * ppc, (y1 + 0.5 - top) * ppc);
      this.px[p] = x1;
      this.py[p] = y1;
    }
    ctx.stroke();
  }
}
