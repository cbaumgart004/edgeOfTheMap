# Edge of the Map — Design Map

A single-page marketing site for **Edge of the Map LLC**, a two-sided personal brand:
**The Keeper** (full-stack development, systems design) and **The Storyteller**
(audiobook narration, voice artistry).

This file is a *map*, not a spec. It should stay short enough to read in one sitting.

---

## 1. Stack

| Concern | Choice |
| --- | --- |
| Build | Vite 6 |
| UI | React 19 (`@vitejs/plugin-react`) |
| Language | Plain JSX — no TypeScript |
| Styling | Hand-written CSS with custom properties. No framework, no CSS modules. |
| Fonts | `@fontsource/lato`, `@fontsource/cormorant-garamond` — self-hosted, bundled. |
| Routing | None — one page |
| State | `useState` in `App.jsx`. No store, no context. |
| Tests | None |

Scripts: `npm run dev` (Vite dev server), `npm run build`, `npm run preview`.

> `build` invokes `node ./node_modules/vite/bin/vite.js build` rather than bare `vite`.
> This is deliberate — the deploy host does not reliably put `vite` on `PATH`.

---

## 2. Layout

```
index.html              Shell. Mounts #root, loads src/main.jsx as a module.
DESIGN.md               This file.
vite.config.js          React plugin, root '.', outDir 'dist'.
nixpacks.toml           Railway build phases.
railway.json            Railway build command + output dir.

src/
  main.jsx              React root (StrictMode). Imports the font faces → <App />
  App.jsx               The whole UI + the PATHS table (§4).
  App.css               Theme tokens, both faces, layout, the burn.
  Rune.jsx              Elder Futhark glyphs as SVG (§4). Exports RUNE_NAMES.
  RuneFrame.jsx         Inscribed rune border for mystic cards (§5).
  SvgDefs.jsx           Shared SVG filters: #burn-displace, #driftwood (§5).
  index.css             Reset: zero margins, full-height root, border-box.
  assets/
    logo-card.webp      Hero logo card, 800×533 (43 KB). Imported by App.jsx.
    hero-wide.webp      Mystic plate, 1536×792 (116 KB). Imported by App.jsx.
    hero-narrow.webp    Mystic plate, 960×495 (40 KB). srcSet partner.
    logo_signature.png  Header + footer mark (67 KB). Imported by App.jsx.
    logo.png            Full-resolution master (1.8 MB). Not imported — see §6.
    qr_code.png         The QR actually shipped (99 KB, 500×750). Imported by App.jsx.
    QR_Complete.png     Full-resolution master (2 MB). Not imported — see §6.
```

`public/` holds exactly two files — `banner.webp` (1536×512, 3:1) and `og.webp`
(1200×630) — because both need **stable URLs**: the social card is referenced by
absolute URL from `index.html`, and a content-hashed filename would break every time
the bundle rebuilt. Everything else is imported through the bundler so it gets
hashed and cache-busted. Add to `public/` only when a URL has to survive a rebuild.

---

## 3. Runtime architecture

One component, three small hooks, no store.

```
main.jsx  ──renders──>  App
                         │
                         ├─ useState: isMystic
                         │    └─ useEffect: body.classList.toggle('mystic-mode', …)
                         ├─ usePastHero()      → pins .site-header past 65% of the hero
                         └─ useScrollReveal()  → IntersectionObserver adds .is-visible
                                                  to every [data-reveal]
```

`App` renders a fixed structure: a sticky `.site-header`, a two-column `.hero`
(copy left, logo card right — the dark plate behind it is only lit in mystic mode),
`.services` holding one `.card` per entry in the `PATHS` table, a `.cta-band`,
`.qr-section`, and the footer. Nothing is fetched, nothing is persisted, there are
no routes; the nav is same-page anchors.

**Where the mode class lives.** It goes on **both** `<body>` and a `.face` wrapper
around the whole page, and the token block is declared for both
(`body.mystic-mode, .face.mystic-mode`). Body carries it so mystic mode repaints the
whole viewport — `.container` is `max-width: 1200px` and centred, so a class there
leaves the gutters unstyled — and the body-level texture layers key off it.

`.face` carries it so that a **detached copy of the page can hold the opposite face**,
which is what the burn needs: custom properties resolve from the nearest declaring
ancestor, so a clone with a bare `.face` renders light even while sitting inside a
`body.mystic-mode`. That is why component rules are `.face.mystic-mode .foo` and not
`.mystic-mode .foo` — the looser form would match through the body class and drag the
clone into the new face with it.

---

## 4. Domain model

The site expresses one idea: a single practitioner, three crafts. Each craft is a
**path**, defined by an entry in the `PATHS` array in `App.jsx` — adding a fourth,
or later splitting one onto its own route, is an edit to that table rather than a
layout rewrite.

Each entry carries both faces' copy — `blurb` and `loreBlurb` (§5) — alongside its
rune, CTA and subject line.

| Path | Discipline | Rune | Accent | CTA |
| --- | --- | --- | --- | --- |
| The Keeper | Web & Systems | Othala ᛟ | `--accent-keeper` | Build with Me |
| The Storyteller | Audio Narration | Ansuz ᚨ | `--accent-storyteller` | Speak with Me |
| The Wright | Woodworking | Berkano ᛒ | `--accent-wright` | Make with Me |

**Why one site and not three.** The brand is the umbrella and the tagline already
names the crafts. Three domains would split SEO authority, triple maintenance, and
leave each thin. The audiences genuinely differ — publishers and authors are not
furniture commissioners — but that is a job for distinct sections or routes inside
one site. It is also the reversible direction: splitting later is easy, merging is
not. If woodworking ever needs a storefront, it earns a subdomain then.

**Rune choice is by meaning, not shape** — see the header comment in `Rune.jsx`.
Othala is the inherited homestead, the domain one *keeps*. Ansuz is the god-rune of
speech and the spoken word. Berkano is the birch — growth, and literally wood.

A fourth rune sits outside the `PATHS` table: **Raidō (ᚱ), the journey**, reserved
for the mode toggle — the control that carries you between the site's two worlds
rather than describing a craft.

**CTAs are `mailto:` links**, each carrying a per-path subject line (`subject` in the
`PATHS` table) so an enquiry arrives already filed by discipline. There is no backend
and no form service — the site is static, and `mailto` needs neither. If a real form
is ever wanted it needs a third-party endpoint; that is a deliberate trade, not an
oversight.

`MAKER_NAME` in `App.jsx` is `Chris Baumgart`, inferred from the repo owner and not
yet confirmed. It appears in the About copy only.

`CONTACT_EMAIL` in `App.jsx` is `keeper@theedgeofthemap.com`. Every CTA and the
contact band resolve from that one constant. If the crafts ever want separate
inboxes — `storyteller@`, `wright@` — add an `email` field to `PATHS` and fall back
to `CONTACT_EMAIL`; the subject lines already file enquiries by discipline, so this
is only worth doing if the volume justifies separate mailboxes.

**The QR.** `qr_code.png` is branded artwork — a dragon coiled around a rune circle —
with a QR at its centre encoding `https://theedgeofthemap.com`, the site's own
canonical URL. It is also rendered as a link to that URL, so it works by tap as well
as by scan. `SITE_URL` in `App.jsx` is the single source for both.

---

## 5. Theming

**The site has two faces, deliberately far apart. The distance is the point.**

*Default* is an ordinary light product site: white surfaces, one teal accent, system
UI type, bordered cards with soft shadows, a conventional header and CTA band. It
should read as a legitimate tech company and nothing else. **Nothing atmospheric
leaks into it** — no glow, no serif, no violet, no dragons. If a change makes the
default face more mystical, it belongs behind the toggle instead.

*Mystic mode* (`body.mystic-mode`) is the opposite pole: dark violet, Cormorant
Garamond, the dragon plate lit behind the hero, glow on the logo and runes.

**Two places break the "only tokens change" rule, deliberately.** `.about` swaps
its *content*: **About** in the light face — a straight professional bio — and
**Lore** in mystic, which tells the same three-trades fact as cosmology: one trunk,
three branches, all of it star stuff, the shared thing being wonder. `AboutProfessional`
and `AboutLore` in `App.jsx`; the nav label swaps with it.

Lore is written in the owner's own voice and seeded from his own draft — earnest,
polysyndetic (*And… And… And…*), fragments as sentences, repetition rather than
variation, the cosmic register colliding with the small and concrete. **It carries no
irony and no punchlines**, and it does not reach for fantasy furniture; an earlier
draft leaned on dragons and witty asides and read as machine-written. If you edit this
section, match that voice or leave it alone.

The second break is the **service cards**, which carry two summaries: `blurb` for the
light face and `loreBlurb` for mystic, both in `PATHS`. The cards render in both faces,
so a single field would have leaked the mystic voice into daylight. `points` and the
CTAs stay shared — they are functional inventory and read straight in either face.
Everywhere else, keep to tokens. This is the payoff for
the toggle: the light face earns trust, the dark face rewards the visitor who pulled
the thread. Everywhere else, keep to tokens.

The positioning follows from it. The site does **not** argue that woodworking,
software, and narration are secretly one discipline — that reads as contrived. What
they actually share is stated plainly: they are all commission work, the maker is
the whole supply chain, and all three produce things people live with for years. The
unifying element is the person, not a synthetic through-line.

Both faces re-declare the same token names, so component rules never branch on mode:

| Token | Default | Mystic |
| --- | --- | --- |
| `--bg` | `#ffffff` | `#101018` |
| `--bg-subtle` | `#f6f7f9` | `#15131f` |
| `--surface` | `#ffffff` | `#191527` |
| `--border` | `#e3e6ea` | `rgba(122,77,231,.34)` |
| `--ink` | `#14161a` (~16:1) | `#ece5ff` |
| `--ink-muted` | `#5b6472` (~6.6:1) | `#aba0c6` |
| `--accent` | `#0f766e` teal | `#a1e7f5` ghost blue |
| `--accent-soft` | `#e6f4f1` | `rgba(122,77,231,.22)` |
| `--display-font` | system UI stack | Cormorant Garamond |
| `--radius` / `--radius-sm` | `10px` / `6px` | `0` — every corner squares off |
| `--lead` | `1.6` | `1.85` |
| `--tracking-display` | `-0.018em` | `0.012em` |
| `--tracking-label` | `0.14em` | `0.34em` |
| `--motion` | `0.2s` | `0.5s` |
| `--section-y` | `clamp(3.5rem, 8vw, 6.5rem)` | `clamp(5.5rem, 13vw, 10rem)` |
| `--card-gap` | `1.25rem` | `clamp(2rem, 5vw, 3.5rem)` |
| `--measure` | `42rem` | `46rem` |

**Shape, rhythm and pace are tokens too** — that is what stops the two faces being
recolours of each other. Light is tight, rounded, gridded and quick; mystic is
sharp-edged, spacious and slow. Three structural moves carry most of the distance:

- **The card affordance disappears.** In daylight the services are boxed, shadowed
  product cards. In mystic they lose surface, border, shadow and radius entirely and
  become columns of a page divided by a hairline rule. Same markup, different kind of
  document.
- **Runes leave their tiles.** Framed icon chips in light; unframed, lit glyphs in
  mystic, pulled to the text's left edge.
- **Mystic cards become weathered rune-carved planks.** The frame is drawn on
  `::before`/`::after` rather than on `.card` itself, then displaced by the
  `#driftwood` filter — filtering the card directly would bend the copy along with
  its border. Two offset lines read as a split plank. The displacement scale is
  deliberately low (7); higher values melt the line instead of ageing it.
  `RuneFrame` inscribes glyphs around all four edges, rendered **only** in mystic so
  the light face carries none of that DOM. Swap the border's runes by editing
  `FRAME_RUNES` in `RuneFrame.jsx` or passing a `runes` prop; every glyph also
  carries `.rune-frame-glyph`, so the whole border can be restyled or hidden from
  CSS alone.
- **Only the dark face has texture** — a vignette and a 5.5% grain on
  `body.mystic-mode::before/::after`. The light face stays flat and printed.

The teal accent is pulled down from the logo's neon so the light face still belongs
to the brand. There are no per-discipline colours any more — three accent colours
read as decoration on a light page; the runes carry the differentiation instead.

Type is a fluid scale (`--step-0` … `--step-3`) built on `clamp()`, so nothing needs
a breakpoint to stay readable.

**Only the mystic face ships a webfont.** `main.jsx` imports Cormorant Garamond
400/600 from `@fontsource`; the default face uses the system UI stack, which costs
nothing and reads as native on every platform. Lato was dropped in the light rework —
it was the old default face, and removing it took the CSS bundle from 12.5 KB to
3.9 KB gzipped.

### The burn transition

Toggling does not cross-fade. A **live clone of the outgoing page** burns away from
the centre to reveal the already-reskinned real page beneath, with an ember rim
travelling at the burn front. It runs for 1.25s and is skipped entirely under
`prefers-reduced-motion`.

The clone is a real copy, not a flat plane: you watch *your own page* burn, and the
new one is genuinely underneath rather than arriving after a blank sheet lifts. Two
renderings are on screen at once for the duration, which is the entire reason theming
hangs off `.face` (§3). Sequence in `App.jsx`:

1. Deep-clone the `.face` wrapper, strip its ids (duplicates would shadow the real
   anchor targets), and mount `.burn` with it.
2. 60ms later, flip the live wrapper to the new face — the clone keeps the old one —
   and add `.is-lit` to start the mask animation.
3. Unmount at 1.51s.

Two positioning details make the clone land on top of the real page rather than near
it. `--burn-scroll` pulls it up by the scroll offset, and `--burn-bleed` (a fixed
120px, not a percentage, so the arithmetic stays trivial) gives the displacement
filter room without exposing an edge. And because `.burn-sheet` is
`overflow: hidden`, it is a scroll container, so the cloned `position: sticky` header
would otherwise pin one bleed above the viewport — `.burn-page .site-header` pushes
its sticky threshold down to compensate. **Do not "fix" that header in JS by making
it absolute**: it leaves the flow and shifts everything below it up by its own
height, misaligning the whole clone.

**Two controls trigger it**: a compact `.header-toggle` in the sticky header, and
`.reveal-cta` — a full-width pill in the hero carrying the Raidō rune, a label, and a
line of explanation. The pill is deliberately unmissable; the transition is the
site's signature moment and an icon alone buried it. On the light face the pill wears
an ember palette so the control visually promises the fire it starts; in mystic mode
it cools to violet and offers the way back.

---

## 6. Conventions & gotchas

- **Assets are imported, never referenced by path.** `import logo from './assets/…'`
  gets hashing and cache-busting. Unimported files in `src/assets/` are simply not
  emitted, so `logo.png` and `QR_Complete.png` cost repo size but not bundle size.
- **`logo.png` is 1.8 MB and must not be shipped.** It is the full-resolution master,
  kept for regenerating derivatives. `logo_signature.png` (67 KB, 300×200) is what
  renders; it carries explicit `width`/`height` attributes to reserve layout space,
  which is why `.logo` needs `height: auto` alongside `max-width`.
- **`QR_Complete.png` (2 MB) is the QR master**, kept for the same reason as
  `logo.png`. `qr_code.png` (99 KB) is the shipped derivative: 500×750, palette-
  quantised to 256 colours with the alpha channel preserved, which matters — the
  artwork is transparent apart from the opaque black backing behind the code itself.
- **Re-deriving the QR: verify it still scans.** The code is only ~26% of the
  artwork's width, so downscaling eats into it fast. Every candidate size was decoded
  before being accepted, and `.qr-code` is set to 340px for the same reason — at
  220px the code renders ~57px wide and becomes unreliable to scan.
- **The domain is not connected yet.** `theedgeofthemap.com` resolves to Porkbun's
  parking IPs (`207.207.210.36/.50`) and 302s to `theedgeofthemap-com.l.ink` — their
  "A Brand New Domain!" page. `www` is a CNAME to `uixie.porkbun.com`. To go live:
  add the custom domain in Railway, then in Porkbun **delete the URL forward and the
  parking A records** before pointing an ALIAS (apex) and CNAME (`www`) at the target
  Railway gives you. Leaving the forward in place will keep overriding the records.
- **Editing `App.css` from PowerShell 5.1 will mojibake it.** `Get-Content` decodes
  the file as the system ANSI codepage, so every em dash comes back mangled and
  writing it out re-encodes the damage. Use
  `[System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)` and
  `WriteAllText` with `UTF8Encoding($false)`, or just edit the file directly.
- **`filter` applies before `mask`.** The burn's displacement filter therefore sits
  on `.burn-warp`, the *parent* of the masked layers — filtering the masked element
  directly would displace its contents but leave a clean circular mask edge. That
  ordering is the whole reason the burn looks torn instead of like a wipe. Same
  reasoning is in the `#burn-displace` comment in `SvgDefs.jsx`.
- **The burn needs `@property --burn`.** A plain custom property cannot be
  transitioned, so without the `@property` registration the mask jumps straight to
  its end state and the effect degrades to an instant swap. That is an acceptable
  fallback, not a bug — but do not "simplify" the registration away.
- **The mystic plate (`hero-wide.webp`) is `logo.png` with its own wordmark cropped
  off** (the artwork bakes in "EDGE OF THE MAP" below y=792). `logo-card.webp` is the
  opposite — the *full* logo including the wordmark, used as the light hero's visual.
  Re-derive each from the right crop or the wordmark ends up doubled or missing.
- **Mystic tints the hero with a `color` blend, not `hue-rotate`.** `hue-rotate` was
  tried first and threw the rune tablet orange — the plate holds more than one source
  hue, so a single rotation cannot land them all on violet. A `mix-blend-mode: color`
  overlay maps every hue while keeping the original luminance.
- **`.hero-scrim` must paint above that tint** (`z-index: 2` vs `1`). The scrim is
  what fades the hero into the page background; if the tint paints over it, the fade
  is re-coloured and the hero ends on a hard horizontal seam.
- **Serif and sans set to different widths.** The two faces swap `--display-font`, so
  any headline pinned to an exact line count will reflow on toggle. Give headings room
  to breathe rather than tuning them flush; an earlier hero wordmark had to be scaled
  to 0.84 to stop the serif face wrapping to two lines and jolting the layout.
- **A backgrounded tab breaks three different automated checks.** While
  `document.visibilityState === 'hidden'`, Chrome defers `loading="lazy"` images (the
  QR reports `naturalWidth: 0`), does not fire `IntersectionObserver` (every
  `[data-reveal]` stays at `opacity: 0`), and does not deliver `scroll` events (the
  header never unpins). Screenshots of that tab also drop fixed-position layers, so
  `.site-header` can be absent from a capture while `elementFromPoint` still returns
  it. None of these are bugs — verify with `elementFromPoint` or by dispatching the
  event manually rather than trusting a capture.
- **No `[data-reveal]` element may take a React-computed `className`.**
  `useScrollReveal` adds `is-visible` imperatively and then *unobserves* the
  element, so it only ever fires once. A template-literal className on the same
  node wipes that class on the next re-render, and because the observer is gone
  it can never be re-added — the section is stranded at `opacity: 0` for the rest
  of the session, reading as a tall empty gap rather than as missing content.
  `.about` used to carry `` `about ${isMystic ? 'is-lore' : ''}` `` and vanished
  on the first mode toggle; the lore styling now keys off `body.mystic-mode`
  instead. Mode-dependent styling belongs on the body class, never in the
  `className` of a revealed section.
- **The Lore drop cap is tagged, not positional.** It hangs off `.lore-lede`
  rather than `h2 + p`, because Lore opens on a one-line fragment and a 3.4em
  floated capital spills straight out of it. Move the class if the opening
  paragraph changes.
- **`[data-reveal]` starts at `opacity: 0`**, so anything that stops
  `useScrollReveal` from running leaves content invisible. The hook reveals
  everything up front when `IntersectionObserver` is missing or reduced motion is
  requested, and the reduced-motion media query repeats the reset in CSS. Keep both
  paths if you touch it.
- **`node_modules/` and `dist/` were committed** for the first several commits. They
  are now untracked via `.gitignore`; the build output is produced on the host.

---

## 7. Deployment

Railway project **Edge of the Map**, service `edgeOfTheMap`, region US West.
Generated URL: `edgeofthemap-production.up.railway.app`.

- `nixpacks.toml` — build only: setup installs `nodejs` + `npm`, then `npm install`
  and `npm run build`.
- `railway.json` — `startCommand: npx serve -s dist -l $PORT`, restart on failure.

**A static build still needs a process.** The original config had `[start] cmd = ""`
in `nixpacks.toml` and `outputDirectory` in `railway.json` — the latter is a Vercel
field that Railway ignores. The build succeeded, nothing listened on `$PORT`, and
every request returned `502 Application failed to respond` with `Starting Container`
as the only log line. `serve` is a real dependency for this reason; do not remove it.

Because `dist/` is not committed, the host build is the only source of deployed
output.

### DNS

The apex is registered at **Porkbun**, on Porkbun nameservers
(`{fortaleza,curitiba,maceio,salvador}.ns.porkbun.com`). Connecting the domain means
removing Porkbun's parking first — see §6.

---

## 8. Decisions

No ADRs exist yet. If a decision here grows a real trade-off worth recording, add
`docs/adr/` and link the record from this section rather than expanding the prose above.
