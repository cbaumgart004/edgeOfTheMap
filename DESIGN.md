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
  App.css               Theme tokens, both faces, layout.
  Rune.jsx              Elder Futhark glyphs as SVG (§4).
  index.css             Reset: zero margins, full-height root, border-box.
  assets/
    hero-wide.webp      Hero plate, 1536×792 (116 KB). Imported by App.jsx.
    hero-narrow.webp    Hero plate, 960×495 (40 KB). srcSet partner.
    logo_signature.png  Footer mark (67 KB). Imported by App.jsx.
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

`App` renders a fixed structure: a fixed `.site-header` and a full-page `.grain`
overlay, a full-bleed `.hero` (which sits *outside* `.container`, since `.container`
is width-capped), then `.paths` — one card per entry in the `PATHS` table — then
`.contact`, `.qr-section` and a footer. Nothing is fetched, nothing is persisted,
there are no routes; the nav is same-page anchors.

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

**The site has two faces, and the separation is the whole point of the toggle.**

*Default* is the professional face: Lato, near-monochrome, high contrast, sharp
edges, the hero artwork desaturated back to a backdrop. Runes are present but drawn
as quiet linework. **Nothing atmospheric leaks into it** — no glow, no serif, no
violet. If a change makes the default face more mystical, it belongs behind the
toggle instead.

*Mystic mode* (`body.mystic-mode`) is the reveal: Cormorant Garamond, violet, glow,
the hero tinted, the runes lit and flickering.

Both faces are driven by the same token names, re-declared under
`body.mystic-mode`, so component rules never branch on mode:

| Token | Default | Mystic |
| --- | --- | --- |
| `--page-bg` | `#0a0a0c` | `#101018` |
| `--surface` | `#141519` | `#17151f` |
| `--ink` | `#e8edef` (~16:1) | `#ded6f2` |
| `--ink-muted` | `#9ba5aa` (~7.6:1) | `#a99fc4` |
| `--hairline` | `rgba(255,255,255,.12)` | `rgba(122,77,231,.32)` |
| `--display-font` | Lato | Cormorant Garamond |

Per-discipline accents are fixed across both faces: `--accent-keeper` `#6fd7ee`,
`--accent-storyteller` `#ffd34d`, `--accent-wright` `#e8935a` — all ≥7:1 on
`--page-bg`. Each card gets exactly one hairline of its accent by default; colour is
rationed on purpose.

Type is a fluid scale (`--step-0` … `--step-hero`) built on `clamp()`, so nothing
needs a breakpoint to stay readable.

**Restraint devices** carrying the professional face: a fine `.grain` overlay at 3.5%
(flat dark fields read as plastic without it), editorial `01/02/03` card indices,
small-caps `.section-label`s at wide tracking, a hairline nav underline that scales
from the left, and scroll reveals that fade-and-rise with a 90ms stagger per card.
All of it is motion-safe — see §6.

Transitions are 0.5s on `body` — long enough that a computed-style read taken
immediately after the toggle will still show intermediate values.

**Fonts are self-hosted.** `main.jsx` imports Lato 400/700 and Cormorant Garamond
400/600 from `@fontsource`, so Vite bundles the woff2/woff files and the site makes
no third-party request to render. Cormorant is only referenced by mystic mode, so
browsers defer downloading it until the toggle fires — that is correct lazy
behaviour, not a missing font.

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
- **The hero plate is `logo.png` with its own wordmark cropped off** (the artwork
  bakes in "EDGE OF THE MAP" below y=792). The type in the hero is real text so it
  scales, reflows, and is readable by a screen reader. Re-derive with the same crop
  or the wordmark will appear twice.
- **Mystic tints the hero with a `color` blend, not `hue-rotate`.** `hue-rotate` was
  tried first and threw the rune tablet orange — the plate holds more than one source
  hue, so a single rotation cannot land them all on violet. A `mix-blend-mode: color`
  overlay maps every hue while keeping the original luminance.
- **`.hero-scrim` must paint above that tint** (`z-index: 2` vs `1`). The scrim is
  what fades the hero into the page background; if the tint paints over it, the fade
  is re-coloured and the hero ends on a hard horizontal seam.
- **Cormorant's uppercase runs wider than Lato 900.** The mystic wordmark is scaled
  to `calc(var(--step-hero) * 0.84)` so both faces hold a single line — without it,
  toggling reflows the wordmark to two lines and the whole hero jumps. `.hero-content`
  is 54rem rather than 48rem for the same reason: at 48rem the sans wordmark renders
  flush to the edge with zero slack.
- **The `shimmer` class on the logo has no CSS rule.** It is a placeholder for an
  animation that was never written.
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
