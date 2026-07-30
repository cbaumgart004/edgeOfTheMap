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
  Bindrune.jsx          The maker's bindrune — seven runes on one stave (§4).
  RuneFrame.jsx         Inscribed rune border for mystic cards (§5).
  SvgDefs.jsx           Shared SVG filters: #burn-displace, #driftwood (§5).
  index.css             Reset: zero margins, full-height root, border-box.
  assets/
    logo-card.webp      Hero logo card, 800×533 (58 KB). Imported by App.jsx.
    hero-wide.webp      Mystic plate, 1536×792 (154 KB). Imported by App.jsx.
    hero-narrow.webp    Mystic plate, 960×495 (54 KB). srcSet partner.
    logo_signature.png  Header + footer mark (67 KB). Imported by App.jsx.
    logo.png            Full-resolution master (2.3 MB). Not imported — see §6.
    qr_code.png         The QR actually shipped (99 KB, 500×750). Imported by App.jsx.
    QR_Complete.png     Full-resolution master (2 MB). Not imported — see §6.
```

`public/` holds exactly two files — `banner.webp` (2048×640, 3.2:1) and `og.webp`
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
                         ├─ useState: burn     → the outgoing page's clone (§5)
                         └─ useScrollReveal()  → IntersectionObserver adds .is-visible
                                                  to every [data-reveal]
```

**There are no scroll or resize handlers anywhere.** The header is plain CSS
`position: sticky`; the only `window` reads in the whole app are `matchMedia` and
one `window.scrollY` at the moment of a toggle. Don't come here looking for a
scroll hot path — earlier revisions of this file described a `usePastHero()` hook
that pinned the header past 65% of the hero, and it does not exist.

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
and let the width follow. At icon size it degrades to a hairline — the footer mark
needs ~100px of height before it reads at all, and it is unusable as a favicon (a
16px square cannot hold it; see §8).

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
business and nothing else. **Nothing atmospheric leaks into it** — no glow, no serif,
no violet, no dragons. If a change makes the default face more mystical, it belongs
behind the toggle instead.

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
(it is 18.3 KB, 5.0 KB gzipped, most of it the two faces' token blocks and the
burn), so price it deliberately rather than reaching for it first.

**The light face is also flat in the literal sense: no `backdrop-filter`.** The
sticky header used to frost its backdrop on both faces, which is a blur re-resolved
on every scroll frame for the whole session — the only permanently-on expensive
compositing path the site had — to show 12% of it through an 88%-opaque fill. It
is now near-opaque and unblurred in daylight, and the frost is scoped to
`.face.mystic-mode .site-header`, where atmosphere is the point. The burn's cloned
header sets `backdrop-filter: none` outright: the clone is verbatim, so in mystic
mode it otherwise carries a *second* blur through the animating mask.

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

### The burn transition

Toggling does not cross-fade. A **live clone of the outgoing page** burns away from
the centre to reveal the already-reskinned real page beneath, with an ember rim
travelling at the burn front. It runs for 1.8s and is skipped entirely under
`prefers-reduced-motion`.

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
  kept for regenerating derivatives. `logo_signature.png` (67 KB, 300×200) is what
  renders, as `.brand-mark` in both the header and the footer; it carries explicit
  `width="300" height="200"` to reserve layout space, which is why `.brand-mark`
  needs `height: auto` alongside its `width: 34px`.
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
- **Re-deriving the QR: verify it still scans.** The code is only ~26% of the
  artwork's width, so downscaling eats into it fast. Every candidate size was decoded
  before being accepted; at 220px the code renders ~57px wide and becomes unreliable
  to scan. **`.qr-code` currently ships `260px`, not the 340px this section used to
  claim** — see §8, it is unresolved rather than decided.
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

Records live in [`docs/adr/`](docs/adr/README.md), one per decision. If a decision
here grows a real trade-off worth recording, add a record and link it from this index
rather than expanding the prose above.

| # | Decision |
| --- | --- |
| [0001](docs/adr/0001-cleanup-v2-quality-pass.md) | Cleanup pass — shared values become tokens; atmosphere (and `backdrop-filter`) is scoped to the mystic face; Cormorant is imported as `latin-` subsets and pre-warmed on idle; the burn keeps its `-webkit-mask` prefixes |

### Open

- **`.qr-code` is 260px in CSS; §6 recorded 340px as the decoded-and-accepted
  size.** One of the two drifted and it is not clear which. At 260px the code renders
  ~68px wide — above the ~57px that was measured as unreliable, but below the size
  that was actually tested and accepted. The functional constraint lives only in
  prose, in a file the CSS does not reference. **Resolving it needs a decode test at
  260px, not a judgement call**; until then the shipped value is left alone.
- **The LCP image cannot be preloaded without breaking a convention.** `logo-card`
  carries `fetchPriority="high"`, but the page is client-rendered and `index.html`
  ships no image hint, so the preload scanner sees nothing and the request cannot
  start until ~203 KB of JS has parsed. `fetchPriority` only reorders requests that
  already exist. Fixing it means either moving the file to `public/` (the exception
  already granted to `og.webp`/`banner.webp`, at the cost of cache-busting) or a Vite
  `transformIndexHtml` hook to emit the tag with the hashed name. Not done because
  both are real trades against §6's import rule, not cleanups.
- **`qr_code.png` is a 99 KB PNG on a site that otherwise ships WebP.** Lossless WebP
  with alpha typically lands 30–45% below a 256-colour PNG at identical pixels, and
  lossless is bit-exact so the scan constraint is unaffected. Not done here because
  it needs the derivative regenerated from `QR_Complete.png` and re-decoded, which is
  an asset pass rather than a code change.
- **No favicon.** `index.html` ships none, so tabs show the browser default. The
  bindrune cannot serve — at 16px a 1:7 column is a smear. Candidates explored and
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
