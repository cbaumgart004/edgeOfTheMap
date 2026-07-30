// StudioDemo.jsx
//
// The three-axis chooser, working, on the marketing page: pick a **structure**,
// a **face for each text role**, and a **palette**, and watch a page rebuild
// itself. It is the same argument the API console makes one section up — a claim
// about what the software does is worth more executed than described.
//
// ---
//
// ## The one rule this component must not break
//
// The structures below are **skeletons, not appearances.** They are the shapes
// Live Spirit Seeds' UX styles established — flat ruled bands, arched soft
// tiles, full-bleed cinema — rendered here with invented content and a neutral
// default palette. **They deliberately do not reproduce that site's look**: not
// its seasonal colours, not its script accents, not its artwork.
//
// That is not fussiness. Both named clients gave permission to be cited on the
// condition that their site does not become a look someone else can order, and
// the section this widget sits under states that as a promise (ADR 0004). A
// chooser that shipped a one-click "make it look like Live Spirit Seeds" would
// break it. Structure is the reusable part; that is the whole point of the
// distinction, and this component is where it is easiest to lose.
//
// ---
//
// ## Why the fonts cost nothing
//
// Every face offered here is either **already in the bundle** (Cormorant
// Garamond, which the mystic face ships) or a **stack of faces already on the
// machine**. Zero bytes added. DESIGN.md §5 records that the light face
// deliberately ships no webfont and that the CSS bundle is a third of what it
// was; loading eight display families onto a marketing page to demonstrate a
// font picker would spend that budget to prove a mechanism.
//
// The real product catalogue would be larger and would load the chosen face on
// demand — one face, at the moment it is picked, not eight up front. The note
// under the control says so, because a visitor who counts the options should not
// conclude that eight is the offer.

import React, { useMemo, useState } from 'react'
import './Studio.css'

/* Structural skeletons. Deliberately three, not the four Live Spirit Seeds runs
   — its `watercolor` is that site's own established look rather than a general
   structure, and it is the one the owner asked to leave out.

   **`id` and `name` are deliberately different words.** The id is a mechanical
   description of what the layout *does* — `ruled`, `split`, `bleed` — and is
   what the CSS class prefixes key off. The name is what a visitor reads.
   They were the same string at first, borrowed straight from Live Spirit Seeds'
   internal vocabulary, which quietly coupled this repo to that one: rename a
   style over there, or diverge from it here, and the two drift with nothing to
   catch it. The display names stay because they read well; the machinery no
   longer depends on them. */
const STRUCTURES = [
  {
    id: 'ruled',
    Layout: RuledLayout,
    name: 'Editorial',
    note: 'Type-led and image-light. Masthead with the nav on the rule, a headline that carries the page on its own, and services as a ruled list rather than tiles. The choice when the words are the product and you have no photography yet.',
  },
  {
    id: 'split',
    Layout: SplitLayout,
    name: 'Sanctuary',
    note: 'Centred masthead, and the hero splits — arch-topped image beside the copy rather than above it. Services become soft tiles in a grid. Warm and unhurried; it needs three good photographs.',
  },
  {
    id: 'bleed',
    Layout: BleedLayout,
    name: 'Immersive',
    note: 'The nav floats over the picture and the hero copy sits *inside* it, bottom-left. Services run edge to edge as one contiguous strip with no gutters. The most demanding — with weak photography it has nothing left.',
  },
]

/* Roles, in the order a page is read. Kept as data because the control, the
   preview's CSS variables and the reset all iterate it — three lists that would
   otherwise have to agree by hand. */
const ROLES = [
  { id: 'h1', label: 'Heading 1' },
  { id: 'h2', label: 'Heading 2' },
  { id: 'h3', label: 'Heading 3' },
  { id: 'body', label: 'Body text' },
]

/* Every stack resolves on a machine that has none of the named faces — the last
   entry in each is a generic family, so a Linux visitor gets a sane fallback
   rather than Times. `Cormorant Garamond` is the only one that is a real
   download, and it is already in the bundle. */
const FONTS = [
  { id: 'cormorant', name: 'Cormorant', stack: "'Cormorant Garamond', Georgia, serif" },
  { id: 'georgia', name: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
  { id: 'palatino', name: 'Palatino', stack: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif" },
  { id: 'baskerville', name: 'Baskerville', stack: "Baskerville, 'Hoefler Text', Georgia, serif" },
  { id: 'system', name: 'System Sans', stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: 'optima', name: 'Optima', stack: "Optima, Candara, 'Gill Sans', 'Segoe UI', sans-serif" },
  { id: 'futura', name: 'Futura', stack: "Futura, 'Century Gothic', 'Trebuchet MS', sans-serif" },
  { id: 'mono', name: 'Typewriter', stack: "'Courier New', Courier, ui-monospace, monospace" },
]

const FONT_STACK = Object.fromEntries(FONTS.map((f) => [f.id, f.stack]))

/* Starting points, not a fixed palette set — every one of the three colours
   stays independently editable after a preset is applied. Chosen to be plainly
   different from each other and from Live Spirit Seeds' seasons. */
const PRESETS = [
  { id: 'stone', name: 'Stone', bg: '#f7f5f2', ink: '#1e1b17', accent: '#7a6a52' },
  { id: 'ink', name: 'Deep', bg: '#14161a', ink: '#eceef2', accent: '#7fb3a3' },
  // Accent was #b4573a, which measures 4.50:1 — dead on the AA line and so
  // reported as a near-miss. A preset the page ships should not be the example
  // of a borderline choice; #a94e32 is the same clay with headroom (5.1:1).
  { id: 'clay', name: 'Clay', bg: '#fdf6f1', ink: '#2b1d17', accent: '#a94e32' },
  { id: 'harbour', name: 'Harbour', bg: '#f2f6f8', ink: '#12242c', accent: '#1f6f8b' },
]

/* One content object, three layouts. **This is the demonstration** — the same
   words, the same three services, arranged into genuinely different pages. An
   earlier pass restyled a single skeleton (radius, rules, tracking) and it was
   not honest: the real Live Spirit Seeds styles branch the DOM, and a chooser
   that only recolours a fixed arrangement misrepresents what picking a structure
   actually does. */
const DEMO = {
  brand: 'Stillwater Massage',
  nav: ['Sessions', 'About', 'Book'],
  eyebrow: 'Bodywork in Fort Collins',
  headline: 'Somewhere to put it down for ninety minutes.',
  lede: 'Deep tissue and Swedish sessions in a quiet room, by appointment — the same practitioner every time, who remembers what you said last visit.',
  cta: 'Book a session',
  heading: 'What a session looks like',
  services: [
    { name: 'Deep tissue', duration: '90 min', note: 'Slow, specific work on what actually hurts.' },
    { name: 'Swedish', duration: '60 min', note: 'Lighter pressure, for when the goal is rest.' },
    { name: 'Prenatal', duration: '60 min', note: 'Side-lying and supported, at any trimester.' },
  ],
}

const DEFAULTS = {
  structure: 'ruled',
  fonts: { h1: 'cormorant', h2: 'cormorant', h3: 'system', body: 'system' },
  colors: { bg: '#f7f5f2', ink: '#1e1b17', accent: '#7a6a52' },
}

/* WCAG relative luminance, and the contrast ratio built from it.
   Included because a colour picker that lets you choose an unreadable
   combination and says nothing is worse than no colour picker — and because a
   page arguing that this is done properly should be seen doing it properly.
   The threshold shown is AA for body text (4.5:1). */
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16)
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

/* ---------------------------------------------------------------
   The three layouts. Separate trees, not one tree with modifiers.

   What differs between them is *element placement*, which is the
   thing a customer is actually choosing:
     hero      — no image / image beside the copy / copy inside the image
     masthead  — brand left + nav on the rule / centred stack / floating over art
     services  — ruled list / arch tiles in a grid / contiguous edge-to-edge strip
   All three read the same `--sd-*` tokens, so type and colour apply
   across every one of them.
   --------------------------------------------------------------- */

function RuledLayout() {
  return (
    <div className="sd sd-r">
      <header className="sd-r-bar">
        <span className="sd-r-brand">{DEMO.brand}</span>
        <nav>
          {DEMO.nav.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </nav>
      </header>

      {/* No image at all — the headline carries the page. */}
      <section className="sd-r-hero">
        <p className="sd-eyebrow">{DEMO.eyebrow}</p>
        <h1>{DEMO.headline}</h1>
        <p className="sd-lede">{DEMO.lede}</p>
        <span className="sd-btn">{DEMO.cta}</span>
      </section>

      <section className="sd-r-band">
        <h2>{DEMO.heading}</h2>
        <ul className="sd-r-list">
          {DEMO.services.map((service) => (
            <li key={service.name}>
              <h3>{service.name}</h3>
              <span className="sd-dur">{service.duration}</span>
              <p>{service.note}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function SplitLayout() {
  return (
    <div className="sd sd-s">
      <header className="sd-s-bar">
        <span className="sd-s-brand">{DEMO.brand}</span>
        <nav>
          {DEMO.nav.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </nav>
      </header>

      {/* Two columns: the picture stands beside the copy, not above it. */}
      <section className="sd-s-hero">
        <div className="sd-s-media" aria-hidden="true" />
        <div className="sd-s-copy">
          <p className="sd-eyebrow">{DEMO.eyebrow}</p>
          <h1>{DEMO.headline}</h1>
          <p className="sd-lede">{DEMO.lede}</p>
          <span className="sd-btn">{DEMO.cta}</span>
        </div>
      </section>

      <section className="sd-s-band">
        <h2>{DEMO.heading}</h2>
        <div className="sd-s-tiles">
          {DEMO.services.map((service) => (
            <article key={service.name}>
              <div className="sd-s-thumb" aria-hidden="true" />
              <h3>{service.name}</h3>
              <span className="sd-dur">{service.duration}</span>
              <p>{service.note}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function BleedLayout() {
  return (
    <div className="sd sd-b">
      {/* The bar has no background of its own — it floats over the scene. */}
      <div className="sd-b-hero">
        <div className="sd-b-scene" aria-hidden="true" />
        <header className="sd-b-bar">
          <span className="sd-b-brand">{DEMO.brand}</span>
          <nav>
            {DEMO.nav.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </nav>
        </header>
        <div className="sd-b-overlay">
          <p className="sd-eyebrow">{DEMO.eyebrow}</p>
          <h1>{DEMO.headline}</h1>
          <p className="sd-lede">{DEMO.lede}</p>
          <span className="sd-btn">{DEMO.cta}</span>
        </div>
      </div>

      <section className="sd-b-band">
        <h2>{DEMO.heading}</h2>
        {/* One contiguous strip — no gutters, no card edges. */}
        <div className="sd-b-strip">
          {DEMO.services.map((service) => (
            <article key={service.name}>
              <div className="sd-b-thumb" aria-hidden="true" />
              <div className="sd-b-caption">
                <h3>{service.name}</h3>
                <span className="sd-dur">{service.duration}</span>
                <p>{service.note}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

/* Each structure carries its own component, so there is no second table to keep
   in step with `STRUCTURES`.

   There *was* one — a `LAYOUT_FOR` map keyed by id — and it shipped broken. A
   rename changed the ids from `editorial`/`sanctuary`/`immersive` to
   `ruled`/`split`/`bleed` by replacing the quoted strings, which did not touch
   that map's **unquoted object keys**. The lookup silently returned `undefined`,
   React got `undefined` as an element type, and the whole route rendered blank.
   The build passed — an undefined component is a runtime failure, not a compile
   one — so nothing caught it before deploy.

   Attaching the component to the entry makes the class of bug impossible rather
   than merely fixed: there is now one list, and a structure without a layout is
   visible at the point you add it. See `STRUCTURES` above — function
   declarations hoist, so those references resolve even though the components are
   defined below it. */

function Ratio({ label, a, b }) {
  const value = contrast(a, b)
  // 4.5:1 is AA for body copy; 3:1 is the large-text allowance, which is why a
  // near-miss is flagged rather than failed outright.
  const state = value >= 4.5 ? 'pass' : value >= 3 ? 'warn' : 'fail'
  // **Truncated, not rounded.** A ratio of 4.4996 rounds to "4.5" and would be
  // printed next to a "large text only" verdict — the readout contradicting
  // itself at exactly the boundary where someone is looking at it closely.
  // Flooring means the number shown can never claim more than it passed.
  const shown = (Math.floor(value * 100) / 100).toFixed(2)
  return (
    <li className={`studio-ratio is-${state}`}>
      <span>{label}</span>
      <strong>{shown}:1</strong>
      <em>{state === 'pass' ? 'AA' : state === 'warn' ? 'large text only' : 'too low'}</em>
    </li>
  )
}

export default function StudioDemo() {
  const [structure, setStructure] = useState(DEFAULTS.structure)
  const [fonts, setFonts] = useState(DEFAULTS.fonts)
  const [colors, setColors] = useState(DEFAULTS.colors)

  // Falls back rather than resolving to undefined: a bad id should render the
  // first structure, never blank the route. Same fail-visible rule the
  // .reveal-ready gate follows.
  const active = STRUCTURES.find((s) => s.id === structure) ?? STRUCTURES[0]
  const Layout = active.Layout

  /* Everything the preview needs, as scoped custom properties. `--sd-`-prefixed
     and set inline on the preview root, so nothing here can reach the rest of
     the page — this widget renders inside a document that has its own strong
     opinions about colour, and a stray global would fight the face toggle. */
  const previewVars = useMemo(
    () => ({
      '--sd-bg': colors.bg,
      '--sd-ink': colors.ink,
      '--sd-accent': colors.accent,
      ...Object.fromEntries(
        ROLES.map((role) => [`--sd-font-${role.id}`, FONT_STACK[fonts[role.id]]])
      ),
    }),
    [colors, fonts]
  )

  const setFont = (role, id) => setFonts((prev) => ({ ...prev, [role]: id }))
  const setColor = (key, value) => setColors((prev) => ({ ...prev, [key]: value }))

  const reset = () => {
    setStructure(DEFAULTS.structure)
    setFonts(DEFAULTS.fonts)
    setColors(DEFAULTS.colors)
  }

  return (
    <div className="studio">
      <div className="studio-controls">
        <fieldset className="studio-group">
          <legend>Structure</legend>
          <div className="studio-segmented">
            {STRUCTURES.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`studio-seg ${option.id === structure ? 'is-on' : ''}`}
                aria-pressed={option.id === structure}
                onClick={() => setStructure(option.id)}
              >
                {option.name}
              </button>
            ))}
          </div>
          <p className="studio-hint">{active.note}</p>
        </fieldset>

        <fieldset className="studio-group">
          <legend>Type</legend>
          <div className="studio-fonts">
            {ROLES.map((role) => (
              <label key={role.id} className="studio-field">
                <span>{role.label}</span>
                <select
                  value={fonts[role.id]}
                  onChange={(event) => setFont(role.id, event.target.value)}
                  style={{ fontFamily: FONT_STACK[fonts[role.id]] }}
                >
                  {FONTS.map((font) => (
                    <option key={font.id} value={font.id} style={{ fontFamily: font.stack }}>
                      {font.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="studio-hint">
            Every face here is already on your machine or already in this
            page&rsquo;s bundle, so the demo costs nothing to load. A real build
            draws on a wider catalogue and fetches only the faces you choose.
          </p>
        </fieldset>

        <fieldset className="studio-group">
          <legend>Colour</legend>
          <div className="studio-presets">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="studio-preset"
                // The three colours only — spreading `preset` would put its
                // `id` and `name` into colour state and they'd reach the
                // custom-property map as junk.
                onClick={() =>
                  setColors({ bg: preset.bg, ink: preset.ink, accent: preset.accent })
                }
                title={preset.name}
              >
                <span style={{ background: preset.bg }} />
                <span style={{ background: preset.accent }} />
                <span style={{ background: preset.ink }} />
                {preset.name}
              </button>
            ))}
          </div>

          <div className="studio-swatches">
            {[
              ['bg', 'Background'],
              ['ink', 'Text'],
              ['accent', 'Accent'],
            ].map(([key, label]) => (
              <label key={key} className="studio-swatch">
                <input
                  type="color"
                  value={colors[key]}
                  onChange={(event) => setColor(key, event.target.value)}
                  aria-label={label}
                />
                <span>{label}</span>
                <code>{colors[key]}</code>
              </label>
            ))}
          </div>

          {/* The part a template gallery never shows you. */}
          <ul className="studio-ratios">
            <Ratio label="Text on background" a={colors.ink} b={colors.bg} />
            <Ratio label="Accent on background" a={colors.accent} b={colors.bg} />
          </ul>
        </fieldset>

        <button type="button" className="studio-reset" onClick={reset}>
          Reset
        </button>
      </div>

      {/* The preview. Fictional throughout — Stillwater Massage is the same
          invented practice the edit demo and the API console use, so the page
          describes one imaginary client rather than a different one per
          section. */}
      <div className="studio-stage">
        <div className="studio-chrome" aria-hidden="true">
          <span />
          <span />
          <span />
          <p>stillwater-massage.example</p>
        </div>

        <div className="studio-preview" data-structure={structure} style={previewVars}>
          <Layout />
        </div>
      </div>
    </div>
  )
}
