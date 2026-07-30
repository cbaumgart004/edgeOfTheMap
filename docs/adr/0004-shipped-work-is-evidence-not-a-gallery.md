# 0004 — Shipped work is evidence inside a claim, never a look on offer

- **Status:** Accepted
- **Date:** 2026-07-29
- **Branch:** `web-systems`
- **Scope:** `KeeperPage.jsx`, `demoApi.js`, `ApiConsole.jsx`, `Keeper.css`

## Summary

`/keeper` shipped its first draft arguing in the abstract, with a "Currently hosting"
section of placeholders at the foot. Two real projects then came into scope — a
bodywork practice and a uranium glass marketplace — and with them a constraint from
their owners that changed the page's shape rather than just filling in its blanks.

Three decisions follow: how the work appears, what the layouts section is allowed to
promise, and what the API section demonstrates with.

Measured effect: CSS 26.23 → 28.40 kB (6.53 → 6.88 kB gzipped), JS 222 → 230 kB
(70.8 → 73.7 kB gzipped) — the console and its dataset.

---

## Decision 1 — Evidence is woven into each claim; there is no portfolio section

**Context.** The page makes seven claims and had proof for none of them until the last
screen, which is the weakest possible arrangement: the visitor is asked to believe six
sections on trust and is then shown the receipts once they have stopped reading.

**Decision.** Each section carries its own evidence. Live editing cites the practice
site, where every page is a content file the owner edits herself. The API section cites
the marketplace, which runs the production version of the endpoint being demonstrated.
The healing vertical says outright that it is described from having built one.
"Currently hosting" is behind `SHOW_HOSTED = false`.

**Alternative rejected: a case-study section, and keep the claims abstract.** The
conventional arrangement, easy to scan and easy to extend to a third project. Rejected
because it leaves every claim unevidenced until the visitor scrolls past all of them,
which is exactly the weakness being fixed.

**Alternative rejected: ship the placeholders.** A section headed "Sites running on
this, right now" containing two `TODO` cards is worse than no section: a proof section
that proves nothing costs more credibility than the gap does. The markup is kept and
gated rather than deleted, so turning it on later is one line.

**Consequence.** The projects are named in four places rather than one, so a fact about
either — a URL, a permission, a client's departure — has more than one site to be
corrected in. The `WORK` table and the `<Work>` component exist to make that a
single-line edit; **do not inline a project's name or URL in prose.**

---

## Decision 2 — Layouts are structure. The look is never reusable, and this is a promise

**Context.** The brief asked for "marketplace layouts," and the first draft read that as
a gallery of six starting designs. Both project owners then gave permission to be named
with the *same* caveat, independently: each is proud of having a site that looks like
theirs, and neither wants to become a look other people can order.

**Decision.** The section is reframed to "Structure to start from. Never a look to
share." A layout is the skeleton — what the site tracks, what a visitor can do, in what
order — and the appearance is built once, for one client. `.keeper-pledge` states this
on the page as a commitment, and cites the two projects as evidence *for* it: same
builder, no shared palette, typeface, or grid.

**Alternative rejected: keep the gallery as first specified.** It is what was asked for,
and a template gallery is the highest-converting element on every hosted builder's site.
Rejected because it would sell the one thing two real people were promised would not be
sold. The reframing loses very little — the six entries survive unchanged, because they
were already written as capabilities rather than as designs.

**Alternative rejected: drop the section.** Over-correction. Prospects genuinely need to
know whether their kind of business is one this builder has thought about, and the six
entries answer that. The problem was the promise implied by a gallery, not the list.

**Consequence — this constrains future edits, and the constraint is not visible in the
code.** Nothing in `LAYOUTS` prevents someone adding a screenshot and a "start from this
design" button, and the result would break a promise made to a named person rather than
merely being off-brand. That is why this is an ADR and not a comment.

**Consequence — the pledge is a hostage to fortune.** "No two look alike" is easy to
honour at two projects and gets harder at twenty. It is a real commitment about how the
work is done, not a marketing line, and if it ever stops being true the paragraph has to
go before the next site ships.

---

## Decision 3 — The API is demonstrated against a fictional database, really implemented

**Context.** The section claimed a real, documented API and illustrated it with a static
code block — asking the visitor to take the response on faith, in the section arguing
the API is real. The obvious upgrade was to show the marketplace's actual inventory
endpoint.

**Decision.** `demoApi.js` invents a practice — the same fictional Stillwater Massage the
edit demo already names — and **implements** the endpoints over it: filtering, cursor
pagination, a 404 carrying a next step, and a write that moves a product, draws down
every component in its bill of materials, reports threshold crossings, and refuses
entirely if any part cannot be applied. `ApiConsole.jsx` fires them for real.

**Alternative rejected: show the real marketplace endpoint and its real responses.** The
first instinct, and the owner's explicit redirection away from it: demonstrating
functionality should not put a client's records on a marketing page, even read-only,
even anonymised. A fictional dataset costs a little credibility and removes the question
entirely.

**Alternative rejected: a static code block of the fictional data.** Cheaper by an order
of magnitude. Rejected because a printed response and a computed one look identical
right up to the moment the visitor presses the button twice and watches the stock
actually fall — which is the entire argument the section is making.

**Consequence — the seed values are load-bearing and look arbitrary.** Calendula starts
*above* its low-stock threshold so the crossing can fire; the product holds four units so
the fifth press reaches the `409`. Tuning either number to something more "realistic"
silently makes a feature undemonstrable, with nothing failing to signal it. Noted in
`DESIGN.md` §4 and in the file.

**Consequence — validate-then-apply is not a transaction.** The write checks everything
that can refuse before writing anything, so the rollback is never having started. That is
honest for an in-memory demo and is the same shape the real implementation takes, but the
real one needs an actual transaction, and a reader who copies this into a server without
one has a partially-applied inventory. Said in the file's comment; said again here.
