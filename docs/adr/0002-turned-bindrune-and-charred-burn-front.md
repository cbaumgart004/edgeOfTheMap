# 0002 — The bindrune turns in its viewBox, and the burn front chars in its own layer

- **Status:** Accepted
- **Date:** 2026-07-29
- **Branch:** `cleanup-v2`
- **Scope:** `Bindrune.jsx`, the footer, `.brand-mark`, `.burn-ember`

## Summary

Three requested changes: lay the footer bindrune on its side and move it to the
bottom of the footer, run the signature banner wider in the header and footer, and
give the burn front a darker, black-edged rim.

Two of them had an obvious first reach that was rejected, and both rejections are for
the same underlying reason — a value that has to *travel* with something else must be
expressed in terms of that thing, not placed at a fixed offset and trusted. That is
the same failure class §5 of `DESIGN.md` already records for `--burn` and its centre.

The third — the wider mark — is a number with a documented constraint, not a
decision; it lives in `DESIGN.md` §6 and the `--mark-w` row of the §5 token table.

Measured effect: CSS 18.26 → 18.60 kB (4.99 → 5.08 kB gzipped). The header now
renders 68.7px against the 88px `--header-h` claims, so same-page anchors still clear
the sticky bar.

---

## Decision 1 — The horizontal bindrune is a turn inside the viewBox, not a CSS rotate

**Context.** The mark is seven runes bound on one continuous stave in a 24×164
viewBox — a 1:7 column, sized by height. The footer now wants it as a band along the
bottom edge.

**Decision.** `Bindrune.jsx` takes `orientation="horizontal"`, which swaps the viewBox
to 164×24 and applies `translate(0 24) rotate(-90)` to the *contents*. The geometry
data is untouched. `.rune-bind-h` inverts the sizing rule: width is given, height
follows.

**Alternative rejected: `transform: rotate(90deg)` in CSS.** This is the one-line
version and it is what anyone would try first. Rejected because it leaves the
element's layout box lying: the box stays a 1:7 column, so the page reserves a narrow
tall column and the mark hangs out of its own footprint, overlapping the footer nav
above it. Every subsequent fix — a fabricated height, negative margins, a wrapper
sized to the rotated bounds — is arithmetic that has to be redone the next time the
mark's width changes. Turning inside the viewBox means the element *is* a 7:1 band and
ordinary layout works on it.

**Alternative rejected: a second coordinate table for the horizontal form.** Two
tables means tuning a segment tunes one form and silently leaves the other stale.
`DESIGN.md` §4 already states why the binding is kept as labelled data — every stroke
means something — and a divergent copy is exactly how a stroke's meaning gets lost.

**Why -90° and not +90°.** Head to the left, so the mark reads Wunjo-first left to
right, the way the column reads top to bottom.

**Consequence.** `Bindrune` now has a mode, and the two forms need different CSS
(`height: 100%` vs `width: 100%`) — a caller that sizes the wrong axis gets a mark
squeezed to nothing, which is the same trap the column always had, now doubled. The
component ships both rules so the caller only has to pick an orientation.

**Consequence not liked.** The clamp ceiling (`27rem`) was checked by overriding the
width, not by actually reaching the viewport that produces it: the browser window
available here would not resize past ~392px, and `vw` does not respond to CSS zoom.
The floor (`15rem`, what phones get) was verified as rendered. The ceiling is
therefore reasoned, not observed.

---

## Decision 2 — The char is its own layer above the glow, in `calc()` off `--burn`

**Context.** The burn's rim was a single radial gradient — white-hot, orange, then the
mystic violet — masked to a thin travelling band. It read as a lit ring wiping across
the page rather than as paper burning, because paper does not glow at the cut. It
chars: black at the edge, the combustion line just outside it, then a scorch browning
off into paper the fire has not reached.

**Decision.** A second gradient paints **on top** of the hot ramp: opaque near-black
through the front, falling off outward through a scorch brown. Its stops are in
`calc()` off `--burn`. The mask band's outward reach went +18px → +22px so the char
and the glow are not competing for the same few pixels.

**Alternative rejected: add a dark stop to the existing hot ramp.** The smaller edit,
and wrong. That ramp's stops are **percentages of the box**, deliberately — they are
fixed to the page, not to the front, which is what makes the rim cool as it expands
(white-hot at the origin, orange across the page, violet by the edges, which is the
face it is uncovering). A dark stop there would sit at a fixed distance from the
*origin* and the burn front would travel away from it. That is precisely the
rim-inside-its-own-hole failure `DESIGN.md` §5 records for `--burn`, reintroduced in a
different property. Anything that must ride the front belongs in `calc(var(--burn) …)`.

**Alternative rejected: char underneath the glow.** Layer order *is* the effect. Below
the glow the black is simply covered, and the point of the char is that it occludes
the glow on the consumed side so the fire reads as being at the leading edge.

**Consequence — a second full-viewport gradient inside the masked, filtered subtree.**
§5 lists three things that keep the burn affordable; this adds per-frame paint work to
the most expensive 1.8s on the site. **It was not profiled.** A gradient is cheap
next to the turbulence already running there and nothing about the filter region
changed, so this is expected to be in the noise — but "expected" is the honest word.
If the burn is ever found to drop frames, this layer is a candidate and the three
levers in §5 are still the bigger ones.

**Consequence — the effect is asymmetric between directions.** Verified by freezing
the burn mid-flight both ways. Going mystic → light the char lands on warm paper and
reads hard and clearly. Going light → mystic the inside of the hole is the dark face
already, so the black edge has little to contrast against and reads as a brown scorch
with the fire on its outer edge. Acceptable — the direction where it matters most is
the one that works best — but the two toggles no longer look like the same effect
played backwards.

---

## Not a decision: the wider `.brand-mark`

Recorded only so it is not looked for here later. `34px` became
`var(--mark-w)` — `68px` in the header, `104px` on `.footer-brand`. A token because
the two placements want different widths off the one artwork, and because the header
value is bounded: at 3:2 the mark must stay under roughly two thirds of `--header-h`
or it starts setting the header's height, and `--header-h` is the only thing keeping
same-page anchors clear of the sticky bar. That constraint is in `DESIGN.md` §6 with
the `height: auto` note it belongs next to. No alternative was rejected.
