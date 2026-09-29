// The night scene behind the rising runes in the admin page's side panes:
// stars and a faint Milky Way, blue ridges, pines up both edges, and at the
// foot a campfire in a ring of stones, lit by it. Drawn once as SVG; all
// motion is CSS (dashboard.html, .sigils). `key` makes each pane's stars and
// ids its own, so the two panes differ and their gradients never collide.

// A small seeded generator, so a pane's sky is the same on every load.
function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const f = (n) => Math.round(n * 10) / 10

function stars(rand) {
  return Array.from({ length: 70 }, (_, i) => {
    const size = rand() < 0.1 ? 2.4 : 0.8 + rand() * 1.1
    const twinkle = i % 6 === 0 ? ' class="tw"' : ''
    return `<i${twinkle} style="left:${f(rand() * 100)}%;top:${f(rand() * 62)}%;width:${f(size)}px;height:${f(size)}px;--d:${f(2 + rand() * 4)}s"></i>`
  }).join('')
}

// One pine: a trunk and five tiers, narrowing to the tip. (x, y) is the foot.
function pine(x, y, h) {
  const w = h * 0.36
  const tiers = Array.from({ length: 5 }, (_, t) => {
    const top = y - h + t * h * 0.16
    const base = top + h * 0.3
    const half = (w / 2) * (0.35 + t * 0.17)
    return `M${f(x)} ${f(top)}L${f(x + half)} ${f(base)}L${f(x + half * 0.35)} ${f(base - h * 0.02)}L${f(x)} ${f(base + h * 0.02)}L${f(x - half * 0.35)} ${f(base - h * 0.02)}L${f(x - half)} ${f(base)}Z`
  }).join('')
  return `${tiers}M${f(x - w * 0.05)} ${f(y - h * 0.1)}h${f(w * 0.1)}V${f(y)}h${f(-w * 0.1)}Z`
}

// A flame tongue: a teardrop from a base of width w, leaning `lean` at its tip.
function tongue(cx, base, w, h, lean) {
  return `M${f(cx - w / 2)} ${base}C${f(cx - w / 2)} ${f(base - h * 0.45)} ${f(cx + lean - w * 0.12)} ${f(base - h * 0.75)} ${f(cx + lean)} ${f(base - h)}`
    + `C${f(cx + lean + w * 0.1)} ${f(base - h * 0.72)} ${f(cx + w / 2)} ${f(base - h * 0.45)} ${f(cx + w / 2)} ${base}Z`
}

// A stone centred on (x, y). Drawn without a transform on purpose: the light is
// a gradient in the pit's own coordinates, centred on the fire, and a transform
// would move the fire as each stone sees it.
function stone(x, y, rx, ry, lit, shade) {
  const e = (fill) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" />`
  return e('#35312d') + e(`url(#${lit})`) + e(`url(#${shade})`)
}

export function campfire(key) {
  const rand = seeded(key * 7919)
  const id = (name) => `${name}-${key}`
  // Fire centre and the foot of the flames, in the pit's 320 x 230 drawing.
  const cx = 160
  const base = 176
  const back = [[62, 172, 20, 12, -8], [100, 160, 18, 11, 6], [140, 154, 16, 10, -4], [182, 154, 17, 10, 5], [222, 160, 19, 12, -6], [258, 172, 21, 12, 8]]
  const front = [[48, 196, 24, 15, 5], [96, 208, 26, 16, -4], [150, 213, 25, 15, 3], [204, 210, 27, 16, -5], [256, 198, 24, 15, 6]]
  // [foot x offset, top x offset, top height] for each log of the teepee.
  const logs = [[-60, -12, 50], [58, 11, 54], [-26, 6, 62], [30, -5, 58]]
  const tongues = [
    [cx, 118, 74, 150, 3, 1.9], [cx - 26, 116, 44, 108, -14, 1.3], [cx + 26, 116, 46, 114, 12, 1.6],
    [cx - 46, 112, 30, 72, -18, 1.1], [cx + 48, 112, 30, 78, 16, 1.4], [cx - 8, 118, 34, 128, -6, 1.05],
  ]
  const wisps = Array.from({ length: 6 }, (_, i) => ({ x: cx - 24 + rand() * 48, delay: f(-i * 0.37), d: f(1 + rand() * 0.8) }))
  return `
    <div class="sky" aria-hidden="true">${stars(rand)}<div class="milky"></div></div>
    <svg class="land" viewBox="0 0 400 360" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <path class="ridge-far" d="M0 196L38 150L70 176L112 118L150 160L188 128L232 176L268 112L310 162L350 134L400 170V360H0Z" />
      <path class="ridge-near" d="M0 236L46 206L92 232L140 196L196 230L244 204L290 234L338 208L400 236V360H0Z" />
      <path class="ground" d="M0 300Q200 282 400 300V360H0Z" />
    </svg>
    <svg class="pines is-left" viewBox="0 0 200 520" preserveAspectRatio="xMinYMax meet" aria-hidden="true" focusable="false">
      <path d="${pine(28, 520, 470)}${pine(96, 520, 340)}${pine(150, 520, 250)}" /></svg>
    <svg class="pines is-right" viewBox="0 0 200 520" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" focusable="false">
      <path d="${pine(172, 520, 450)}${pine(104, 520, 330)}${pine(52, 520, 240)}" /></svg>
    <div class="firelight" aria-hidden="true"></div>
    <svg class="pit" viewBox="0 0 320 230" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="${id('lit')}" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${base - 14}" r="210">
          <stop offset="0" stop-color="#fdba74" stop-opacity=".9" /><stop offset=".22" stop-color="#f97316" stop-opacity=".6" />
          <stop offset=".45" stop-color="#c2410c" stop-opacity=".28" /><stop offset=".8" stop-color="#7c2d12" stop-opacity="0" /></radialGradient>
        <linearGradient id="${id('shade')}" x1="0" y1="0" x2="0" y2="1">
          <stop offset=".35" stop-color="#000" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity=".7" /></linearGradient>
        <linearGradient id="${id('flame')}" gradientUnits="userSpaceOnUse" x1="0" y1="${base}" x2="0" y2="${base - 150}">
          <stop offset="0" stop-color="#fffbeb" /><stop offset=".16" stop-color="#fde68a" /><stop offset=".4" stop-color="#fb923c" />
          <stop offset=".7" stop-color="#dc2626" stop-opacity=".75" /><stop offset="1" stop-color="#7f1d1d" stop-opacity="0" /></linearGradient>
        <linearGradient id="${id('core')}" gradientUnits="userSpaceOnUse" x1="0" y1="${base}" x2="0" y2="${base - 90}">
          <stop offset="0" stop-color="#ffffff" /><stop offset=".45" stop-color="#fef3c7" /><stop offset="1" stop-color="#fbbf24" stop-opacity="0" /></linearGradient>
        <radialGradient id="${id('pool')}"><stop offset="0" stop-color="#f59e0b" stop-opacity=".55" /><stop offset="1" stop-color="#f59e0b" stop-opacity="0" /></radialGradient>
        <filter id="${id('burn')}" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04 0.09" numOctaves="2" seed="${key}">
            <animate attributeName="baseFrequency" values="0.04 0.09;0.05 0.12;0.04 0.09" dur="2.6s" repeatCount="indefinite" /></feTurbulence>
          <feDisplacementMap in="SourceGraphic" scale="9" result="shaped" />
          <feGaussianBlur in="shaped" stdDeviation="1.2" /></filter>
        <filter id="${id('glow')}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      <ellipse class="pool" cx="${cx}" cy="${base + 4}" rx="160" ry="42" fill="url(#${id('pool')})" />
      <g fill="url(#${id('lit')})" class="stones">${back.map(([x, y, rx, ry]) => stone(x, y, rx, ry, id('lit'), id('shade'))).join('')}</g>
      <g class="flames" filter="url(#${id('burn')})">
        <g filter="url(#${id('glow')})" opacity=".6">${tongues.map(([x, , w, h, lean]) => `<path d="${tongue(x, base, w * 1.3, h * 1.05, lean)}" fill="#f97316" />`).join('')}</g>
        ${tongues.map(([x, , w, h, lean, d], i) => `<path class="tongue" style="--d:${d}s;--i:${i}" d="${tongue(x, base, w, h, lean)}" fill="url(#${id('flame')})" />`).join('')}
        <path class="tongue" style="--d:1.2s;--i:9" d="${tongue(cx, base, 40, 80, 2)}" fill="url(#${id('core')})" />
        ${wisps.map((w) => `<path class="wisp" style="--delay:${w.delay}s;--d:${w.d}s" d="${tongue(w.x, 70, 9, 24, 1)}" fill="url(#${id('flame')})" />`).join('')}
      </g>
      <g class="logs">${logs.map(([foot, top, h], i) => {
        const [x1, y1, x2, y2] = [cx + foot, base + 8, cx + top, base - h]
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="log" />
          <line x1="${x1 + (foot < 0 ? 3 : -3)}" y1="${y1 - 2}" x2="${x2}" y2="${y2 + 4}" class="log-lit" />
          <line x1="${f(x1 + (x2 - x1) * 0.3)}" y1="${f(y1 + (y2 - y1) * 0.3)}" x2="${f(x1 + (x2 - x1) * 0.45)}" y2="${f(y1 + (y2 - y1) * 0.45)}" class="crack" style="--i:${i}" />`
      }).join('')}</g>
      <g fill="url(#${id('lit')})" class="stones">${front.map(([x, y, rx, ry]) => stone(x, y, rx, ry, id('lit'), id('shade'))).join('')}</g>
    </svg>`
}
