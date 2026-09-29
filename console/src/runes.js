// The Elder Futhark, for the glossary at the foot of the admin page (the rune
// staff on Edge of the Map's logo). Names are the reconstructed Proto-Germanic
// ones, which is why they carry an asterisk: no source spells them out. Order
// follows the Kylver stone (c. 400 AD), the oldest complete row. Meanings come
// mostly from the later rune poems; where scholars disagree the entry says so.

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

// Draws the three ættir into `left` and the chosen rune's entry into `right`
// (the two side gutters of the admin page). Plain DOM, like the rest of it.
export function mountRunes(left, right) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  let n = 0
  left.innerHTML = `<h2>The Elder Futhark</h2>${AETTIR.map((aett, a) => `
    <div class="aett">
      <h3>${esc(aett.name)} <span class="meta">runes ${a * 8 + 1} to ${a * 8 + 8}</span></h3>
      <div class="rune-row">${aett.runes.map((r) => { n += 1; return `<button type="button" class="rune" data-rune="${n}" aria-label="${n}. ${esc(r.name)}" aria-pressed="false">${r.glyph}</button>` }).join('')}</div>
    </div>`).join('')}
    <p class="meta">Order after the Kylver stone. The groups of eight are attested on the oldest rows; their names come from later Icelandic tradition.</p>`
  right.innerHTML = '<div class="rune-entry"><p class="meta">Choose a rune on the left.</p></div>'
  const all = AETTIR.flatMap((aett) => aett.runes.map((r) => ({ ...r, aett: aett.name })))
  left.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-rune]')
    if (!b) return
    const i = Number(b.dataset.rune)
    const r = all[i - 1]
    for (const other of left.querySelectorAll('button[data-rune]')) other.setAttribute('aria-pressed', String(other === b))
    right.querySelector('.rune-entry').innerHTML = `
      <span class="rune-big" aria-hidden="true">${r.glyph}</span>
      <strong>${i}. *${esc(r.name)}</strong><br /><span class="meta">${esc(r.aett)} · sound ${esc(r.sound)}</span>
      <p>${esc(r.meaning)}</p>`
  })
}
