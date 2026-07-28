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
  App.jsx               The entire UI.
  App.css               Theme tokens, layout, mystic-mode overrides.
  index.css             Reset: zero margins, full-height root, border-box.
  assets/
    logo_signature.png  The logo actually shipped (67 KB). Imported by App.jsx.
    logo.png            Full-resolution master (1.8 MB). Not imported — see §6.
    qr_code.png         The QR actually shipped (99 KB, 500×750). Imported by App.jsx.
    QR_Complete.png     Full-resolution master (2 MB). Not imported — see §6.
```

There is no `public/` directory. Every asset is imported through the bundler so it
gets content-hashed and cache-busted.

---

## 3. Runtime architecture

One component, one piece of state.

```
main.jsx  ──renders──>  App
                         │
                         ├─ useState: isMystic
                         └─ useEffect: body.classList.toggle('mystic-mode', isMystic)
```

`App` renders a fixed structure: header (logo, tagline, mode toggle), a
`.dual-panels` section holding the Keeper and Storyteller panels, a `.qr-section`,
and a footer. Nothing is fetched, nothing is persisted, there are no routes.

**Why the class lives on `<body>`:** `.container` is `max-width: 1200px` and centred,
so a theme class applied there leaves the page gutters unstyled. Putting the class on
`<body>` lets mystic mode repaint the whole viewport, and every existing
`.mystic-mode .foo` descendant selector still matches.

---

## 4. Domain model

The site expresses one idea: a single practitioner with two faces.

- **The Keeper** — the engineering side. Panel background `--keeper-bg`, text `--ghost-blue`, CTA "Build with Me".
- **The Storyteller** — the voice side. Panel background `--storyteller-bg`, text `--gold`, CTA "Speak with Me".

Both CTAs are currently inert — they render as buttons with no handler. Wiring them
to contact routes is the obvious next piece of work.

**The QR.** `qr_code.png` is branded artwork — a dragon coiled around a rune circle —
with a QR at its centre encoding `https://theedgeofthemap.com`, the site's own
canonical URL. It is also rendered as a link to that URL, so it works by tap as well
as by scan. `SITE_URL` in `App.jsx` is the single source for both.

---

## 5. Theming

Tokens are CSS custom properties on `:root` in `App.css`:

| Token | Value | Role |
| --- | --- | --- |
| `--violet` | `#7a4de7` | Toggle button, mystic glow |
| `--gold` | `#ffd34d` | Storyteller accent, default CTA |
| `--ghost-blue` | `#a1e7f5` | Keeper accent, mystic text and CTA |
| `--deep-black` | `#0c0c0e` | Default page background |
| `--fog` | `#b5b5b5` | Body copy, footer |
| `--keeper-bg` / `--storyteller-bg` | `#2a2c34` / `#1d1f24` | Panel backgrounds |

**Two modes.** Default is dark sans-serif (Lato). *Mystic mode* switches the page to
`#111118`, ghost-blue text, and a Cormorant Garamond serif, adds a violet radial glow
and text-shadow to the panels, and recolours the CTAs to ghost-blue. Transitions are
0.5s on `body` and 0.4s on `.panel` — long enough that a computed-style read taken
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
- **The `shimmer` class on the logo has no CSS rule.** It is a placeholder for an
  animation that was never written.
- **`loading="lazy"` images do not load in a backgrounded tab.** Chrome defers them
  while `document.visibilityState === 'hidden'`, so automated checks against a
  non-foreground tab will report the QR as `naturalWidth: 0`. Not a bug.
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
