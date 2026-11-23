# World Sim

Browser prototype of the "Living World Weather" design: a procedural world whose climate belts,
pressure systems, wind and rain run as one deterministic simulation.

This repo runs on Shipyard: for anything bigger than a one-line change, work as the manager
(`/shipyard`). Knowledge: [docs/knowledge/README.md](docs/knowledge/README.md).

## Commands

- Run: `npm run dev` (Vite; `?seed=N` picks the world)
- Test: `npm test`
- Build / typecheck: `npm run build`
- Main branch: `main`

## Gotchas

- Measure sim speed from a bundle (`npx esbuild <entry> --bundle --platform=node`) or the page's
  "Tick cost" readout. Under vite-node/vitest every imported constant is a getter, so loops run
  several times slower than in the browser.
- Compare speeds in short runs (a few seconds) under the same conditions: this dev machine throttles
  under sustained load and runs 6–7× slower after about 4 s, on any code.
