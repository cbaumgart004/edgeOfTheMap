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
| Fonts | `@fontsource/cormorant-garamond` only, and only its `latin-` subsets — self-hosted, bundled. Mystic face only; see §5. |
| Routing | None — one page |
| State | `useState` in `App.jsx`. No store, no context. |
| Tests | None |

Scripts: `npm run dev` (Vite dev server), `npm run build`, `npm run preview`.

> `build` invokes `node ./node_modules/vite/bin/vite.js build` rather than bare `vite`.
> This is deliberate — the deploy host does not reliably put `vite` on `PATH`.

---

## 2. Layout

```
index.html              Shell. Mounts #root, loads src/main.jsx as a module,
                        and preloads the masthead plate (§5).
DESIGN.md               This file.
vite.config.js          React plugin, root '.', outDir 'dist'.
nixpacks.toml           Railway build phases.
railway.json            Railway build command + output dir.

src/
  main.jsx              React root (StrictMode). Imports the font faces → <App />
  App.jsx               The whole UI + the PATHS table (§4).
  App.css               Theme tokens, both faces, layout, the burn.
  Rune.jsx              Elder Futhark glyphs as SVG (§4). Exports RUNE_NAMES.
  Bindrune.jsx          The maker's bindrune — seven runes on one stave (§4).
  RuneFrame.jsx         Inscribed rune border for mystic cards (§5).
  SvgDefs.jsx           Shared SVG filters: #burn-displace, #driftwood (§5).
  index.css             Reset: zero margins, full-height root, border-box.
  assets/
    logo-card.webp      Hero logo card, 800×533 (58 KB). Imported by App.jsx.
    hero-wide.webp      Mystic plate, 1536×792 (154 KB). Imported by App.jsx.
    hero-narrow.webp    Mystic plate, 960×495 (54 KB). srcSet partner.
    logo_signature.png  The old compact header/footer mark (67 KB). No longer
                        imported — the banner plate carries the wordmark in both
                        places now, so this is not emitted at all. See §6.
    logo.png            Full-resolution master (2.3 MB). Not imported — see §6.
    qr_code.png         The QR actually shipped (99 KB, 500×750). Imported by App.jsx.
    QR_Complete.png     Full-resolution master (2 MB). Not imported — see §6.
```

`public/` holds exactly two files — `banner.webp` (2048×640, 3.2:1) and `og.webp`
(1200×630) — because both need **stable URLs**: the social card is referenced by
absolute URL from `index.html`, and a content-hashed filename would break every time
the bundle rebuilt. Everything else is imported through the bundler so it gets
hashed and cache-busted. Add to `public/` only when a URL has to survive a rebuild.

`banner.webp` now earns that exception twice. **It is the header** and the closing
plate (§5), referenced from `App.jsx` as `/banner.webp` rather than imported — and
because that URL is stable and unhashed, `index.html` can name it in a
`<link rel="preload" as="image">`. It is the page's LCP element, the page is
client-rendered, and a bundled name could not be written into static HTML; that is
the whole of why the old preload problem is gone.

---

## 3. Runtime architecture

One component, three small hooks, no store.

```
main.jsx  ──renders──>  App
                         │
                         ├─ useState: isMystic
                         │    └─ useEffect: body.classList.toggle('mystic-mode', …)
                         ├─ useState: burn     → the outgoing page's clone (§5)
                         └─ useScrollReveal()  → IntersectionObserver adds .is-visible
                                                  to every [data-reveal]
```

**There are no scroll or resize handlers anywhere.** The header is plain CSS
`position: sticky`; the only `window` reads in the whole app are `matchMedia` and
one `window.scrollY` at the moment of a toggle. Don't come here looking for a
scroll hot path — earlier revisions of this file described a `usePastHero()` hook
that pinned the header past 65% of the hero, and it does not exist.

`App` renders a fixed structure: a sticky `.site-header` which **is** the banner
plate, with the nav and controls laid over it (§5); a single-column `.hero` (copy only
— the dark plate behind it is lit in mystic mode alone); `.services`, whose head is a
row of description and the logo card, over one `.card` per entry in the `PATHS` table;
a `.cta-band`; `.qr-section`; and the footer, which opens on the same plate at full
width. Nothing is fetched, nothing is persisted, there are no routes; the nav is
same-page anchors.

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

That claim holds **structurally** — `PATHS` drives the nav, the hero trust row, the
cards and the footer nav, and `.cards` is `auto-fit` so a fourth reflows without a
breakpoint. The only edit outside the table is a glyph in `Rune.jsx`. **What it does
not cover is arity in the prose**: "three" is written into the hero h1 and sub, the
services heading, the About opening, and the Lore's *three branches, one trunk*.
None of that is templatable and none of it should be — but `PATHS.length` and the
copy can disagree with nothing to flag it, so a fourth path is a table edit *plus* a
copy pass.

**Rune choice is by meaning, not shape** — see the header comment in `Rune.jsx`.
`RUNE_NAMES` is the glyph set `Rune` can draw, and `RuneFrame`'s `FRAME_RUNES` is
now an alias of it rather than a second hand-kept copy of the same four names — a
name `Rune` cannot draw renders nothing at all, with no error to notice.
Othala is the inherited homestead, the domain one *keeps*. Ansuz is the god-rune of
speech and the spoken word. Berkano is the birch — growth, and literally wood.

A fourth rune sits outside the `PATHS` table: **Raidō (ᚱ), the journey**, reserved
for the mode toggle — the control that carries you between the site's two worlds
rather than describing a craft.

### The bindrune

`Bindrune.jsx` draws the maker's mark: seven runes bound adjacent, top to bottom,
on one continuous stave — Wunjo, Raidho, Othala, Ansuz, Berkano, Fehu, and Tiwaz
tripled into three stacked rooftops at the foot. The stave is drawn once no matter
how many segments hang from it; that shared vertical is what makes it one mark
rather than seven glyphs in a column.

It is kept as **labelled data, not a path blob** — each segment carries its rune's
name and meaning alongside its strokes, because the whole point of a bindrune is
that every stroke means something. Coordinates are absolute within the viewBox so
tuning one segment cannot silently reflow the others.

**It is a 1:7 column, not the 1:1.33 icon box `Rune.jsx` uses.** Size it by height
and let the width follow. At icon size it degrades to a hairline — it is unusable as
a favicon (a 16px square cannot hold it; see §8).

`orientation="horizontal"` turns the mark on its side, which is how the **footer**
ships it: laid along the bottom edge, below the footer text, signing the page off
rather than standing as a column above it. It is the *same* geometry — the turn is
`(x,y) → (y, 24−x)` applied to the contents inside a 164×24 viewBox, so tuning a
segment still tunes both forms and there is no second coordinate table to keep in
step. The turn goes in the viewBox rather than on a CSS `rotate` so the element's
**layout box is honest**: horizontal it really is a 7:1 band the page sizes by
width, where a rotated column would still reserve a 1:7 column of space and hang
outside its own footprint. Sizing inverts with it — `.rune-bind-h` takes width and
lets the height follow. It needs ~15rem of width before the seven bound runes stop
closing up into one smudge, the same constraint the column had in height.

**The mystic glow has to turn down with it, and nothing does that automatically.**
`drop-shadow` takes only absolute lengths, so the four-layer neon stack tuned for the
tall column — outermost halo 30px — was inherited by a band about 40px from edge to
edge, where 30px is most of the mark's own height and wider than the gap between two
bound runes. The mark read as one lit smear. The radii are multiples of `--bind-glow`
now (§5): 6px keeps the column's original tuning, the footer band takes 1.4px.

**`.footer-mark` also carries no `opacity`.** It sat at `0.6`, which on a 2–4px stroke
is not subtlety — it is the accent halfway to the background, in both faces, and it
read as washed out. A signature that wants to be quieter than the accent wants a
quieter *colour*; transparency just makes it look unfinished.

The same binding is carved into the hero artwork's tablet (§6), so the mark appears
twice in two materials: cut into wood in the plate, drawn in vector in the footer.

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

*Default* is **printed matter** — a well-set trade page. Warm paper stock, warm
near-black ink, teal used as a mark with the ember as its counter, system UI type,
filing-card sections closed by hairline rules. It should read as a legitimate working
business and nothing else. **Nothing atmospheric leaks into the page body** — no glow,
no serif, no violet, no dragons. If a change makes the default face more mystical, it
belongs behind the toggle instead.

That rule now has **one deliberate exception, and it is a bounded one**: the banner
plate that bookends the document — it is the header, and it opens the footer (below).
Earlier revisions of this file stated the rule without exception and said "no dragons"
flatly; the owner's call is that the brand's own artwork frames the page in both
faces. The boundary is where the exception stops being a leak: **between those two
bands the printed page is unchanged**, and the plate does not lend its atmosphere to
anything outside itself — no glow reaches the paper, and the controls that sit on it
take a plate palette rather than dragging the face's tokens dark. The field the plate is
laid on is this face's own warm stock, so in daylight the artwork reads as a plate set
on the page rather than as a black bar cut through it.

The printed framing is what keeps the light face from reading as a template while
staying inside that rule: paper, rules and ruled labels are *flat*, so they add
character without adding atmosphere. Three things carry it, and none of them cost a
webfont: the stock is warm (`#faf8f5`) rather than `#ffffff`; every section opens on
a ruled `.eyebrow` label; and the cards are filing cards — a 2px top keyline that
takes the accent on hover — rather than shadowed panels that lift. The resting
shadow and the 2px hover lift were the generic product-card gesture and are gone.
The hero's old teal→white gradient wash went with them; it was the single most
template-looking thing on the site.

**The light face still ships no webfont**, so its typography has to be earned from
system UI: `text-wrap: balance` on every heading, the tracking tokens, and the ruled
labels. If the face ever needs more voice than that, a display webfont is the next
lever — but it reverses the decision that took the CSS bundle down by two thirds
(it is 18.6 KB, 5.1 KB gzipped, most of it the two faces' token blocks and the
burn), so price it deliberately rather than reaching for it first.

**Neither face carries a `backdrop-filter` any more.** The sticky header used to
frost its backdrop on both faces — a blur re-resolved on every scroll frame for the
whole session, the only permanently-on expensive compositing path the site had, to
show 12% of it through an 88%-opaque fill. It was first scoped to
`.face.mystic-mode .site-header`, where atmosphere is at least the point; then the
header became the banner plate, which is opaque artwork with nothing behind it to
blur, and the rule went entirely. The burn no longer has to defend against it either:
its clone is verbatim, and the second blur it used to bring through the animating mask
does not exist to inherit.

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
Everywhere else, keep to tokens. This is the payoff for the toggle: the light face
earns trust, the dark face rewards the visitor who pulled the thread.

The positioning follows from it. The site does **not** argue that woodworking,
software, and narration are secretly one discipline — that reads as contrived. What
they actually share is stated plainly: they are all commission work, the maker is
the whole supply chain, and all three produce things people live with for years. The
unifying element is the person, not a synthetic through-line.

**Colours that appear at more than one alpha are stored as channel triples, not
colours** — `--violet: 122 77 231`, consumed as `rgb(var(--violet) / 0.6)`. The
mystic violet and its ghost-blue glow were previously raw `rgba()` literals in a
dozen component rules at seven different alphas, so changing `--accent` re-tinted
the Lore drop cap while leaving its glow the old blue. Same reason for
`--ember-hover` / `--ember-glow` on the light face. A single-alpha colour stays a
plain hex; only the multi-alpha hues pay for the indirection.

Both faces re-declare the same token names, so component rules never branch on mode:

| Token | Default | Mystic |
| --- | --- | --- |
| `--bg` | `#faf8f5` warm paper | `#101018` |
| `--bg-subtle` | `#f2eee7` second stock | `#15131f` |
| `--surface` | `#ffffff` fresh stock | `#191527` |
| `--border` | `#e3ddd3` | `rgba(122,77,231,.34)` |
| `--ink` | `#191510` (~17:1) | `#ece5ff` |
| `--ink-muted` | `#5f584e` (~6.6:1) | `#aba0c6` |
| `--accent` | `#0f766e` teal | `#a1e7f5` ghost blue |
| `--accent-soft` | `#e3efec` | `rgba(122,77,231,.22)` |
| `--ember` | `#c2410c` (+ `-line`, `-soft`, `-wash`, `-hover`, `-glow`) | *(unused — mystic overrides `.reveal-cta` wholesale)* |
| `--violet` / `--glow` | *(light face has neither)* | `122 77 231` / `161 231 245`, as **channel triples** |
| `--display-font` | system UI stack | Cormorant Garamond |
| `--radius` / `--radius-sm` | `10px` / `6px` | `0` — every corner squares off |
| `--lead` | `1.6` | `1.85` |
| `--tracking-display` | `-0.018em` | `0.012em` |
| `--tracking-label` | `0.14em` | `0.34em` |
| `--motion` | `0.2s` | `0.5s` |
| `--face-fade` | `0.35s` — *declared once, never per face* | ← same |
| `--gutter` | `clamp(1rem, 4vw, 2.5rem)` | ← same |
| `--header-h` | `5.5rem` | ← same |
| `--masthead-h` | `min(100vw / var(--plate-aspect), clamp(200px, 30vw, 400px))` — the band's height, the header's, and (via the aspect) the plate's width. The `min()` is load-bearing, not a rail — see §5 | ← same |
| `--plate-aspect` | `3.2` — the file's own aspect; the plate is shown uncropped, flush left, letterboxed to its right | ← same |
| `--frieze-clear` | `24%` — how far off the band's foot the overlaid nav hangs, to clear the frieze. Moves with `--plate-aspect` | ← same |
| `--plate-field` | `#04060a` — the plate's padding, **black on both faces** so a straddling nav row has one ink | `#0b0912` violet-black |
| `--on-plate-accent` / `-hover` / `--on-plate-ink` | `#5eead4` / `#8df5e4` / `#04100e` — the artwork's mint, because this face's teal goes muddy on it | `rgb(var(--glow))` / `#ffffff` / `#14101f` — this face needs no special palette |
| `--bar-gap` | `0.6rem` — one gap for the nav, the controls, and the join between them | ← same |
| `--banner-max-w` | `1600px` — where the plate stops growing in the *footer* | ← same |
| `--bind-glow` | *(light face draws no glow)* | `6px` base for the bindrune's neon stack; `1.4px` on the turned footer band |
| `--reveal-step` | `80ms` | ← same |
| `--section-y` | `clamp(2.75rem, 7vw, 5.75rem)` | `clamp(3.75rem, 11vw, 9rem)` |
| `--head-gap` | `clamp(1.6rem, 4vw, 2.75rem)` | `clamp(2.25rem, 6vw, 4rem)` |
| `--card-pad` | `clamp(1.25rem, 3.5vw, 1.75rem)` | a three-value shorthand — the token carries the whole padding so `.card` stays unbranched |
| `--card-gap` | `1.25rem` | `clamp(1.6rem, 5vw, 3.5rem)` |
| `--measure` | `42rem` | `46rem` |

**Shape, rhythm and pace are tokens too** — that is what stops the two faces being
recolours of each other. Light is tight, rounded, gridded and quick; mystic is
sharp-edged, spacious and slow. Three structural moves carry most of the distance:

- **The card affordance disappears.** In daylight the services are filing cards —
  surface, hairline border, and a 2px top keyline that takes the accent on hover. In
  mystic they lose surface, border, keyline and radius entirely (a single `border: 0`
  clears all of it) and become columns of a page divided by a hairline rule. Same
  markup, different kind of document.
- **Runes leave their tiles.** Outlined icon chips in light — stamped marks, not
  filled app icons; unframed, lit glyphs in mystic, pulled to the text's left edge.
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
it was the old default face, and removing it is most of why the CSS bundle is a
third of what it was.

Import the **`latin-` entrypoints**, not the bare `400.css`/`600.css`. The bare ones
declare all five subsets (cyrillic, cyrillic-ext, vietnamese, latin-ext, latin), so
ten `@font-face` blocks land in the render-blocking stylesheet where two can ever
match this copy, and Vite emits a `.woff` fallback for each — 20 font files and
377 KB of deploy weight to ship 2 files and 46 KB.

**The serif is warmed on idle** (`warmMysticFont` in `main.jsx`). The `@font-face`
rules ship in the CSS but the woff2 is not fetched until a glyph needs it, which is
the instant the burn flips the face 60 ms in — so a ~45 KB request landed on the
frame the mask transition starts and `font-display: swap` then re-laid out the whole
document *mid-burn*: the mystic reveal arrived in system UI and snapped to serif a
beat later. Serif type is half that face's identity; it should be resident before
the toggle is pressed, not fetched because it was.

### The header is the plate

`public/banner.webp` **is** the header — not a band above one. The nav and the two
controls are laid over the artwork, above its bound-rune frieze; the plate's own neon
wordmark is the brand. The same plate closes the page at the top of the footer, where
it still runs whole and full width — the header had to trade width for height to become
a header, and the footer is under no such pressure, so the artwork gets one placement
where it is seen at size. Below it the footer is a centred stack: nav, then the vector
bindrune, then the copyright last (`.footer-legal`) — where a legal line belongs, and
not up in the nav row beside a second crop of the wordmark as before.

**There is no separate bar, and no mark or title in the row.** The compact
`logo_signature.png` and the "Edge of the Map" text that used to sit there were the
wordmark a second and third time in the same band; both are gone, and with them the
last import of `logo_signature.png` (§2). The plate is the wordmark now, in the header
and in the footer alike.

**It stays sticky through a negative `top`.** `.site-header` is
`top: calc(var(--header-h) - var(--masthead-h))`, so the band scrolls up until only
its bottom `--header-h` is left and pins there — and that strip is exactly the nav row
plus the frieze under it. The nav is reachable down the whole page without a scroll
listener, which matters because the site has none and §3 means to keep it that way.
`--header-h` is therefore no longer "the header's height"; it is the **pinned
remainder**, and it is still what same-page anchors clear.

**The plate is flush left, and its own wordmark is the brand.** Centring it was tried and
reverted, and the reason is worth recording because it is not a tuning problem:

- **The neon wordmark is a hard-edged black plaque pasted *over* the artwork.** It
  truncates the dragon's back, so there is no picture behind it to recover. Centring the
  plate carries the brand toward the middle of the page, so keeping it in the corner means
  painting the plaque out and re-placing it — which means **inventing** the dragon's
  continuation under it.
- All three cheap reconstructions fail, each in its own way. A flat fill reads as a hole
  in the artwork (the plaque interior measures `rgb(4 8 6)` and its surroundings
  `rgb(5 13 9)`, so the *colour* matches — but flat colour against textured art still
  reads as a patch). Interpolating from the region's four boundaries streaks the dragon's
  lit ridge vertically upward, because the lower boundary is structured. Mirroring the
  strip below clones the dragon's **eye** into the gap. Real inpainting is the only thing
  that would work here, and it is not a few lines of PIL.
- Cropping the plaque off instead is what the plate did for one revision, at 4.452:1 —
  and that trim is what made the artwork read as compressed at its top edge: 28% of the
  picture gone, the dragon's head cut through.
- Flush left, none of this arises. The artwork's own wordmark lands ~23px off the page's
  corner — which is where a re-placed one was aiming anyway — and the picture stays whole.
  All the spare field goes to the right, where the nav sits.

**The nav row is the viewport's width**, so it ends at the window's right gutter rather
than at the artwork's edge. It can only do that because `--plate-field` is dark: the row
straddles the plate's edge at most widths, and a straddling row needs both sides to take
the same ink. That is the whole reason the padding is black — see the token below.

**The reveal control lives on the hero's title row** (`.hero-head`), pushed to the right
edge of the column opposite the "Edge of the Map LLC" eyebrow. It reads as the answer to
the brand line rather than as one more button under the CTAs, and pairing it with the
eyebrow costs the hero a row instead of adding one. It was briefly on the plate beside
the wordmark; on paper the ember palette is in its native context, which is what it was
designed for. Below the width where the two fit side by side the row wraps and the pill
drops under the eyebrow rather than crushing it.

**Every control on the plate is the same button — including the Raidō toggle.** The
nav links and the toggle all carry `btn btn-primary btn-sm` — the classes reused, not a
nav-link style restyled to match — and `.header-bar` re-declares `--accent`,
`--accent-hover` and `--accent-ink` so `.btn-primary` resolves to the plate's neon while
staying unbranched. The toggle used to hand-roll its own colour, border and hover, which
is exactly why it was the one control that did not pick up the plate styling: a parallel
implementation of the same idea holding none of the same values. All that is left of
`.header-toggle` is shape — even padding, because it is icon-only, and a glyph sized at
`1em` so it matches the pills' own text height and the row aligns without a hardcoded
height to keep in step. That also
retired the row's scrim: it existed because running nav text had to survive the
lightning bolt crossing the band, and a filled button brings its own background. One
`--bar-gap` governs the nav, the controls and the join between them, so the spacing is
even across the row rather than three values agreeing by coincidence.

**The letterbox is what buys the height.** `--masthead-h` caps the height and the plate is
drawn at `height × --plate-aspect`, flush left on the field. **The band always crosses the
whole viewport; the plate reaches as far across it as the height allows.** At 1402px that
is a 400px band with 1280px of plate and 106px of black padding to its right. Below
~1280px the plate fills the width outright. **The one dial is `--masthead-h`**: raise the
cap and the plate widens toward the edge and the padding shrinks, at the cost of a taller
header.

**The `min()` in `--masthead-h` is load-bearing, not a safety rail.** It holds the band to
exactly `--plate-aspect`, which is what keeps the plate's box the same shape as the file
and therefore shows all of it. Let the band grow taller than `100vw / --plate-aspect` and
the box becomes *squarer* than the artwork, at which point `cover` starts trimming again —
**from the centre**, so it eats the frieze at the foot and the wordmark's space at the top
at once. Raise the clamp only as far as the letterbox can pay for.

`--header-h` tracks the band for the same reason: the nav sits `--frieze-clear` off the
foot, so a taller band puts the row further from the bottom edge and the pinned strip has
to reach further up to keep it. At 294px and 24% the row's top is 104px off the foot,
hence 7rem. **Change one and check the other** — if the strip is shorter than the row's
top offset, the nav is clipped out of the pinned band entirely.

**`--plate-field` is the plate's padding, and it is black on both faces.** The band
crosses the whole viewport while the plate is a fixed 3.2:1, so wherever the height cap
bites there is field left over, and it has to read as part of the artwork rather than as
page. It is also what lets the nav run to the viewport's right edge. It was briefly the
face's own stock — which followed the theme handsomely and put mint pills on warm paper.
The two faces still differ here, but it is the difference between a neutral black and a
violet one. The plate itself takes `--radius`, so it rounds in daylight and squares off in
mystic like every other corner.

**Controls sitting on the plate take a plate palette, and it is face-aware too.**
`--on-plate-accent`, `--on-plate-accent-hover` and `--on-plate-ink` exist because the
light face's teal goes muddy on the dark artwork; the plate's own mint does not. In
mystic no special palette is needed — ghost blue on dark artwork is what the whole page
is doing — so those three point at that face's own hue. **`.header-bar` maps the three
onto `--accent` / `--accent-hover` / `--accent-ink`**, so `.btn-primary` stays unbranched
and the controls change with the theme without the rule knowing which face it is in. It
re-declares `--radius-sm: 999px` the same way, which is what makes them pills — in both
faces, where mystic squares every other corner.

Four more of these tokens existed (a white, a muted ink, a scrim, two of them channel
triples) from when the nav was running text over a gradient scrim and the toggle
hand-rolled its own border. Both are real buttons now; all four had no consumer left.

The frieze is now on screen twice at the top and bottom of the page, and the footer
*also* signs off with the vector `Bindrune` below its plate — three appearances of one
mark. Unresolved rather than intended; see §8.

### The burn transition

Toggling does not cross-fade. A **live clone of the outgoing page** burns away from
the centre to reveal the already-reskinned real page beneath, with a charred,
ember-lit rim travelling at the burn front. It runs for 1.8s and is skipped entirely
under `prefers-reduced-motion`.

`BURN_MS` in `App.jsx` is the only duration. It sets the unmount timer and is passed
to CSS as `--burn-dur`, which the mask transition reads — the two used to be
separate literals that could drift.

**The origin is a pair of tokens for the same reason**: `--burn-x` / `--burn-y` on
`.burn`. The radius was hardened into a registered `<length>` precisely so its two
consumers could not disagree, but the *centre* was left as four independent `50% 52%`
literals — the mask circle's `cx`/`cy`, the ember gradient, and the rim's own mask —
with nothing keeping them in step. That is the same failure as the radius bug below,
and it looks identical: a rim lighting somewhere the page is not dissolving.

The clone is a real copy, not a flat plane: you watch *your own page* burn, and the
new one is genuinely underneath rather than arriving after a blank sheet lifts. Two
renderings are on screen at once for the duration, which is the entire reason theming
hangs off `.face` (§3). Sequence in `App.jsx`:

1. Deep-clone the `.face` wrapper, strip its ids (duplicates would shadow the real
   anchor targets), and mount `.burn` with it.
2. 60ms later, flip the live wrapper to the new face — the clone keeps the old one —
   and add `.is-lit` to start the mask animation.
3. Unmount at `BURN_MS + 260`.

**Tuning the tear.** The edge is drawn by `#burn-displace`, applied to the mask
circle *and* — via `.burn-ember-warp` — to the ember, with the same seed, so the
rim tears in step with the hole it is lighting. Two things have to hold or the
effect reads as fake, and both were broken at once:

- **The ember must sit on the tear.** `--burn` is registered as a **`<length>`**,
  not a percentage, because its two consumers resolve percentages differently: SVG
  `r` against the normalized diagonal, a radial-gradient stop against the distance
  to the farthest corner. The same `30%` put the rim ~100px inside its own hole, so
  the page dissolved where no flame was.
- **The ember must be ragged.** Its filter goes on a wrapper. `filter` runs before
  `mask`, so filtering the ember itself warps a smooth background gradient —
  invisible — and then carves a perfectly clean ring out of it (§6).

**The rim is two layers, and the order is the effect.** Paper does not glow at the
cut — it chars. A **black char layer paints on top**, opaque through the front and
falling off outward through a scorch brown, so the inside of the band (where the mask
is fading up) reads as a blackened edge crumbling into the hole and the glow only
surfaces *outside* it. Without it the rim was a lit ring wiping across the page.

The two layers take their stops from different references on purpose. The char is in
`calc()` off `--burn`, like the mask, because it has to travel *with* the front. The
hot ramp underneath keeps **percentage** stops, fixed to the box rather than the
front, so the rim cools as it expands — white-hot at the origin, orange across the
page, violet by the edges, which is the face it is uncovering. Retuning the char's
outward reach and the mask band's outer stop is one edit, not two: they share that
distance, and pulling them apart either starves the glow or lifts the black edge off
the tear.

Keep the noise period short and the excursion small: an earlier pass ran
`baseFrequency 0.009` at `scale 110`, a ~110px period swinging the boundary ±55px,
which looked like a wobbling cut-out rather than char. The filter ends in its own
blur because the mask circle is a hard shape, and a hard displaced edge reads as
cut. The ember band is in **px**, so the rim stays a line; as a percentage of the
box it grew as the burn travelled and arrived as a glowing donut.

**Three things keep it affordable**, and all three are easy to undo by accident:

- `--burn` stops at **110%**, not further. The hole clears the farthest corner at
  r ≈ 72% and the ember leaves the box at ≈ 105%; past that the browser is
  rasterizing a filter region several times the viewport with nothing on screen.
- **Two octaves** of turbulence, not four. Each octave is another noise sample per
  pixel per frame, and the detail lands under the blur anyway.
- **Nothing underneath animates layout.** The clone covers the page for the whole
  window, so `line-height` (`--lead`) and heading `letter-spacing`
  (`--tracking-display`) snap between faces instead of transitioning. They used to
  animate, which reflowed the entire document every frame *while* the burn ran — for
  an effect no one could see. Only colour is transitioned on `.face` and `body`.

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
- **A value used in two rules is a token; a value used in seven is a bug waiting.**
  `--gutter`, `--header-h`, `--face-fade` and `--reveal-step` all exist because the
  literal was previously copied across rules that *must* agree, and where a missed
  copy is silent rather than visible: the gutter governs whether the header, every
  eyebrow and the footer share a left edge, and `--header-h` is the only thing
  keeping same-page anchors from landing under the sticky header (two rules used to
  guess at it independently, 5.5rem and 5rem).
- **The reveal stagger is `--reveal-index` × `--reveal-step`.** `App.jsx` passes only
  the index — the datum it owns — and CSS multiplies. As a `${i * 80}ms` template
  literal the interval was unreachable from CSS, so the cascade was pinned to the
  light face's rhythm and could not slow with the mystic face like every other
  pace token.
- **`logo.png` is 2.3 MB and must not be shipped.** It is the full-resolution master,
  kept for regenerating derivatives.
- **`logo_signature.png` is no longer imported, and so no longer emitted.** It was the
  compact 300×200 mark rendering as `.brand-mark` in the header and the footer; the
  banner plate carries the wordmark in both places now, so the mark was the wordmark a
  second and third time in the same band. It is kept in `src/assets/` like the other
  masters — 68 KB off the deploy, nothing lost from the repo. `--mark-w`, `.brand-mark`
  and `.brand-name` went with it; `.brand` survives as the plate's link back to top.
- **The master is repainted, not original.** The artwork's tablet originally carried
  invented, meaningless glyphs. It now carries a live-edge black walnut slab with the
  real bindrune (§4) carved into it, lit by the neon spilling from the grooves. Every
  derivative — `logo-card`, `hero-wide`, `hero-narrow`, `public/banner.webp`,
  `public/og.webp` — is cut from that one repainted master, so **re-derive rather than
  edit a derivative**. The dragons and wordmark are untouched original art.
- **The dragons cannot be carved, only the tablet.** An earlier attempt rendered the
  whole logo as carved wood and failed: in the source the dragons are dark silhouettes
  defined by *rim light*, so their bright pixels are lightning and edge contours, not
  form. Emboss the raw luminance and it is mud; threshold it and the dragons vanish
  while the lightning survives as scratches. There is no line art to carve from. The
  wood is therefore confined to the tablet, which is also why keeping the dragons and
  going to wood were compatible asks rather than opposed ones.
- **The slab's live edge is traced from the artwork, not drawn.** Its right edge
  follows the neon divider between tablet and dragons, detected per row and
  median-filtered — a plain brightest-pixel scan locks onto lightning branches. The
  bark band deliberately runs *past* that line so the slab abuts the lit rock instead
  of hovering short of it. Two things ruin it if retuned: a hot cambium line reads as
  a pink zigzag rather than pale sapwood, and high-frequency jitter on the outer
  boundary reads as a drawn zigzag rather than a ragged edge — raggedness is
  low-frequency wander plus texture, never a fast wobble.
- **Crops taken below y=792 pull in the artwork's baked wordmark.** `hero-wide` stops
  there for exactly this reason. A banner or og crop that runs past it gets a second,
  smaller "EDGE OF THE MAP" ghosted into the frame.
- **`QR_Complete.png` (2 MB) is the QR master**, kept for the same reason as
  `logo.png`. `qr_code.png` (99 KB) is the shipped derivative: 500×750, palette-
  quantised to 256 colours with the alpha channel preserved, which matters — the
  artwork is transparent apart from the opaque black backing behind the code itself.
- **Re-deriving the QR: verify it still scans.** Every candidate size was decoded
  before being accepted; at 220px the code renders ~57px wide and becomes unreliable.
- **The code cannot be made bigger inside the artwork — only rendered bigger.**
  Measured on the master: the scannable tile is 311px of `QR_Complete.png`'s 1024
  (152 of 500 in the derivative, ~30% of the width), and it is a *square inscribed in
  the rune ring* — the ring's inner radius is 241px, so the largest square that fits
  without its corners crossing the runes is 341px, about 10% more than it already is.
  Enlarging the code past that is recomposing the artwork (shrinking ring and dragon),
  not cropping or rescaling it. `.qr-code` therefore ships
  `clamp(280px, 32vw, 400px)`: at 400px the code lands ~122px across, against ~79px
  at the old 260px. Growing past a tested size is the safe direction, so this needed
  no new decode; shrinking would.
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
- **`filter` applies before `mask`, so the tear lives in the mask shape.** Filtering
  a masked element displaces its *contents* and leaves a clean circular mask edge.
  Filtering the parent instead was the answer while the burn was a flat sheet, but
  with a clone of the page in there it smeared the whole layout into marbled noise.
  So `#burn-displace` now sits on the mask's own circle (`#burnMask` in `App.jsx`):
  the hole is torn and what it uncovers stays sharp. The ember is masked too, so it
  gets the filter on `.burn-ember-warp` rather than on itself — putting it on
  `.burn-ember` displaced a smooth gradient and then masked a flawless circle out
  of it, which is how the rim went round without anyone noticing. `.burn-warp` is
  the bleed, not a filter host.
- **The burn needs `@property --burn`.** A plain custom property cannot be
  transitioned, so without the `@property` registration the mask jumps straight to
  its end state and the effect degrades to an instant swap. That is an acceptable
  fallback, not a bug — but do not "simplify" the registration away.
- **The mystic plate (`hero-wide.webp`) is `logo.png` with its own wordmark cropped
  off** (the artwork bakes in "EDGE OF THE MAP" below y=792). `logo-card.webp` is the
  opposite — the *full* logo including the wordmark. Re-derive each from the right crop
  or the wordmark ends up doubled or missing.
- **The logo card is in the services head, not the hero.** With the banner plate
  immediately above it, a hero that carried the card beside its copy put the wordmark
  on screen three times above the fold. It is now the services section's visual,
  right of the description, and the hero is single column. Two things followed: the
  card is `loading="lazy"` rather than `fetchPriority="high"`, since it is below the
  fold and the plate is the LCP element — which also leaves exactly one image on the
  page claiming high priority — and `.services-head` has to drop `.section-head`'s
  44rem measure, because that measure is there to keep a *line of prose* readable and
  applied to a two-column row it caps the row instead, stranding the card mid-page.
  The copy keeps the measure.
- **Moving the card out of the hero left the hero's measures wrong, not just its
  layout.** `.hero h1` was capped at 15ch and `.hero-sub` at 46ch — measures sized for
  the *left half* of a two-column hero. Single-column, they left the copy huddled at the
  left with a hero-sized hole beside it, which reads as a slot reserved for an image that
  failed to load. They are 34ch and 72ch now: still measured, because prose past ~75ch is
  hard to track back to, but measured for a full-width column. The headline is short
  enough that `text-wrap: balance` still sets it in two lines, so the width costs no
  readability. **Whenever a column count changes here, check the `ch` caps inside it** —
  they are invisible in the markup and they do not follow the grid.
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
- **A backgrounded tab breaks every automated check of this page, and convincingly.**
  While `document.visibilityState === 'hidden'`, Chrome defers `loading="lazy"`
  images (the QR reports `naturalWidth: 0`), delivers no `IntersectionObserver`
  callbacks at all, runs no CSS transitions (so `getComputedStyle().opacity` stays at
  the *start* value however long you wait), animates no smooth scroll (so
  `window.scrollTo` appears to do nothing while `scrollTop =` works), and delivers no
  `scroll` events. Screenshots of that tab also drop fixed-position layers, so
  `.site-header` can be absent from a capture while `elementFromPoint` still returns
  it. **Every one of those reads as a real bug in the page.** A session chasing
  "the reveal is broken" produced, in order: a page that could not scroll, a
  stylesheet missing its rules, and an `is-visible` class that did not apply —
  all three false. Check `document.visibilityState` *first*, and prefer reading the
  source to measuring a tab you are not looking at.
- **A token that maps onto `--accent` cannot be *defined* from `--accent`.**
  `.header-bar` sets `--accent: var(--on-plate-accent)`, so a face block defining
  `--on-plate-accent: var(--accent)` closes a custom-property cycle inside that
  subtree. A cycle computes to **invalid at computed-value time**, which is not a
  fallback — `background: var(--accent)` becomes `unset` and the buttons lose their
  fill entirely. The mystic block therefore names `rgb(var(--glow))`, the same hue one
  indirection away from the loop. Watch for this whenever a scope re-declares a token
  it also consumes.
- **Enumerating CSSOM rules: test `instanceof CSSStyleRule`, not `rule.cssRules`.**
  Chrome supports nesting, so *every* style rule now has a `cssRules` list; it is
  empty but truthy, so a `if (r.cssRules) recurse(); else check()` walk silently
  skips every rule in the sheet and reports the stylesheet as empty.
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
- **In a vertical-rhythm `clamp()`, the floor *is* the mobile design.** Every spacing
  token here is `clamp(min, Nvw, max)`, and with N around 7 the `vw` term does not
  overtake the floor until roughly 640px. So on a phone the middle term is dead and
  the page gets `min`, doubled at every section boundary — `--section-y: 3.5rem` was
  112px of nothing between sections, and the fluid syntax hid it because the value
  *looked* responsive. Tune the floor for the phone and let `vw` earn the space back;
  check with `getComputedStyle` at 390px rather than reading the clamp.
- **Spacing that never shrank was worth more than the clamps.** A handful of values
  were plain rems (`.section-head` margin, `.hero-trust`, `.footer-inner`, card
  padding) and so were identical on a 4K monitor and a phone. Converting those was
  most of the 321px removed from the mobile page height.
- **The Lore drop cap is tagged, not positional.** It hangs off `.lore-lede`
  rather than `h2 + p`, because Lore opens on a one-line fragment and a 3.4em
  floated capital spills straight out of it. Move the class if the opening
  paragraph changes.
- **Hiding a `[data-reveal]` section is opt-in, and the opt-in is `.reveal-ready`.**
  The `opacity: 0` used to be unconditional, which meant *every* way
  `useScrollReveal` could fail to run presented as several screens of tall blank
  gaps with nothing on screen to hint why — a catastrophic failure mode for a
  cosmetic feature, and it bit twice. The rule is now
  `.reveal-ready [data-reveal]`, and the hook adds that class to `<html>` only
  **after** its observer is armed. A page whose JS never got that far renders
  visible.
  - It arms in a **`useLayoutEffect`**, not a `useEffect`: effects run after paint,
    so the gate would land a frame late and anything above the fold would flash in
    and blink out before fading back.
  - Three cases skip the animation and reveal everything up front, never arming the
    gate: reduced motion, no `IntersectionObserver`, and **a document that is
    `hidden` at mount** — a backgrounded tab is delivered no observer callbacks at
    all, so arming there would hide the page and never un-hide it.
  - The reduced-motion media query still repeats the reset, and has to name both
    `[data-reveal]` and `.reveal-ready [data-reveal]` to out-specify the gate.
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

Records live in [`docs/adr/`](docs/adr/README.md), one per decision. If a decision
here grows a real trade-off worth recording, add a record and link it from this index
rather than expanding the prose above.

| # | Decision |
| --- | --- |
| [0001](docs/adr/0001-cleanup-v2-quality-pass.md) | Cleanup pass — shared values become tokens; atmosphere (and `backdrop-filter`) is scoped to the mystic face; Cormorant is imported as `latin-` subsets and pre-warmed on idle; the burn keeps its `-webkit-mask` prefixes |
| [0002](docs/adr/0002-turned-bindrune-and-charred-burn-front.md) | The horizontal bindrune is a turn inside the viewBox, not a CSS `rotate`, so its layout box stays honest; the burn front's char is its own layer above the glow, with stops in `calc()` off `--burn` so it rides the tear |

### Open

- **The bound-rune frieze is now on the page three times.** The plate carries it in
  neon at the head of the document and again at the head of the footer, and
  `.footer-mark` signs off with the same seven-rune binding in vector below that. All
  three were asked for a piece at a time, so all three ship, but the count is not a
  decision anyone made. The vector mark is the one that takes the face's colour and
  burns with the page; the plate is the one that carries the wordmark with it.
- **The pinned strip is 136px** (`--header-h`, 5.5rem → 8.5rem), because it has to hold
  the overlaid nav row *and* the frieze beneath it, at a band that is now 400px tall. That
  is half again as much viewport permanently spent as the old bar, and it is also the
  anchor offset. It tracks `--masthead-h`, so any change to the band's height needs this
  rechecked; there are ~9px of frieze clearance, so the alternative is letting the frieze
  scroll out of the strip and keeping only the nav.
- **The header is the one place the toggle changes almost nothing.** `--plate-field` had
  to go black on both faces so a nav row straddling the plate's edge would have a single
  ink, which means the head of the page — and the footer's plate band with it — barely
  responds to the theme. The plate's `--radius` and the controls' palette still do. If the
  bands should visibly change again, the nav has to stop straddling: either back inside
  the plate's width, or a palette that survives warm stock.
- **`qr_code.png` is a 99 KB PNG on a site that otherwise ships WebP.** Lossless WebP
  with alpha typically lands 30–45% below a 256-colour PNG at identical pixels, and
  lossless is bit-exact so the scan constraint is unaffected. Not done here because
  it needs the derivative regenerated from `QR_Complete.png` and re-decoded, which is
  an asset pass rather than a code change.
- **No favicon.** `index.html` ships none, so tabs show the browser default. The
  bindrune cannot serve — at 16px a 1:7 column is a smear, and turning it (§4) only
  makes it a 7:1 smear; the aspect is not the problem, seven bound runes in 16px is.
  Candidates explored and
  rejected: Othala plus legs (muddy at 16), the tripled Tiwaz alone (reads as
  chevrons), a dragon head biting Raidho (works at 64px, marginal at 16, and reads
  more beast than dragon). Othala's bare diamond is the safe fallback; the tripled
  Tiwaz with its stave reads as a tree, which is the strongest by meaning — it is
  "three branches, one trunk" from the Lore.
- **The banner frieze runes are quarter-turned**, which means they are no longer
  readable *as* those runes — orientation is part of a rune's identity, so the
  frieze reads as ornament rather than as text. Standing them upright on a baseline
  is the alternative, but that is a rune row, not a bound mark.
- **The banner's aspect trades against how much dragon fits.** At 4:1 only 289px of
  the master's 1024 height lands in frame; at the chosen 3.2:1 it is 361px. Widening
  it again costs creature.
