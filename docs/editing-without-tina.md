# Real-time editing without TinaCMS — a plan

**Status:** Draft for review. Not a decision record; when the shape below is agreed, the
choices that had real alternatives become ADRs in the platform repo.

**Tracked by:** [board item 3](../.boards/items/3.md) (the admin epic),
[item 5](../.boards/items/5.md) (editing + drag-and-drop),
[item 6](../.boards/items/6.md) (template robustness).

---

## 1. What is actually wrong with Tina

Not the editing UX. Tina's on-page editing is good, and the block model in
`tina/config.ts` is a sound design that this plan deliberately keeps the shape of. The
problems are structural, and three of them are unfixable from inside Tina:

1. **Every edit is a commit and a redeploy.** Content is git-backed, so changing a price
   means a build. That is the complaint customers actually voice.
2. **The live site depends on TinaCloud at runtime**, with no static fallback. A deploy
   whose origin is not registered there renders "Page not found" on every page while the
   build shows green — a documented footgun that has bitten in production.
3. **Per-branch content indexing.** A preview deploy fails until the branch is indexed in
   a dashboard, and a stale `TINA_BRANCH` env var silently overrides the whole resolution
   chain. This cost a real debugging session on 2026-07-23.

What Tina gives away for free and we will have to pay for: **revision history** (it is
just git), and a **schema-to-form compiler** (555 lines of `config.ts` produce the entire
editing UI).

## 2. Non-goals

- **Not a general-purpose CMS.** It serves sites we build, with block types we ship. No
  arbitrary content modelling by the customer.
- **Not multi-tenant SaaS on day one.** One deployment per customer is fine and much
  simpler; the schema below does not preclude tenancy later.
- **Not a page builder that can produce any layout.** Customers choose a structure and
  edit content within it. Unbounded layout freedom is how these products become
  unmaintainable and how every site starts looking like a template.

## 3. Architecture

### 3.1 Content store — Postgres, JSONB documents

```
sites            (id, slug, name, settings jsonb, updated_at)
pages            (id, site_id, slug, title, nav_label, nav_order,
                  show_in_nav, blocks jsonb, status, version, updated_at)
page_revisions   (id, page_id, blocks jsonb, settings jsonb,
                  author_id, note, created_at)
media            (id, site_id, url, width, height, bytes, alt, created_at)
users            (id, email, ...)          -- Supabase auth
site_members     (site_id, user_id, role)  -- owner | editor
```

`blocks` stays **one JSONB column, not a relational block table.** The array's index is
already the order (no order field exists today), a page is always read whole, and nothing
queries across blocks. Normalising it would buy nothing and make reordering a
multi-row transaction.

**`status` and `version` are the two columns that are easy to omit and expensive to add
later** — `status` gives draft/publish, `version` gives conflict detection (§3.4).

### 3.2 Read path — snapshot first, then revalidate

This is the part that has to be right, because it is simultaneously the "no redeploy"
requirement and the fix for Tina's runtime-dependency failure.

```
build time   content snapshot committed into the bundle  →  instant first paint
runtime      fetch /api/sites/:id/pages  →  swap in if newer
API down     the snapshot is still on screen; the site does not break
```

The site ships a **baked JSON snapshot** of every page, exactly the way `main.jsx`
already bakes `content/settings/index.json` at build time to avoid a theme flash. On
load it revalidates against the API and swaps in anything newer.

- An edit is live on the next visitor's revalidate — **no redeploy**, which is the whole
  point.
- First paint never waits on the network, so we do not trade Tina's problem for a
  slower page.
- **If the API is unreachable the site still renders.** Tina has no equivalent; this
  removes the entire class of "green build, dead site".

Rejected: **fetch-on-load with no snapshot** (blank first paint, and one API outage takes
every customer site down). Rejected: **ISR / server rendering** (means leaving static
hosting; `serve -s dist` on Railway is currently the entire deploy story).

### 3.3 Write path

Server actions or a small REST surface — either is fine; the marketplace's server-action
pattern is already proven and lifts almost unchanged. Every write:

1. `requireOwner()`-style gate (lift `lib/auth.ts` from `marketplace/`), **plus** a role
   check against `site_members`, which does not exist anywhere yet.
2. RLS with **no write policies at all**, so the anon key structurally cannot write and
   every mutation goes through the service role after the gate. This is already how the
   marketplace works and it is the right shape.
3. Write the row, then append a `page_revisions` row in the same transaction.

### 3.4 Saving and conflicts

Optimistic local state, debounced PATCH (~800ms after the last keystroke). Each write
sends the `version` it was based on; the server rejects a stale base and returns the
current document. Neither existing repo does this — the marketplace re-fetches
everything after each mutation and SSS's admin does the same — and it will bite the
first time two people, or one person in two tabs, edit the same page.

## 4. The editing surface

### 4.1 Same document, not an iframe

The editor is an **overlay on the real site**, mounted when an authenticated owner is
present. Not a separate admin route rendering the site in an iframe.

The pitch is "change the page on the page", and an iframe reintroduces exactly the
"separate admin panel that approximates the result" that the comparison table on
`/keeper` criticises. It also avoids a concrete trap: `sessionStorage` is shared across
same-origin iframes, so an editor shell embedding the site would collide with the
preview key already in use.

Cost: the editor's chrome shares a document with the site's CSS, so it must be
namespaced hard. The `--sd-*` discipline in `Studio.css` is the pattern — a sealed
prefix, and a rule that the editor never reads a site token.

### 4.2 Three layers, in build order

**Layer 1 — inline text.** `contentEditable` on text fields, bound to a block field path
(`blocks[2].title`). Uncontrolled, with constant text children so React never rewrites
the node after mount — the lesson from the `/keeper` edit demo, where a controlled field
fights the caret on every keystroke.

**Layer 2 — block operations.** Select, reorder by drag, duplicate, delete, insert from a
palette. Reordering is an array splice because the index *is* the order.

**Layer 3 — the three axes**, live over real content: structure, per-role type, palette.
Most of this exists — `applyTheme`/`applyUiStyle` are already exported pure DOM
functions behind a whitelist, and `useUiStyle`'s `MutationObserver` already re-renders
structure-aware components with no reload.

### 4.3 Inline for prose, side panel for structure — a hybrid, deliberately

`contentEditable` is the right tool for a heading and a paragraph and the wrong one for
`bookingOptions[].addOns[]`. Trying to edit nested repeating objects in place produces
an interface nobody can use.

So: **text edits inline; structured fields in a side panel** scoped to the selected
block. This is a real concession — the panel is the thing the ownership table calls out
as inferior — and the honest framing is that what you *see* never moves into a panel,
only what you *configure*.

## 5. The schema registry

Tina's `config.ts` is the single biggest artifact to replace: it defines field types,
`defaultItem` presets so a new block starts populated rather than blank, `ui.itemProps`
labels so a list of objects is readable, and two cross-reference validators.

A block schema registry in plain JS, one entry per block type, drives:
- the side panel's fields,
- the insert palette and its default content,
- server-side validation on write,
- and the snapshot's type checking.

**The cross-reference validation must be reimplemented or it breaks silently.**
`buttons[].service` and `bookingOptions[].addOns[].service` are free-text names resolved
case-insensitively against `service`-block titles *on the same page*. Tina validates
them on save. Without that, renaming a service quietly breaks every button pointing at
it, with nothing on screen to show it.

## 6. What leaving git costs, and how it is paid back

| Tina gave | Replacement | Cost |
| --- | --- | --- |
| Revision history (git log) | `page_revisions` on every write | 1–2 wk. **Non-optional** |
| Rollback (git revert) | Restore = copy a revision row back | included above |
| Content in the repo | Snapshot baked at build (§3.2) | included in phase 0 |
| Media in `public/uploads` | `media` table + object storage | upload is drop-in; a *library* is not |
| Schema-driven forms | The registry (§5) | 4–6 wk — the bulk of the project |
| Free branch previews | Preview against a draft `status` | deferred |

**Revision history is the one that must not slip.** Without it, moving off git is a
downgrade the customer will discover the first time they overwrite a page, and they will
be right.

## 7. Phasing

| Phase | Ships | Est. |
| --- | --- | --- |
| 0 | Postgres + read path with snapshot fallback; ~40-line render swap in LSS; **migration tooling** | 1–2 wk |
| 1 | Auth, roles, admin shell, publish/draft | 1–2 wk |
| 2 | Schema registry + side-panel editing + revisions | 4–6 wk |
| 3 | Inline text editing (layer 1) | 2–3 wk |
| 4 | Block operations + drag-and-drop (layer 2) | 2 wk |
| 5 | Live three-axis preview (layer 3) + media library | 2 wk |

**Phase 0 alone removes the redeploy complaint** even with editing still in a panel.
Phases 0–2 are a product. Phases 3–5 are what makes it better than what customers
already have rather than merely less annoying.

**Migration tooling belongs in phase 0, not later.** Neither existing repo has any —
SSS uses inline `CREATE TABLE IF NOT EXISTS`, the marketplace a hand-maintained
`schema.sql` with `add column if not exists`. `IF NOT EXISTS` silently no-ops once the
table exists, so an evolving content model breaks quietly and in production.

## 8. Traps carried in from the existing sites

- **Never animate `opacity` in a reveal.** LSS animates `translate` only, inside a
  `@supports (animation-timeline: view())` + `prefers-reduced-motion: no-preference`
  guard, because a `fill: both` animation starting at `opacity: 0` renders its
  before-phase whenever its clock has not advanced — and a page in a background tab has
  a frozen timeline. That blanked the entire site on 2026-07-22. **An editor that ever
  renders the site off-screen or in a hidden tab reproduces exactly that condition.**
- **The same trap, this repo's version:** `useScrollReveal`'s `.reveal-ready` gate hides
  every `[data-reveal]` until its observer arms, and a hidden tab delivers no
  IntersectionObserver callbacks at all.
- **`imageSide: 'auto'` recomputes on reorder.** Any new drag UI must trigger that
  recompute or images silently stop alternating.
- **A hidden tab fakes bugs.** Deferred lazy images, no observer callbacks, no
  transitions, no smooth scroll — all of which read as real breakage. Check
  `document.visibilityState` before believing any measurement.
- **`filter` runs before `mask`,** so filtering an element displaces its contents. Do not
  put a texture filter on anything containing an editable field; the caret goes with it.

## 9. Open questions

- **Where does the editor bundle live?** Shipping it to every visitor to serve one owner
  is wasteful; a dynamic import behind an auth check is the obvious answer but it means
  the editor cannot be part of the initial render path.
- **Multi-editor or single-owner for v1?** Roles are cheap to add now and expensive to
  retrofit, but "owner" meaning *any authenticated user* — the marketplace's current
  model — is genuinely adequate for a one-person practice.
- **Does the customer ever get schema access?** Adding a block type is currently a code
  change. Keeping it that way is defensible and is what §2 assumes.
- **Undo.** Revisions give coarse undo at save granularity. In-session keystroke undo
  inside `contentEditable` is a separate and much harder problem, and browsers' native
  undo stack does not survive React re-renders.
