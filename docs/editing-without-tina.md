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
- ~~**Not multi-tenant SaaS on day one.**~~ **Superseded.** This said one deployment per
  customer was fine. The decision to publish self-serve tiers (§9) overrides it: a
  customer who signs up without talking to anyone cannot be given a bespoke deployment.
  Multi-tenancy moves from "the schema does not preclude it later" to a phase-0
  requirement — which is why `sites` and `site_members` are in §3.1 rather than assumed.
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

### 4.4 The capability list

What the owner must actually be able to do, with the piece of work each one implies.
Ordered roughly by how much new machinery it needs.

| # | Capability | What it needs |
| --- | --- | --- |
| 1 | **Reorder blocks** on a page | Array splice — the index already *is* the order. Must re-run the `imageSide: 'auto'` alternation. |
| 2 | **Add a block** from a palette | Schema registry `defaultItem` presets (§5) so it lands populated, not blank. |
| 3 | **Delete / duplicate a block** | Trivial once §3.4 saving exists. Delete needs undo — see §10. |
| 4 | **Create a page** | Row insert + slug uniqueness. Lift `slugify()` + the collision loop from `marketplace/app/admin/actions.ts`. |
| 5 | **Show in nav — yes / no** | `show_in_nav` boolean. **Already exists** in the LSS page model. |
| 6 | **Reorder the navbar** | `nav_order` number. **Already exists** (`order`, missing → 999). Drag-reorder rewrites the set. |
| 7 | **Multiple images per block** | `images` is `string[]` today and must become objects. **Schema migration — see below.** |
| 8 | **Reorder images within a block** | Same splice as blocks, one level down. |
| 9 | **Move an image between blocks** | Cross-container drag. The first capability here that needs a real DnD library rather than HTML5 drag events. |
| 10 | **Per-image opacity** | New field on the image object; renders as a CSS custom property, not a filter (§8). |
| 11 | **Inline images in body copy** | Cursor-position markdown splice — **already built** in `ProductForm.tsx`, lifts almost unchanged. |
| 12 | **Customise the header / nav** | New. Nav is currently *generated* from the page list and the bar's shape is per-structure in code. |
| 13 | **Customise the footer** | New, same reason. |

**Capability 7 is a schema migration, and it is the sharp edge in this list.** LSS stores
`images: string[]`. Opacity, alt text, and a focal point all need a per-image object:

```
"images": [{ "src": "...", "alt": "...", "opacity": 0.85, "focal": [0.5, 0.35] }]
```

That is a breaking change to existing content, so it needs a migration that rewrites
every `string` to `{ src }` and a reader that tolerates both during rollout. This is
precisely the case where `CREATE TABLE IF NOT EXISTS` silently does nothing and the
content model breaks quietly — the reason migration tooling is phase 0 and not later.

**Capabilities 12 and 13 are bigger than they look.** The header and footer are not
content today. `Nav.jsx` *derives* the nav from the CMS page list, and the bar's DOM
shape is chosen by the active structure in code. Making them editable means introducing
a third content document alongside pages and settings — call it `chrome` — holding the
parts an owner may change (logo, tagline, CTA label and target, footer columns, legal
line, social links) while the *arrangement* stays the structure's business. Without that
line, "customise the header" becomes "build a general-purpose layout editor", which §2
rules out.

**Drag-and-drop needs a keyboard equivalent, not as politeness but as function.** Every
reorder above (blocks, nav, images) must be operable without a mouse. At least one of
these owners works on a tablet, and a pointer-only reorder simply fails there.

### 4.5 Media storage — and where repo storage does and does not work

Media in the repo is how LSS works today (`public/uploads`, compressed by a push-time
GitHub Action) and it has real merits: no storage bill, assets versioned with the site,
served from the same CDN as the build, and the backup story is "it is the repository".

**But it reintroduces the exact problem this project exists to remove.** Adding an image
*is* an edit. In the repo, an upload is a commit and a rebuild, so a customer adding
twelve gallery photographs triggers a deploy and waits on it — observed at 1–2 minutes
on Railway. Content would be instant and images would not, which is a worse experience
to explain than either extreme. Git also handles binaries badly: the repo grows
permanently, and it is already carrying a 2.3 MB `logo.png` and a 2 MB `QR_Complete.png`.

The split that keeps what is good about the idea:

- **Serving:** object storage, addressed by URL, no deploy. Upload is instant.
- **Owning:** a scheduled export writes media *and* a content dump back into a git repo
  the customer holds.

**Decided: repo first, object storage second.** Phase 0 keeps the existing
`public/uploads` pipeline rather than standing up new infrastructure, and the move
happens when upload latency becomes a real complaint instead of a predicted one. Two
things to hold onto while that is true. **Store media by a stable key from the start,
not by its `public/` path** — an image referenced as `/uploads/x.webp` in a hundred
content documents is a hundred rewrites at migration time, where an indirection through
the `media` table is one. And **the deploy-on-upload latency is a known, accepted, and
temporary cost** — it is the one place the product does not yet deliver what it
promises, so it should not be described to a customer as anything else.

That gives the durability and the "it is in my repository" ownership story without
putting a rebuild in the upload path — and it is a better fit for what `/keeper` already
promises: *"A full export on demand, in a format that reads without their software."*
Ownership is a property of being able to leave with everything, not of where the bytes
happen to sit while the site is running.

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

## 9. Pricing

Self-editing should be an **add-on**, and the instinct is right for three reasons — one
of which is easy to miss.

1. Not every client wants it. Some would rather send an email and have the change made.
2. It carries genuine ongoing cost: auth, object storage, backups, and a support surface
   that does not exist when nobody else can touch the site.
3. **It cannibalises billable work.** Content tweaks currently arrive as small paid jobs.
   Handing the owner the keys removes that revenue, so the add-on has to be priced to
   replace it, not merely to cover its hosting.

### What the market charges

| | Entry | Mid | Top |
| --- | --- | --- | --- |
| Wix (annual billing) | $17 Light | $29 Core / $39 Business | $159 Business Elite |
| Squarespace (annual) | $16 Basic | $23 Core / $39 Plus | $99 Advanced |
| Framer | $10 Basic | $30 Pro | $100+ Scale |
| Webflow | $25 Premium | $39 Business site | $19/seat workspace |
| Freelance maintenance retainer | $50–150 basic | **$150–250 most common** | $400+ |

Two figures matter more than the rest:

- **Framer sells a "Content Editor" seat at $10/month** — CMS access only, no design
  rights, introduced May 2026. That is the closest direct analogue in the market to what
  this add-on *is*, and it is a real signal for what "let a non-technical person edit"
  is worth as a line item.
- **Small businesses average $100–200/month** for full-service maintenance, and the most
  common freelance retainer tier is $150–250. That is the band a solo builder with a
  human relationship actually occupies.

### The positioning trap

**Do not price against Wix.** At $17–39/month Wix is self-serve with no human in it, and
anchoring near that number invites precisely the comparison this offering loses —
features per dollar — while discarding the one it wins, which is ownership plus a person
who answers. `/keeper`'s comparison table already argues on ownership and deliberately
never mentions price; the pricing should not contradict the page.

The honest comp is the **maintenance retainer**. Self-editing is a capability *of* that
relationship, not a competitor to a SaaS product.

### A structure that fits

- **Build** — project fee, quoted per job. Unchanged; matches the commission framing of
  the other two crafts.
- **Hosting & keeping** — base retainer. Certificates, backups, dependency updates,
  monitoring. Sits naturally in the $50–150 "basic plan" band.
- **Self-editing** — **+$25–50/month on top.** Above Framer's $10 content seat, because
  this includes support and a human; below a second full retainer, because the
  infrastructure is shared.

Bundled, that lands around $100–175/month — inside the small-business average, above Wix
with a defensible reason, and below the $250 ceiling where a client starts pricing an
agency instead.

### Decide before publishing a number

**A price list next to a working chooser implies self-serve.** `/keeper` currently
closes by saying the panel is the easy part and the real work is everything after, which
supports quoted project pricing. Publishing per-month tiers signals a product someone
can buy without talking to you — a different business, and one that needs phases 0–5
complete plus signup, billing and self-service onboarding, none of which are in this
plan. Pick the model first; the number follows from it.

**Decided: per site, with a seat cap.** One price covering up to ~3 editors; additional
seats charged. Keeps the simple pitch for a one-practitioner client while a larger team's
support cost still lands somewhere. The cap needs `site_members` (§3.1) to be enforceable
rather than an honour system, and enforcement should refuse the *fourth invite* with a
clear upgrade path — never silently degrade an existing editor's access.

### Decided: published tiers, self-serve

This is the largest commercial decision in the document and it reaches back into the
engineering. Publishing prices that someone can act on without a conversation means:

- **Multi-tenancy is phase 0**, not deferred (see §2, superseded).
- **Signup, billing and provisioning** are a real surface — a new customer must get a
  working site without anyone touching it. Stripe is already a dependency in
  `marketplace/`, so the billing half has a precedent to lift.
- **Template robustness stops being a nice-to-have.** A self-serve customer picks a
  structure with no one advising them, so [item 6](../.boards/items/6.md) becomes
  blocking: three skeletons covering a hero and one band cannot be the thing a stranger
  builds a business on.
- **Support scales with signups, not with relationships.** The current model has a
  natural throttle — every client came through a conversation. Published tiers remove it.

**And `/keeper`'s closing copy will contradict this.** It currently says the panel is
the easy part and the real work is everything after, which is an argument *for* quoted
project pricing. That paragraph has to change when prices go on the page, or the site
argues against its own pricing table.

## 10. Open questions

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
  undo stack does not survive React re-renders. Deleting a block (capability 3) needs at
  minimum an immediate undo affordance, because a revision restore is far too blunt for
  a misclick.
- **Where the self-serve boundary sits.** Published tiers do not have to mean a
  fully automated signup on day one — prices can be published while onboarding is
  still manual. Deciding which is being promised changes phase 1 substantially.
- **Does `chrome` (header/footer content) get revisions too?** It is edited far less
  often than pages but a bad edit is visible on every page at once, which argues yes.
- **Media export cadence.** §4.5 proposes a scheduled export to a customer-held repo.
  Nightly is simple; on-write is truer to "your data is your own" and much chattier.
