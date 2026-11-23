# Code rules — World Sim

Stack rules for this repo. The universal *Do less* principles live in Shipyard's
`rules/code.md`; each rule here names the principle it serves ([P1]–[P10]). **Grows only by
pattern.** Where this file and Shipyard's rules disagree, this file wins.

## TypeScript simulation

- [P3] Per-cell loops run 32k times a tick: typed arrays allocated once at module or world level,
  no allocation, closures or `Math.hypot` inside them.
- [P5] The base map repaints once per weather tick; only particles draw every frame.
- [P8] A speed claim comes from a bundled run or the page's tick cost, never from vite-node.
- [P10] Grid vectors are (east, north) in m/s; rows grow southward. Convert at the boundary
  (`y -= v`), never mix conventions inside a function.
