# Decisions

What rarely changes: why the product exists, what it's built with, how we work. One line each;
when a decision changes, edit its line in place. No dated entries; git is the archive.

Precedence: **the human > `product-rules.md` > the code.**

Elsewhere: what must stay true → `product-rules.md` · rejected for good → `.out-of-scope/`.

## Product goals (never relitigate)

- Weather for a sailing/trade game that emerges from climate: trade lanes, storm seasons and
  breadbaskets come out of the simulation, never hand-authored.
- Source design: "Living World Weather — Design Document" (Claude Docs,
  https://claude.ai/artifact/WcfH8qUd8sqG7qjUPyxDP7).
- It must never become a fluid-dynamics or real-Earth simulation.

## Current focus

- Basic sim: terrain → seasonal climate → pressure systems → wind → moisture and rain, shown live
  on a map. Done when the belts, storm tracks and rotation in the design are visible on screen.
- **Next (not built):** ocean currents · climate classes · land state, harvest and fertility ·
  pilot charts and spin-up statistics · trade routes · anomalies · channel factor · saves.

## Stack

- TypeScript (strict), Vite, Vitest, plain canvas 2D. No framework, no runtime dependencies.
- One coarse 256×128 climate grid stands in for both the map and climate grid of the design.

## Working rules

- Report the criterion that fails; never tune a number until it passes.
- A target that failed three times gets questioned, not attempted again.
- A finding is not a scope extension: it is one line to the human when the feature closes, filed in
  their tracker or dropped.

## Open — needs the human

- Which of the "Next" items comes first.
