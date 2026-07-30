# 0001 — Cleanup pass: shared values become tokens, atmosphere is scoped to the mystic face, fonts are subset and pre-warmed

- **Status:** Accepted
- **Date:** 2026-07-29
- **Branch:** `cleanup-v2`
- **Scope reviewed:** all of `src/` plus root config (~2,300 lines), not a diff

## Summary

A quality pass over the whole site — reuse, simplification, efficiency, and
altitude — applied 28 changes. The great majority were mechanical de-duplication
and are already described in `DESIGN.md` (§2 layout, §5 theming, §6 conventions);
they needed no decision and are not recorded here.

What *is* recorded here are the four decisions in that pass that had a real
trade-off, plus the three items deliberately **not** done.

Measured effect: CSS 21.88 → 18.26 kB (5.45 → 4.99 kB gzipped), emitted font files
20 → 4 (~377 → ~109 kB), JS unchanged. Every mystic token was verified in-browser to
resolve to its exact pre-change computed value, so the refactors are
behaviour-preserving rather than merely compiling.

---

## Decision 1 — A value with more than one consumer is a token

`--gutter`, `--header-h`, `--face-fade`, `--burn-x`/`--burn-y`, `--reveal-step`, and
the channel triples `--violet`/`--glow`/`--ember-hover`/`--ember-glow` all exist
because the literal was previously copied across rules that *must* agree.

**Context.** The page gutter was written out longhand in 7 rules, the face-crossfade
duration in 13, the burn origin in 4, the mystic violet and its glow in 12 at seven
different alphas. Two rules guessed independently at the sticky header's height
(`5.5rem` and `5rem`) with nothing tying either to the header.

**Why it matters more than tidiness.** In every one of these cases a missed copy is
*silent*, not visible. The gutter governs whether the header, every section eyebrow,
and the footer share a left edge. `--header-h` is the only thing keeping same-page
anchors from landing underneath the pinned header. And the burn origin is the exact
exposure the radius was already hardened against: `--burn` was deliberately
registered as a `<length>` so its two consumers could not disagree — see §5 of
`DESIGN.md` and the `~100px` rim-inside-its-own-hole incident — while the *centre*
was left as four independent literals with no such protection. Same failure mode,
same appearance (a rim lighting where the page is not dissolving), no guard.

**Alternative rejected.** Leaving the literals and relying on find-and-replace. That
is what had been happening, and it is how the two `scroll-margin-top` values drifted
apart from each other and from the header.

**Consequence.** Colours used at several alphas are now stored as channel triples
(`--violet: 122 77 231`, used as `rgb(var(--violet) / 0.6)`), which is less readable
at a glance than a hex. Accepted: a single-alpha colour stays a plain hex, so only
the hues that actually need the indirection pay for it.

---

## Decision 2 — The `-webkit-mask-image` prefixes stay in the burn

**Context.** The ember rim's mask was two byte-identical 7-line gradients carrying
twelve tuned numbers, prefixed and unprefixed. A retune reaching only one of them
would ship a different rim to one browser family — the hardest kind of visual bug to
notice, because only one engine is wrong.

**Decision.** Hoist the gradient into a `--ember-rim` custom property consumed by
both declarations. Keep both declarations.

**Alternative rejected.** Dropping the prefixed copies entirely, on the reasoning
that the file already requires `@property`, `color-mix()`, and unprefixed
`mask: url()`, all of which gate the site to newer engines than the last one needing
`-webkit-mask-image`. Rejected because the degradation paths are not equivalent:
without `@property` the burn degrades to an instant swap, which `DESIGN.md` §6
explicitly accepts as a fallback. Without a working `mask`, the cloned page has no
hole punched in it and sits **opaque over the real page for the full 1.8s**. One is a
graceful loss of an effect; the other is a page that appears frozen.

**Consequence.** The duplication is gone but the prefix remains, so the file still
looks like it is hedging on browser support. It is — deliberately, and only where
the failure is severe rather than cosmetic.

---

## Decision 3 — The light face ships no `backdrop-filter`

**Context.** The sticky header frosted its backdrop on both faces: a blur
re-resolved by the compositor on every scroll frame, for the whole session, over
content that changes every frame so nothing can be cached. It was the only
permanently-on expensive compositing path on the site, and it bought very little —
the fill over it was already 88% opaque, so roughly 12% of the blur was visible.

**Decision.** The light face is near-opaque (97%) and unblurred. The frost is scoped
to `.face.mystic-mode .site-header`. The burn's cloned header sets
`backdrop-filter: none` outright.

**Why this is a design decision and not just a perf one.** §5 of `DESIGN.md` states
the rule the light face lives by: *nothing atmospheric leaks into it — no glow, no
serif, no violet.* A frosted-glass header is atmosphere. Removing it from the
printed face brings the face into line with its own stated rule; the perf win is the
same change, not a competing motive.

**Third clause matters separately.** The burn clones the page verbatim, so in mystic
mode the clone brought a *second* blur layer with it — and that one sits inside a
subtree being masked by an animating shape, so the blur is re-resolved every frame of
the most expensive 1.8s the site has, for a strip nobody is watching while the page
tears open.

**Alternative rejected.** Keeping the blur on both faces and simply lowering the fill
opacity so more of it showed. That spends the per-frame cost to make the light face
*more* atmospheric, i.e. it buys the wrong thing.

**Consequence.** The light header is flatter. That is the intent, but it is a visible
change to a face that was otherwise not being restyled in this pass.

---

## Decision 4 — Cormorant is imported as `latin-` subsets and pre-warmed on idle

**Context.** `main.jsx` imported `@fontsource/cormorant-garamond/400.css` and
`600.css`. Those bare entrypoints declare **all five** subsets — cyrillic,
cyrillic-ext, vietnamese, latin-ext, latin — so ten `@font-face` blocks landed in the
one stylesheet that blocks first paint, where two can ever match this copy, and Vite
emitted a `.woff` fallback for each: 20 font files, ~377 kB of deploy weight, to ship
two files and ~46 kB.

Separately, the woff2 was correctly not fetched until a glyph needed it — which is
the instant the burn flips the face, 60ms in. A ~45 kB request landed on the frame
the mask transition starts, and `font-display: swap` then re-laid out the entire
document *mid-burn*: the mystic reveal arrived in system UI and snapped to serif a
beat later.

**Decision.** Import `latin-400.css` / `latin-600.css`, and warm the family once the
page is idle (`requestIdleCallback` → `document.fonts.load`, with a `setTimeout`
fallback).

**Alternatives rejected.**
- *Preloading the font in `index.html`.* Costs every light-face visitor the full
  download at high priority, including the ones who never toggle. Idle warming gets
  the same result off the critical path.
- *Accepting the mid-burn reflow.* The burn is the site's signature moment and serif
  type is half the mystic face's identity. Fetching the font *because* the toggle was
  pressed means the effect is worst exactly when it is being shown off.
- *Keeping the full subset set for safety.* No copy on the site is non-latin, and the
  Lore — the longest and most voice-dependent passage — is English.

**Consequence.** If the copy ever gains Cyrillic, Vietnamese, or extended-latin
glyphs (a name with a diacritic outside latin-1 would do it), they will fall back to
the system serif and look wrong in the mystic face only. Anyone adding such copy must
add the matching subset import. This is the sharpest edge introduced by the pass.

---

## Deliberately not done

Recorded so they are not mistaken for oversights. All three are also listed under
§8 *Open* in `DESIGN.md`.

1. **`.qr-code` is `260px`; §6 had recorded `340px`** as the decoded-and-accepted
   size. One of the two drifted and it is not determinable which from the code. At
   260px the code renders ~68px wide — above the ~57px measured as unreliable, but
   below the size actually tested. **Resolving it requires a decode test at 260px,
   not a judgement call**, so the shipped value was left alone. This is the one item
   from the pass that carries a functional risk rather than a maintenance cost.
2. **The LCP image cannot be preloaded** without either moving `logo-card.webp` to
   `public/` (breaking the "assets are imported, never referenced by path" rule in
   §6, and its cache-busting) or adding a Vite `transformIndexHtml` hook. Both are
   real trades against a documented convention, not cleanups.
3. **`qr_code.png` is a 99 kB PNG** on a site that otherwise ships WebP. Lossless
   WebP with alpha would likely cut 30–45% at identical pixels, and lossless is
   bit-exact so the scan constraint is unaffected — but it needs the derivative
   regenerated from the master and re-decoded, which is an asset pass.

## Also rejected during the pass

- **Merging `--display-font` and `--body-font`.** They hold identical values in both
  faces today, so the merge would remove two declarations. Rejected: it is a
  deliberate typographic seam, and §6 already records that the two faces set serif
  and sans to different widths.
- **Extracting the nav/footer-nav `PATHS` map into a shared component.** Three lines
  of duplication, and the data layer already absorbs the change most likely to come
  (a fourth path). Not worth a component.
