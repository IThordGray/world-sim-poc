# Knowledge base

The single source of truth. **Current state only** — edit in place, git is the archive.
**WHAT** (`product-rules.md`) stays separate from **HOW** (`rules/`): swapping a tool should never
force a rule rewrite.

| File | Holds | Read by | When |
|---|---|---|---|
| [decisions.md](decisions.md) | Goals, current focus, stack, working rules, open questions | Manager, `/grill-me` | Always |
| [product-rules.md](product-rules.md) | What must stay true, whatever the code | Manager, reviewer, `/grill-me` | Always; briefs name sections |
| [rules/code.md](rules/code.md) | Stack code rules (universal ones: Shipyard's `rules/`) | Builder, reviewer | Every brief |
| [rules/testing.md](rules/testing.md) | Test setup and stack rules | Builder, reviewer | Every brief |
| [reference/](reference/) | Measurements, future-tech notes | Whoever needs it | On demand |
| `.shipyard/work/` (untracked) | Per feature in progress: a spec and one ticket per file, deleted when it closes | Manager | When planning or working a ticket |
| [../../.out-of-scope/](../../.out-of-scope/README.md) | Ideas rejected for good, one file per concept | Manager, `/grill-me` | Before planning anything new |

**Keep the always-read set small.** Check it now and then: `wc -l rules/*.md decisions.md product-rules.md`.
