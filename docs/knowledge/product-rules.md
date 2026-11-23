# Product rules

What must stay true, whatever the code looks like. Only rules a reader couldn't work out from the
code, or could break without noticing. **Where the code and a rule disagree, the code is wrong.**

A change that adds or changes a rule says so in its spec or brief; the manager edits this file when
it merges. Screens and wording live in the code.

## Simulation

- Climate is a pure function of seed and terrain, built once as four seasonal snapshots and blended
  with a cosine, so there is no step at a season boundary. Weather never edits climate or terrain.
- Deterministic: every random stream is keyed on (world seed, subsystem, tick). The same seed gives
  the same world and the same weather, tick for tick.
- One wind source: `resolveWind` is the only writer; every consumer (systems, moisture, particles,
  readouts) samples it. No local overrides.
- Pressure = belts + monsoon offset + the sum of active systems' bumps (strength × exp(−d²/r²)).
  Systems are entities, not a fluid; wind, rain and sea state are derived, never stored on them.
- Every system passes through a visible Forming state before full strength.
- One weather tick = one game hour. Over budget the clock lags; a tick is never skipped.
- Every tuning number lives in `src/params.ts`, not in code.
- Gameplay shows wind on the Beaufort scale; hPa stays internal (the debug map may show it).
