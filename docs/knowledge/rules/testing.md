# Testing rules — World Sim

Setup and stack rules for this repo. The universal testing rules live in Shipyard's
`rules/testing.md`. **Grows only by pattern.** Where they disagree, this file wins.

## Setup

- Run `npm test` before every commit. `npm run build` (tsc + Vite) must pass too.
- Specs sit next to the code: `wind.ts` → `wind.test.ts`.
- No snapshot tests. No coverage target.

## Simulation

- Assert emergent directions and relationships (lows turn anticlockwise, trades blow from the NE),
  not tuned constants — tuning must not break tests.
- Synthetic fields (flat open sea, a single system) for local physics; a real `World` only for
  determinism and climate-wide patterns, with a short spin-up to keep the suite fast.
