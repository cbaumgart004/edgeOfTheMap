# 0003 — The Keeper gets a route, served by a hand-rolled router

- **Status:** Accepted
- **Date:** 2026-07-29
- **Branch:** `web-systems`
- **Scope:** `App.jsx`, `router.jsx`, `content.js`, `HomePage.jsx`, `KeeperPage.jsx`, `Keeper.css`

## Summary

The Web & Systems offering needed more surface than one card: data ownership, live
editing, API access, a layout gallery, marketplace builds, a healing-spaces vertical,
branding, and proof. That is a page, not a paragraph.

Two things follow, and both reverse something `DESIGN.md` states flatly. The site now
has routing, which §1 said it did not. And `App.jsx` is no longer "the whole UI", which
§2 said it was.

Measured effect: CSS 18.60 → 26.23 kB (5.08 → 6.53 kB gzipped), JS 216 → 222 kB
(69.0 → 70.8 kB gzipped). The router is ~1 kB of that; the rest is the page.

---

## Decision 1 — Add a route rather than extend the one page

**Context.** The three crafts are peers on the home page: one card each. The Keeper's
pitch is roughly nine sections long, and the other two are not.

**Decision.** `/keeper` is its own page. `PATHS` grows an optional `href`, and the nav
reads it — so when the Storyteller earns a page, it is a field in that table and
nothing else changes. This is the direction §4 already anticipated ("later splitting
one onto its own route is an edit to that table").

**Alternative rejected: a ninth section on the home page.** Cheapest, and it keeps the
no-routing decision intact. Rejected because it makes the home page's own argument
untrue: the page says *three disciplines, one point of contact* and then spends two
thirds of its length on one of them. The imbalance is visible in the scrollbar.

**Alternative rejected: an expandable deep-dive under the Keeper card.** No routing and
no permanent page length, but it puts the strongest selling material behind a click, and
it is neither linkable nor indexable. A page you cannot send someone is not a pitch.

**Consequence.** The site is no longer a single page, and the one-page assumption is
load-bearing in more places than it looks. Section §2's "`App.jsx` — the whole UI" is
gone; the shell and the pages are separate files, and every value the two share had to
move to `content.js` to stop three copies drifting.

---

## Decision 2 — ~40 lines of history API, not `react-router`

**Context.** Two routes. One layout, shared. No params, no loaders, no nested outlets,
no guards, no data fetching — the site fetches nothing at all.

**Decision.** `router.jsx`: `useRoute`, `navigate`, and a `Link` that renders a real
anchor. `pushState` deliberately does not fire `popstate`, so `navigate` synthesises
the event — which means back/forward and programmatic navigation share one listener and
one code path, and history is correct by construction rather than by being remembered.

**Alternative rejected: `react-router-dom`.** The default reach, and it would be right
the moment this site grows params or loaders. Rejected here on the same grounds §5 uses
to justify shipping no webfont on the light face: it is ~20 kB gzipped to serve two
static routes, which is three times the entire CSS bundle, for an API surface of which
this site would use four exports. The reversal is cheap — `Link` and `useRoute` are the
same two names react-router exports, so adopting it later is an import change.

**Alternative rejected: hash routing (`/#/keeper`).** No server config at all. Rejected
because the site already uses real fragments for same-page anchors, and a router that
owns the hash cannot share it with six section anchors without inventing an escape.
Real paths also need no server work here: `railway.json` already starts `serve -s dist`,
and `-s` is the SPA rewrite.

**Consequence — `Link` intercepts less than it looks like it does.** Same-document
fragment links are handed straight to the browser, on purpose. Native fragment
navigation honours `scroll-margin-top`, and clicking the same anchor twice scrolls
twice; routed through `pushState` the second click would find the URL already matching
and do nothing. The one case the browser cannot handle is a fragment on a *different*
page, and that is the case `navigate` exists for.

**Consequence — one non-obvious guard.** `href="/"` while already on `/` is, to the
browser, a full navigation: same URL, whole app remounts, ends where it started. `Link`
catches same-path-no-fragment and scrolls to top instead.

---

## Decision 3 — `useScrollReveal` re-arms per route

**Context.** The hook adds `.reveal-ready` to `<html>`, which is what turns on the
`opacity: 0` that its observer then turns off. It was a mount-only effect, which was
correct when there was one page.

**Decision.** It takes `route` as a dependency, so the observer is rebuilt and the gate
re-armed on every navigation.

**Why this is a decision and not a detail.** Left alone it is not a missing animation —
it is the catastrophic mode `DESIGN.md` §6 records, reached from a new direction. The
observer unobserves each element as it fires, so it is spent; the gate is a class on
`<html>` that outlives the page beneath it. Navigating to `/keeper` would leave
`.reveal-ready` set, every section at `opacity: 0`, and the observer watching nodes that
had been unmounted — nine screens of blank page with nothing on screen to explain it.
This is the third distinct way that gate has found to hide the whole site, which is
worth stating plainly: **any change to how pages mount must be checked against it.**

**Consequence.** Sections already revealed on the home page fade in again on return.
Correct, cheap, and unnoticeable in practice.

---

## Not a decision: pricing, and the two named sites

Recorded so they are not looked for here. The page shows **no prices** — the owner's
call, consistent with the commission framing of the other two crafts, and the closing
copy says why rather than leaving it conspicuous.

`HOSTED` in `KeeperPage.jsx` ships **two `TODO(confirm)` placeholders** beside the real
entry for this site. The owner has one or two nameable sites; the names, and permission
from anyone whose site is a client's, are outstanding. The array is deliberately shaped
so `href` is optional — a site can be named and described without being linked, which is
usually what a client will agree to.

The comparison table's right-hand column **names no competitor and must not start to.**
It describes the common shape of hosted page-builders, which is defensible; naming a
company turns each row into a factual claim about a product whose terms can change next
quarter, leaving the page stating something false with nobody watching for it.
