# 0005 — Site modes are a primitive, scoped to an element, with the default as the null case

- **Status:** Accepted
- **Date:** 2026-07-29
- **Branch:** `web-systems`
- **Scope:** `src/useSiteMode.js`, `src/App.jsx`, `DESIGN.md` §3

## Summary

Three sites in this workshop ship a whole-page presentation toggle, and all three had
re-derived the same bookkeeping independently: this site's light ⇄ mystic faces, Live
Spirit Seeds' season × UX-style (4 × 4 = 16 combinations), and StoryShaped Studios'
daylight ⇄ blacklight. A fourth is likely, since the pattern keeps being what customers
actually ask for.

Comparing the three showed they reduce to the same three steps — read an initial value,
write it to the DOM, persist it — differing only in the source of truth. That is what
`useSiteMode` extracts. It deliberately does **not** extract the CSS, the asset
strategy, or the transition, for reasons below.

Measured effect: JS 230.29 → 231.69 kB (73.73 → 74.30 kB gzipped). No behaviour change.

---

## Decision 1 — The primitive owns the bookkeeping, not the look

**Context.** The obvious version of "share the theming code" is a theming system: a
provider, a token registry, maybe a `<ThemeProvider>` that owns the palette. That is
what most codebases reach for.

**Decision.** `useSiteMode` owns exactly four things: the enumerated value list (and
the validator, class-strip set and cycle order derived from it), where the class is
written, how the value persists, and the class name for a caller-rendered wrapper. It
touches no colours, no tokens, no transitions.

**Alternative rejected: a theming system that owns the tokens.** Rejected because the
three implementations agree on almost nothing about *what* a mode changes. This site's
faces differ in colour, shape, rhythm, pace, typeface, DOM and — in two sanctioned
places — content. Live Spirit Seeds runs two axes that are contractually forbidden from
overlapping: a season may only touch 12 colour properties, a style may only touch
structure and type. StoryShaped changes colour and applies per-mode `hue-rotate` to
photographs. A shared abstraction over those three would have to permit everything,
which is to say it would constrain nothing while making all three harder to read.

**Consequence.** Adopting it buys less than it looks like. It removed ~6 lines from
`App.jsx`. The value is not the deletion — it is that the four rules below are now
stated once and enforced, instead of being re-decided per site with two of the three
getting a different answer.

---

## Decision 2 — Scope is an element, not `<body>`

**Context.** Two of the three existing implementations write only to `<body>`, which is
the simpler design and covers the common case.

**Decision.** `useSiteMode` returns a `className` for a wrapper the caller renders, and
`applyMode` takes any element. `<body>` writing is a flag, on by default.

**Alternative rejected: body-only.** It would have been smaller and would have covered
Live Spirit Seeds and StoryShaped exactly. Rejected because it would have made this
site's signature interaction unimplementable. The burn keeps **two renderings of the
page alive at once** — a detached clone holding the outgoing face, over the live page
already flipped to the incoming one. That works only because custom properties resolve
from the nearest declaring ancestor, so a clone carrying a bare `.face` renders light
while sitting inside a `body.mystic-mode`. With the class only on `<body>`, both
renderings would resolve the same tokens and the effect would degrade to a cross-fade
of a page with itself.

**Consequence.** Component rules must stay `.face.mystic-mode .foo` and never
`.mystic-mode .foo` — the looser selector matches through the body class and drags the
clone into the incoming face. This was already true and already documented in
`DESIGN.md` §3; the primitive does not enforce it, and cannot.

---

## Decision 3 — The first value is the null case and takes no class

**Context.** The mechanical choice is a class per value: `face-light` and
`face-mystic`, symmetric and easy to reason about.

**Decision.** The first entry in `values` is the default and gets **no class at all**.
Its styling is the plain token block; every other value is an override on top.

**Alternative rejected: a class for every value.** Rejected on the evidence that both
mature implementations rejected it independently without coordinating. This site's
light face is the bare `:root, .face` declaration. Live Spirit Seeds' `ui-styles.css`
carries a comment explaining that `body.style-watercolor` matches nothing in the file
on purpose. A class for the default means the "normal" appearance has two possible
homes — the base rules and the default's own block — and the second one accumulates
things that should have been in the first.

**Consequence — one real cost.** A rule that wants to target *only* the default has
nothing to hook, and must be written as a negation or as a base rule the overrides
undo. That is the trade, and it is the right way round: the default should be cheap to
render and the exceptions should pay.

---

## Not a decision: persistence stays `none` here

Recorded so it is not mistaken for an oversight. `useSiteMode` ships four persistence
adapters — `localStorage`, `sessionStorage`, `url`, and `none` — which between them
cover all three existing sites exactly. **This site uses `none`**, preserving today's
behaviour: mystic does not survive a reload and cannot be shared by URL.

That is a real gap, not a feature. Restoring a mode means applying it before first
paint, or the page renders light and snaps. There are two known-good answers in this
workshop and neither is wired up here: Live Spirit Seeds gates paint with
`html { visibility: hidden }` and bakes the value at build time from git-backed
content; StoryShaped reads `localStorage` synchronously in a `useState` initialiser so
React's first render is already correct.

The second is nearly free and would work here — the hook already reads synchronously in
its initialiser for exactly that reason. It was not done because this pass is a
no-behaviour-change refactor, and adding persistence changes what a returning visitor
sees. It is filed as a board item rather than smuggled in.

## Not a decision: what the primitive refuses to cover

Two gaps are deliberate and should stay gaps.

**Assets.** Tokens cannot recolour a bitmap, and all three sites hit this and answered
differently: Live Spirit Seeds split a 26 MB SVG into three layers driven by a
`--tagline-hue` token; StoryShaped drops an opaque black logo background with
`mix-blend-mode: screen` and swings the hue per mode; this site uses artwork that reads
in both faces and gives it a face-independent field colour. There is no common
mechanism here, only a question every mode has to answer.

**Transitions and reduced motion.** A 1.8s masked burn, a 0.6s CSS transition, and an
instant class swap are not variants of one thing, and the three reduced-motion
strategies differ accordingly — a JS branch that skips the animation entirely here, a
`@supports` guard around the whole reveal system on Live Spirit Seeds, and a blanket
`transition-duration: 0.001ms !important` on StoryShaped. The hook changes the value;
what happens visually in between belongs to the site.
