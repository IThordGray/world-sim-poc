import { latOfRow, W } from './grid';
import { capacity } from './moisture';
import { P } from './params';
import { Renderer, type Layer } from './render';
import { World } from './world';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SEASONS = ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'];
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const SPEED_LABELS = ['1 h/s', '6 h/s', '1 day/s', '3 days/s'];

const renderer = new Renderer($('base'), $('trails'), $('overlay'));
const status = $('status');
const seedInput = $<HTMLInputElement>('seed');
const layerSelect = $<HTMLSelectElement>('layer');
const particles = $<HTMLInputElement>('particles');

let world: World | null = null;
let layer: Layer = 'weather';
let playing = true;
let speed = P.view.speeds[1];
let pendingHours = 0;
let tickCostMs = 0;
let lagging = false;
let hover: { x: number; y: number } | null = null;

function dl(el: HTMLElement, rows: [string, string][]): void {
  el.replaceChildren(...rows.flatMap(([k, v]) => {
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = k;
    dd.textContent = v;
    return [dt, dd];
  }));
}

function showTime(w: World): void {
  const day = w.dayOfYear % 30 + 1;
  const counts: Record<string, number> = {};
  for (const s of w.systems) counts[s.kind] = (counts[s.kind] ?? 0) + 1;
  dl($('time'), [
    ['Date', `Year ${w.year}, ${MONTHS[w.month]} ${day}, ${String(w.hour).padStart(2, '0')}:00`],
    ['Season', SEASONS[w.month]],
    ['Systems', `${counts.Depression ?? 0} lows · ${counts.TropicalStorm ?? 0} tropical · ${counts.Squall ?? 0} squalls`],
    ['Tick cost', `${tickCostMs.toFixed(1)} ms${lagging ? ' (clock lagging)' : ''}`],
  ]);
}

function showCell(w: World, frac: number): void {
  if (!hover) return;
  const { x, y } = hover;
  const i = Math.floor(y) * W + Math.floor(x);
  const s = w.windAt(x, y, frac);
  const from = COMPASS[Math.round(((Math.atan2(-s.u, -s.v) * 180) / Math.PI + 360) / 22.5) % 16];
  const rh = (100 * w.moisture.hum[i]) / capacity(w.temp[i]);
  dl($('cell'), [
    ['Position', `${latOfRow(y).toFixed(1)}°N, ${w.terrain.land[i] ? 'land' : 'sea'}`],
    ['Temperature', `${w.temp[i].toFixed(1)} °C`],
    ['Pressure', `${w.pressure[i].toFixed(0)} hPa`],
    ['Wind', s.beaufort === 0 ? 'Calm' : `from ${from}, Beaufort ${s.beaufort}`],
    ['Speed', `${s.speed.toFixed(1)} m/s, gusts ±${Math.abs(w.gustAt(x, y, s)).toFixed(1)}`],
    ['Humidity', `${Math.min(100, rh).toFixed(0)}%`],
    ['Rain', `${w.moisture.rain[i].toFixed(2)} / h`],
  ]);
}

function redraw(w: World): void {
  renderer.paintBase(w, layer);
  renderer.drawSystems(w.systems);
  showTime(w);
}

function generate(seed: number): void {
  world = null;
  status.hidden = false;
  // Let the "Generating" message paint before world-gen blocks the thread.
  requestAnimationFrame(() => setTimeout(() => {
    world = new World(seed);
    renderer.setWorld(world);
    status.hidden = true;
    pendingHours = 0;
    redraw(world);
  }));
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (world) {
    if (playing) pendingHours += dt * speed;
    // Over budget, cap ticks per frame and let game time lag; never skip a tick.
    lagging = pendingHours > P.maxTicksPerFrame;
    if (lagging) pendingHours = P.maxTicksPerFrame;
    let ran = 0;
    const t0 = performance.now();
    while (pendingHours >= 1 && ran < P.maxTicksPerFrame) {
      world.step();
      pendingHours -= 1;
      ran++;
    }
    if (ran) {
      tickCostMs = tickCostMs * 0.9 + ((performance.now() - t0) / ran) * 0.1;
      redraw(world);
    }
    const frac = Math.min(1, pendingHours);
    if (particles.checked) renderer.stepParticles(world, frac, dt);
    if (ran || hover) showCell(world, frac);
  }
  requestAnimationFrame(frame);
}

// Controls
$('play').addEventListener('click', (e) => {
  playing = !playing;
  (e.currentTarget as HTMLElement).textContent = playing ? 'Pause' : 'Play';
});
const speedGroup = $('speeds');
P.view.speeds.forEach((hoursPerSecond, k) => {
  const b = document.createElement('button');
  b.textContent = SPEED_LABELS[k];
  b.setAttribute('aria-pressed', String(hoursPerSecond === speed));
  b.addEventListener('click', () => {
    speed = hoursPerSecond;
    speedGroup.querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
  });
  speedGroup.append(b);
});
layerSelect.addEventListener('change', () => {
  layer = layerSelect.value as Layer;
  if (world) renderer.paintBase(world, layer);
});
particles.addEventListener('change', () => renderer.clearTrails());
$('regen').addEventListener('click', () => {
  const seed = Math.max(0, Math.floor(Number(seedInput.value) || 0));
  history.replaceState(null, '', `?seed=${seed}`);
  generate(seed);
});

// Map: wheel zooms toward the cursor, drag pans, double-click zooms in.
const map = $('map');
const zoomLabel = $('zoom-level');
const fraction = (e: MouseEvent) => {
  const r = map.getBoundingClientRect();
  return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, r };
};
const showZoom = () => { zoomLabel.textContent = `${renderer.zoom.toFixed(1)}×`; };
const zoomBy = (factor: number, fx?: number, fy?: number) => {
  renderer.zoomAt(factor, fx, fy);
  showZoom();
};
let drag: { x: number; y: number } | null = null;
map.addEventListener('wheel', (e) => {
  e.preventDefault();
  const { fx, fy } = fraction(e);
  zoomBy(e.deltaY < 0 ? 1.25 : 0.8, fx, fy);
}, { passive: false });
map.addEventListener('dblclick', (e) => {
  const { fx, fy } = fraction(e);
  zoomBy(2, fx, fy);
});
map.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY };
  map.setPointerCapture(e.pointerId);
  map.classList.add('dragging');
});
map.addEventListener('pointerup', () => {
  drag = null;
  map.classList.remove('dragging');
});
map.addEventListener('pointermove', (e) => {
  const { fx, fy, r } = fraction(e);
  if (drag && (e.clientX !== drag.x || e.clientY !== drag.y)) {
    renderer.panBy((e.clientX - drag.x) / r.width, (e.clientY - drag.y) / r.height);
    drag = { x: e.clientX, y: e.clientY };
  }
  hover = renderer.toCell(Math.min(1, Math.max(0, fx)), Math.min(1, Math.max(0, fy)));
});
map.addEventListener('pointerleave', () => { if (!drag) hover = null; });
$('zoom-in').addEventListener('click', () => zoomBy(2));
$('zoom-out').addEventListener('click', () => zoomBy(0.5));
$('zoom-reset').addEventListener('click', () => {
  renderer.resetView();
  showZoom();
});
new ResizeObserver(() => renderer.resize()).observe(map);

const initialSeed = Number(new URLSearchParams(location.search).get('seed') ?? P.seed) || P.seed;
seedInput.value = String(initialSeed);
generate(initialSeed);
requestAnimationFrame(frame);
