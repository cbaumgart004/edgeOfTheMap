// The Elder Futhark, for the glossary at the foot of the admin page (the rune
// staff on Edge of the Map's logo). Names are the reconstructed Proto-Germanic
// ones, which is why they carry an asterisk: no source spells them out. Order
// follows the Kylver stone (c. 400 AD), the oldest complete row. Meanings come
// mostly from the later rune poems; where scholars disagree the entry says so.

import { campfire } from './campfire.js'

export const AETTIR = [
  {
    name: "Freyr's ætt",
    runes: [
      { glyph: 'ᚠ', name: 'fehu', sound: 'f', meaning: 'Cattle; wealth. Moveable riches, earned and shared.' },
      { glyph: 'ᚢ', name: 'ūruz', sound: 'u', meaning: 'Aurochs, the extinct wild ox. Raw strength.' },
      { glyph: 'ᚦ', name: 'þurisaz', sound: 'th (þ)', meaning: 'Giant (a thurs). A force against order.' },
      { glyph: 'ᚨ', name: 'ansuz', sound: 'a', meaning: 'A god, one of the Æsir. Speech and inspiration.' },
      { glyph: 'ᚱ', name: 'raidō', sound: 'r', meaning: 'Riding; a journey.' },
      { glyph: 'ᚲ', name: 'kaunan', sound: 'k', meaning: 'Ulcer or sore in the rune poems; read as torch in English tradition. Uncertain.' },
      { glyph: 'ᚷ', name: 'gebō', sound: 'g', meaning: 'Gift, and the bond a gift creates.' },
      { glyph: 'ᚹ', name: 'wunjō', sound: 'w', meaning: 'Joy.' },
    ],
  },
  {
    name: "Heimdall's (or Hagal's) ætt",
    runes: [
      { glyph: 'ᚺ', name: 'hagalaz', sound: 'h', meaning: 'Hail. Destruction from the sky that melts into water.' },
      { glyph: 'ᚾ', name: 'naudiz', sound: 'n', meaning: 'Need; hardship.' },
      { glyph: 'ᛁ', name: 'īsaz', sound: 'i', meaning: 'Ice. Stillness.' },
      { glyph: 'ᛃ', name: 'jēra', sound: 'j (y)', meaning: 'Year; a good harvest.' },
      { glyph: 'ᛈ', name: 'perþ', sound: 'p', meaning: 'Unknown. Guesses include a pear tree and a gaming piece. The Kylver stone sets it before ᛇ; later rows swap them.' },
      { glyph: 'ᛇ', name: 'ī(h)waz', sound: 'ï (between i and e)', meaning: 'Yew, the evergreen tree of bows.' },
      { glyph: 'ᛉ', name: 'algiz', sound: 'z (later R)', meaning: 'Elk, or protection. Uncertain.' },
      { glyph: 'ᛊ', name: 'sōwilō', sound: 's', meaning: 'Sun.' },
    ],
  },
  {
    name: "Týr's ætt",
    runes: [
      { glyph: 'ᛏ', name: 'tīwaz', sound: 't', meaning: 'The god Týr. Justice, sacrifice.' },
      { glyph: 'ᛒ', name: 'berkanan', sound: 'b', meaning: 'Birch. Growth and renewal.' },
      { glyph: 'ᛖ', name: 'ehwaz', sound: 'e', meaning: 'Horse. Trust between horse and rider.' },
      { glyph: 'ᛗ', name: 'mannaz', sound: 'm', meaning: 'Man; humankind.' },
      { glyph: 'ᛚ', name: 'laguz', sound: 'l', meaning: 'Water; lake.' },
      { glyph: 'ᛜ', name: 'ingwaz', sound: 'ng (ŋ)', meaning: 'The god Ing (Yngvi-Freyr).' },
      { glyph: 'ᛞ', name: 'dagaz', sound: 'd', meaning: 'Day. The Kylver stone ends ᛞ ᛟ; many modern rows end ᛟ ᛞ.' },
      { glyph: 'ᛟ', name: 'ōþila', sound: 'o', meaning: 'Inheritance; ancestral land.' },
    ],
  },
]

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const ALL = AETTIR.flatMap((aett) => aett.runes.map((r) => ({ ...r, aett: aett.name })))

// Draws the glossary into `root`: three rows of eight, and the chosen rune's
// entry beneath. Plain DOM, like the rest of the admin page. Returns
// select(n), which the rising sigils call to show rune n (1 to 24).
export function mountRunes(root) {
  let n = 0
  root.innerHTML = `${AETTIR.map((aett, a) => `
    <div class="aett">
      <h3>${esc(aett.name)} <span class="meta">runes ${a * 8 + 1} to ${a * 8 + 8}</span></h3>
      <div class="rune-row">${aett.runes.map((r) => { n += 1; return `<button type="button" class="rune" data-rune="${n}" aria-label="${n}. ${esc(r.name)}" aria-pressed="false">${r.glyph}</button>` }).join('')}</div>
    </div>`).join('')}
    <div class="rune-entry" aria-live="polite"><p class="meta">Choose a rune.</p></div>
    <p class="meta">Order after the Kylver stone. The three groups of eight are attested on the oldest rows; their names come from later Icelandic tradition.</p>`
  const select = (i) => {
    const r = ALL[i - 1]
    for (const b of root.querySelectorAll('button[data-rune]')) b.setAttribute('aria-pressed', String(Number(b.dataset.rune) === i))
    root.querySelector('.rune-entry').innerHTML = `
      <span class="rune-big" aria-hidden="true">${r.glyph}</span>
      <div><strong>${i}. *${esc(r.name)}</strong> <span class="meta">${esc(r.aett)} · sound ${esc(r.sound)}</span>
      <p>${esc(r.meaning)}</p></div>`
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-rune]')
    if (b) select(Number(b.dataset.rune))
  })
  return select
}

// Lanes in an uneven order, so the rise reads as drift rather than a staircase.
const LANES = [0, 2, 1, 2, 0, 1]

// A side pane: runes `from` to `to` (1-based) rising as smoke from the
// campfire at its foot (campfire.js). Each is a button that calls pick(n). All motion is CSS
// (dashboard.html, .sigils); this lays out the pieces and their delays.
export function mountSigils(pane, from, to, pick) {
  const runes = ALL.slice(from - 1, to)
  const sigil = (r, n, beat, lane, echo) => `<button type="button" class="sigil${echo ? ' is-echo' : ''}" data-rune="${n}"
    style="--i:${beat};--n:${runes.length};--lane:${lane}" ${echo ? 'tabindex="-1" aria-hidden="true"' : `aria-label="${n}. ${esc(r.name)}"`}>
    <span><b aria-hidden="true">${r.glyph}</b><em>${esc(r.name)}</em></span></button>`
  const bits = (count) => Array.from({ length: count }, (_, i) => `<i style="--i:${i}"></i>`).join('')
  pane.innerHTML = `${campfire(from)}
    <div class="smoke" aria-hidden="true">${bits(7)}</div>
    <div class="rise">${runes.map((r, i) => sigil(r, from + i, i, LANES[i % 6], false)).join('')}${
      // A second stream, shown only when the pane is wide: half a beat behind in another lane,
      // starting half-way through the row so neighbours are never the same rune.
      runes.map((_, i) => { const k = (i + runes.length / 2) % runes.length; return sigil(runes[k], from + k, i + 0.5, LANES[(i + 3) % 6], true) }).join('')}</div>
    <div class="embers" aria-hidden="true">${bits(9)}</div>`
  pane.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-rune]')
    if (b) pick(Number(b.dataset.rune))
  })
}
