# Architecture decision records

Records live here one per decision, numbered, newest last. They exist for
decisions that had a **real trade-off** — an alternative that was tried, or that a
reasonable person would reach for first — and that would otherwise be re-litigated
by whoever touches the area next.

`DESIGN.md` is the map: what the site is and how it is put together. These records
are the *why* behind the parts of that map where the obvious choice was not the one
taken. Don't restate the map here, and don't move a decision's rationale out of
here into the map.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-cleanup-v2-quality-pass.md) | Cleanup pass: shared values become tokens, atmosphere is scoped to the mystic face, fonts are subset and pre-warmed | Accepted |
| [0002](0002-turned-bindrune-and-charred-burn-front.md) | The bindrune turns inside its viewBox rather than by CSS rotate, and the burn front chars in its own layer keyed off `--burn` | Accepted |

## Writing a new one

Copy the shape of 0001: context (what was actually there), the decision, the
alternatives rejected **and why**, and the consequences — including the ones you
don't like. A record with no rejected alternative is a note, not a decision; put it
in `DESIGN.md` instead.
