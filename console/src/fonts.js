// Fonts a site can use: the site's own, and any Google Fonts serves freely.
// A font a design names that Google Fonts does not have (Canva's licensed
// faces, like BD Script) cannot be served on a website without its own
// licence, so the editor says so and offers the free fonts closest to it,
// each shown with the owner's own words.

const CSS = 'https://fonts.googleapis.com/css2'
const asked = new Map() // family -> Promise<true | false | null>

// Whether Google Fonts serves this family: true, false, or null when it could
// not be asked (offline). For a family it does not have it answers 400 with
// no CORS header, which a browser reports as a failed request, the same as
// being offline; so a failure is checked against a family it certainly has.
const ask = (family) => fetch(`${CSS}?family=${encodeURIComponent(family).replace(/%20/g, '+')}&display=swap`).then((r) => r.ok)
export function googleHas(family) {
  if (!asked.has(family)) {
    asked.set(family, ask(family).catch(() => ask('Roboto').then((up) => (up ? false : null), () => null)))
  }
  return asked.get(family)
}

// Load a Google font into this page (the editor's previews, and the site's
// live preview of a draft), once.
// The promise settles when its stylesheet has arrived, so its faces exist
// for document.fonts.load to fetch.
const links = new Map()
export function loadFont(family, doc = document) {
  if (!family) return Promise.resolve()
  if (links.has(family)) return links.get(family)
  const link = doc.createElement('link')
  link.rel = 'stylesheet'
  // Every weight and slant it has would be more than the editor needs: regular, bold, italic.
  link.href = `${CSS}?family=${encodeURIComponent(family).replace(/%20/g, '+')}&display=swap`
  link.dataset.eotmFont = family
  const ready = new Promise((resolve) => { link.onload = resolve; link.onerror = resolve })
  doc.head.append(link)
  links.set(family, ready)
  return ready
}

// Free fonts by kind, each a likely stand-in for what a design uses. The kind
// is read from the font's own name; the order within a kind is the comparison's.
export const CANDIDATES = {
  // Calligraphic scripts, then thin single-weight signature scripts (Canva's
  // own favourites, like BD Script, are often the second kind).
  script: ['Great Vibes', 'Allura', 'Alex Brush', 'Parisienne', 'Pinyon Script', 'Sacramento', 'Dancing Script', 'Mrs Saint Delafield', 'Monsieur La Doulaise', 'Herr Von Muellerhoff', 'Italianno', 'Rouge Script',
    'Allison', 'Comforter', 'Corinthia', 'Ephesis', 'Birthstone', 'Hurricane', 'Ballet', 'Imperial Script', 'Ingrid Darling', 'Lavishly Yours', 'Mea Culpa', 'The Nautigal', 'Waterfall', 'Whisper', 'Mrs Sheppards', 'Arizonia', 'Petit Formal Script', 'Qwigley'],
  hand: ['Caveat', 'Kalam', 'Patrick Hand', 'Shadows Into Light', 'Indie Flower', 'Gloria Hallelujah', 'Amatic SC', 'Architects Daughter'],
  serif: ['Playfair Display', 'Cormorant Garamond', 'Lora', 'Libre Baskerville', 'EB Garamond', 'Merriweather', 'Crimson Text', 'DM Serif Display'],
  display: ['Bebas Neue', 'Oswald', 'Anton', 'Abril Fatface', 'Righteous', 'Lobster', 'Alfa Slab One', 'Fredoka'],
  sans: ['Montserrat', 'Poppins', 'Open Sans', 'Lato', 'Raleway', 'Nunito', 'Inter', 'Work Sans'],
  mono: ['Space Mono', 'IBM Plex Mono', 'Roboto Mono', 'Courier Prime'],
}
export function kindOf(family) {
  const f = family.toLowerCase()
  if (/script|signature|calligraph|brush|vibes|swash/.test(f)) return 'script'
  if (/hand|marker|chalk|crayon|pen\b|note/.test(f)) return 'hand'
  if (/mono|code|courier|typewriter/.test(f)) return 'mono'
  if (/serif|garamond|baskerville|times|roman|bodoni|didot|caslon|playfair/.test(f) && !/sans/.test(f)) return 'serif'
  if (/display|black|poster|slab|bold/.test(f)) return 'display'
  return 'sans'
}

// The words drawn in a font, inked into a small square for comparing shapes:
// fitted to its box, so size and spacing do not count, only the letters.
function inkOf(text, font, size = 96, cells = 48) {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  ctx.font = `${size}px ${font}`
  const w = Math.ceil(ctx.measureText(text).width) + size
  c.width = Math.min(4000, w)
  c.height = Math.ceil(size * 1.8)
  ctx.font = `${size}px ${font}`
  ctx.textBaseline = 'middle'
  ctx.fillText(text, size / 2, c.height / 2)
  const px = ctx.getImageData(0, 0, c.width, c.height).data
  let l = c.width, r = 0, t = c.height, b = 0
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (px[(y * c.width + x) * 4 + 3] > 64) { l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y) }
  const out = new Float32Array(cells * cells)
  if (r <= l || b <= t) return out
  for (let y = t; y <= b; y++) for (let x = l; x <= r; x++) {
    if (px[(y * c.width + x) * 4 + 3] <= 64) continue
    const gx = Math.min(cells - 1, Math.floor(((x - l) / (r - l + 1)) * cells))
    const gy = Math.min(cells - 1, Math.floor(((y - t) / (b - t + 1)) * cells))
    out[gy * cells + gx] += 1
  }
  const max = Math.max(...out) || 1
  return out.map((v) => v / max)
}
// Alike in shape (where the ink falls, fitted to the box) and in weight (how
// much ink there is): a heavy brush script and a hairline signature can lay
// their letters in the same places.
const likeness = (a, b) => {
  let dot = 0, na = 0, nb = 0, inkA = 0, inkB = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; inkA += a[i] > 0.05 ? 1 : 0; inkB += b[i] > 0.05 ? 1 : 0 }
  const shape = na && nb ? dot / Math.sqrt(na * nb) : 0
  const weight = 1 - Math.min(1, Math.abs(inkA - inkB) / Math.max(inkA, inkB, 1))
  return shape * 0.6 + weight * 0.4
}

// The free fonts closest to one a design uses, best first: [{ family, score }].
// With `original` (the font as the PDF carries it, loaded in this page by
// pdf.js) they are ranked by how alike the owner's words look in each; without,
// they keep their order. Each candidate is loaded before it is drawn.
export async function closestFonts(family, text, { original = null, count = 4 } = {}) {
  const pool = CANDIDATES[kindOf(family)]
  const sample = String(text || family).slice(0, 40)
  await Promise.all(pool.map(async (f) => { await loadFont(f); try { await document.fonts.load(`48px "${f}"`, sample) } catch { /* drawn in a fallback */ } }))
  if (!original) return pool.slice(0, count).map((f) => ({ family: f, score: null }))
  const target = inkOf(sample, `"${original}"`)
  return pool.map((f) => ({ family: f, score: likeness(target, inkOf(sample, `"${f}"`)) }))
    .sort((a, b) => b.score - a.score).slice(0, count)
}

// The size, in the same units as `size`, at which `text` set in `family` spans
// `width`, as the design's own font did: a stand-in font is seldom as wide, and
// a line that grows wraps and moves what is under it. Kept within a third of
// the original size either way. The font must be loaded.
export function fitSize(text, family, width, size) {
  const ctx = document.createElement('canvas').getContext('2d')
  ctx.font = `100px "${family}"`
  const at100 = ctx.measureText(text).width
  if (!at100) return size
  return Math.max(size * 0.67, Math.min(size * 1.33, (width / at100) * 100))
}
