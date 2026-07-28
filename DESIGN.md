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
  Rune.jsx              Elder Futhark glyphs as SVG (§4).
  BurnFilter.jsx        The SVG displacement filter behind the burn (§5).
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

There is no `public/` directory. Every asset is imported through the bundler so it
gets content-hashed and cache-busted.

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

**Why the class lives on `<body>`:** `.container` is `max-width: 1200px` and centred,
so a theme class applied there leaves the page gutters unstyled. Putting the class on
`<body>` lets mystic mode repaint the whole viewport, and every existing
`.mystic-mode .foo` descendant selector still matches.

---

## 4. Domain model

The site expresses one idea: a single practitioner, three crafts. Each craft is a
**path**, defined by an entry in the `PATHS` array in `App.jsx` — adding a fourth,
or later splitting one onto its own route, is an edit to that table rather than a
layout rewrite.

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

> ⚠️ **`CONTACT_EMAIL` in `App.jsx` is a placeholder** — `hello@theedgeofthemap.com`
> is assumed, not confirmed. Every CTA and the contact section resolve from that one
> constant, so correcting it is a one-line change.

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
Garamond, the dragon plate lit behind the hero, glow on the logo and runes. Same
markup, same components — only tokens change.

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

Toggling does not cross-fade. A sheet painted in the **outgoing** background burns
away from the centre to reveal the already-reskinned page beneath, with an ember rim
travelling at the burn front. It runs for 1.25s and is skipped entirely under
`prefers-reduced-motion`.

The sheet is a flat plane rather than a copy of the old page — and that suits the
metaphor rather than fighting it: a paper map burning away. Sequence in `App.jsx`:

1. Freeze the current `background-color` into state and mount `.burn`.
2. 60ms later, swap the body class (page underneath is now the new face, hidden by
   the sheet) and add `.is-lit` to start the mask animation.
3. Unmount at 1.51s.

The frozen colour matters: reading a live custom property would recolour the sheet
halfway through the burn.

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
- **`filter` applies before `mask`.** The burn's displacement filter therefore sits
  on `.burn-warp`, the *parent* of the masked layers — filtering the masked element
  directly would displace its contents but leave a clean circular mask edge. That
  ordering is the whole reason the burn looks torn instead of like a wipe. Same
  reasoning is in the `BurnFilter.jsx` header.
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
- **`[data-reveal]` starts at `opacity: 0`**, so anything that stops
  `useScrollReveal` from running leaves content invisible. The hook reveals
  everything up front when `IntersectionObserver` is missing or reduced motion is
  requested, and the reduced-motion media query repeats the reset in CSS. Keep both
  paths if you touch it.
- **`node_modules/` and `dist/` were committed** for the first several commits. They
  are now untracked via `.gitignore`; the build output is produced on the host.

---

## 7. Deployment

Railway, serving `dist/` as static files.

- `nixpacks.toml` — setup installs `nodejs` + `npm`; build runs `npm install && vite build`; start command is empty.
- `railway.json` — `buildCommand: npm run build`, `outputDirectory: dist`.

There is no server process. Because `dist/` is no longer committed, the host build is
the only source of deployed output.

---

## 8. Decisions

No ADRs exist yet. If a decision here grows a real trade-off worth recording, add
`docs/adr/` and link the record from this section rather than expanding the prose above.
