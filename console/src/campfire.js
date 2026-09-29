// The night scene behind the rising runes in the admin page's side panes:
// stars and a faint Milky Way, blue ridges with a far treeline, pines up both
// edges, and at the foot a campfire in a ring of stones.
//
// Realism comes from texture rather than shapes: the fire is hundreds of
// glowing particles on a canvas, added together the way light adds (startFire);
// the stones are noise lit by a point light at the fire, so each face is lit by
// its angle and distance to it; bark and needles are noise too. `key` makes each
// pane's sky, trees and ids its own, so the two panes differ and never collide.

// A small seeded generator, so a pane looks the same on every load.
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
  return Array.from({ length: 90 }, (_, i) => {
    const size = rand() < 0.08 ? 2.2 : 0.6 + rand() * 1.1
    const twinkle = i % 6 === 0 ? ' class="tw"' : ''
    return `<i${twinkle} style="left:${f(rand() * 100)}%;top:${f(rand() * 62)}%;width:${f(size)}px;height:${f(size)}px;opacity:${f(0.35 + rand() * 0.6)};--d:${f(2 + rand() * 4)}s"></i>`
  }).join('')
}

// A pine's outline, (x, y) its foot: a tip, then tier after tier of drooping
// branches, each ragged at its end, widening toward the ground.
function pine(rand, x, y, h) {
  const levels = 16
  const top = y - h
  const right = [[x, top]]
  const left = []
  for (let k = 1; k <= levels; k++) {
    const t = k / levels
    const at = top + h * 0.9 * t
    const reach = h * 0.2 * Math.pow(t, 0.85) * (0.8 + rand() * 0.4)
    const droop = reach * (0.28 + rand() * 0.12)
    const inR = reach * (0.18 + rand() * 0.14)
    const inL = reach * (0.18 + rand() * 0.14)
    right.push([x + reach, at + droop], [x + reach * 0.82, at + droop - 2 - rand() * 3], [x + inR, at + reach * 0.28])
    left.push([x - inL, at + reach * 0.28], [x - reach * 0.82, at + droop - 2 - rand() * 3], [x - reach * (0.9 + rand() * 0.2), at + droop])
  }
  const trunk = h * 0.018
  const pts = [...right, [x + trunk, y], [x - trunk, y], ...left.reverse()]
  return `M${pts.map(([px, py]) => `${f(px)} ${f(py)}`).join('L')}Z`
}

// An irregular stone: a lumpy loop of points around (x, y).
function stone(rand, x, y, rx, ry) {
  const n = 9
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    const r = 0.82 + rand() * 0.3
    // Flatter underneath, where it sits on the ground.
    const sy = Math.sin(a) > 0 ? 0.75 : 1
    return [x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r * sy]
  })
  // Smooth the loop: curve through midpoints, using each point as the control.
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
  const start = mid(pts[n - 1], pts[0])
  return `M${f(start[0])} ${f(start[1])}${pts.map((p, i) => {
    const m = mid(p, pts[(i + 1) % n])
    return `Q${f(p[0])} ${f(p[1])} ${f(m[0])} ${f(m[1])}`
  }).join('')}Z`
}

// Fire centre and the foot of the flames, in the pit's 320 x 230 drawing.
const CX = 160
const BASE = 176

export function campfire(key) {
  const rand = seeded(key * 7919)
  const id = (name) => `${name}-${key}`
  const back = [[58, 170, 21, 13], [96, 159, 19, 12], [136, 153, 17, 10], [180, 153, 18, 11], [221, 159, 20, 12], [260, 170, 22, 13]]
  const front = [[44, 194, 25, 16], [93, 207, 28, 17], [150, 213, 26, 16], [206, 209, 28, 17], [260, 196, 25, 16]]
  // [foot x offset, top x offset, top height] for each log of the teepee.
  const logs = [[-60, -12, 50], [58, 11, 54], [-26, 6, 62], [30, -5, 58]]
  const farTrees = Array.from({ length: 34 }, (_, i) => pine(rand, i * 12 + rand() * 8, 250 + rand() * 10, 26 + rand() * 20)).join('')
  const light = `<fePointLight x="${CX}" y="${BASE - 34}" z="46" />`
  return `
    <div class="sky" aria-hidden="true">${stars(rand)}<div class="milky"></div></div>
    <svg class="land" viewBox="0 0 400 360" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <defs>
        <filter id="${id('rockface')}" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018 0.05" numOctaves="4" seed="${key}" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 -.18" result="speck" />
          <feComposite in="speck" in2="SourceAlpha" operator="in" result="grain" />
          <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="grain" /></feMerge></filter>
        <filter id="${id('needles')}" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="2" seed="${key + 3}" />
          <feDisplacementMap in="SourceGraphic" scale="4" /></filter>
        <linearGradient id="${id('haze')}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#1d3a5c" /><stop offset="1" stop-color="#0d1d31" /></linearGradient>
      </defs>
      <path class="ridge-far" filter="url(#${id('rockface')})" d="M0 196L22 170L38 150L52 161L70 176L90 146L112 118L128 136L150 160L170 139L188 128L208 150L232 176L250 139L268 112L288 138L310 162L330 146L350 134L376 156L400 170V360H0Z" />
      <path fill="url(#${id('haze')})" filter="url(#${id('rockface')})" d="M0 236L24 219L46 206L70 222L92 232L118 210L140 196L166 216L196 230L220 214L244 204L268 222L290 234L316 218L338 208L370 224L400 236V360H0Z" />
      <path class="far-trees" filter="url(#${id('needles')})" d="${farTrees}" />
      <path class="ground" d="M0 262Q200 248 400 262V360H0Z" />
    </svg>
    <svg class="pines is-left" viewBox="0 0 200 520" preserveAspectRatio="xMinYMax meet" aria-hidden="true" focusable="false">
      <path filter="url(#${id('needles')})" d="${pine(rand, 30, 530, 480)}${pine(rand, 98, 530, 350)}${pine(rand, 150, 530, 250)}" /></svg>
    <svg class="pines is-right" viewBox="0 0 200 520" preserveAspectRatio="xMaxYMax meet" aria-hidden="true" focusable="false">
      <path filter="url(#${id('needles')})" d="${pine(rand, 170, 530, 460)}${pine(rand, 104, 530, 340)}${pine(rand, 52, 530, 240)}" /></svg>
    <div class="firelight" aria-hidden="true"></div>
    <div class="pit" aria-hidden="true">
      <svg viewBox="0 0 320 230" focusable="false">
        <defs>
          <filter id="${id('rock')}" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.055" numOctaves="4" seed="${key + 7}" result="n" />
            <feDiffuseLighting in="n" surfaceScale="1.8" diffuseConstant="1.1" lighting-color="#ff9442" result="lit">${light}</feDiffuseLighting>
            <feComposite in="lit" in2="SourceAlpha" operator="in" result="face" />
            <feBlend in="face" in2="SourceGraphic" mode="multiply" /></filter>
          <filter id="${id('bark')}" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9 0.08" numOctaves="3" seed="${key + 11}" result="n" />
            <feDiffuseLighting in="n" surfaceScale="3" lighting-color="#ff9d57" result="lit">${light}</feDiffuseLighting>
            <feComposite in="lit" in2="SourceAlpha" operator="in" result="bark" />
            <feBlend in="bark" in2="SourceGraphic" mode="multiply" /></filter>
          <radialGradient id="${id('pool')}"><stop offset="0" stop-color="#f59e0b" stop-opacity=".5" /><stop offset=".6" stop-color="#c2410c" stop-opacity=".15" /><stop offset="1" stop-color="#c2410c" stop-opacity="0" /></radialGradient>
          <radialGradient id="${id('ash')}"><stop offset="0" stop-color="#1c1410" /><stop offset=".7" stop-color="#120d0a" /><stop offset="1" stop-color="#120d0a" stop-opacity="0" /></radialGradient>
        </defs>
        <ellipse class="pool" cx="${CX}" cy="${BASE + 6}" rx="165" ry="46" fill="url(#${id('pool')})" />
        <ellipse cx="${CX}" cy="${BASE + 4}" rx="70" ry="16" fill="url(#${id('ash')})" />
        <g class="stones" filter="url(#${id('rock')})">${back.map(([x, y, rx, ry]) => `<path d="${stone(rand, x, y, rx, ry)}" />`).join('')}</g>
      </svg>
      <canvas class="flame-canvas"></canvas>
      <svg viewBox="0 0 320 230" focusable="false">
        <g class="logs" filter="url(#${id('bark')})">${logs.map(([foot, top, h]) => `<line x1="${CX + foot}" y1="${BASE + 8}" x2="${CX + top}" y2="${BASE - h}" />`).join('')}</g>
        <g class="embers-bed">${logs.map(([foot, top, h], i) => {
          const at = (k) => [f(CX + foot + (top - foot) * k), f(BASE + 8 - (h + 8) * k)]
          const [a, b] = [at(0.12 + (i % 2) * 0.08), at(0.3 + (i % 2) * 0.06)]
          return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" style="--i:${i}" />`
        }).join('')}</g>
        <g class="stones" filter="url(#${id('rock')})">${front.map(([x, y, rx, ry]) => `<path d="${stone(rand, x, y, rx, ry)}" />`).join('')}</g>
      </svg>
    </div>`
}

// ---------------------------------------------------------------- fire
// Particles rise from the logs, cooling from white through amber and red to
// nothing; drawn with additive blending, so where they overlap the fire is
// hottest. Colours are pre-drawn sprites, one per stage of a particle's life.
function sprites() {
  const stops = [[255, 250, 225], [255, 223, 140], [255, 170, 60], [245, 110, 25], [200, 60, 20], [120, 30, 12]]
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
  return Array.from({ length: 24 }, (_, i) => {
    const t = (i / 23) * (stops.length - 1)
    const c = mix(stops[Math.floor(t)], stops[Math.min(stops.length - 1, Math.floor(t) + 1)], t % 1)
    const s = document.createElement('canvas')
    s.width = s.height = 64
    const g = s.getContext('2d')
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, `rgba(${c},0.36)`)
    grad.addColorStop(0.35, `rgba(${c},0.16)`)
    grad.addColorStop(1, `rgba(${c},0)`)
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    return s
  })
}

let SPRITES = null
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5

// Runs the fire in `canvas`, which spans x 70-250 and y -70 to 190 of the pit's
// drawing (dashboard.html, .flame-canvas). Stops drawing while its pane is
// hidden; with reduced motion, draws one settled frame and stops.
export function startFire(canvas) {
  if (!canvas.getContext) return
  SPRITES ??= sprites()
  const ctx = canvas.getContext('2d')
  const W = 180
  const H = 260
  const fx = CX - 70 // the fire's centre and base, in the canvas's own units
  const fy = BASE - 4 + 70
  const parts = []
  let scale = 1
  const size = () => {
    const r = canvas.getBoundingClientRect()
    if (!r.width) return false
    scale = (r.width / W) * Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(W * scale)
    canvas.height = Math.round(H * scale)
    return true
  }
  const spawn = () => {
    const spread = 32
    const x = fx + gauss() * spread
    const edge = Math.abs(x - fx) / spread
    parts.push({ x, y: fy - 6 + gauss() * 4, vx: gauss() * 0.2, vy: -(1.3 + Math.random() * 1.5) * (1.2 - edge * 0.55),
      life: 0, decay: 0.009 + Math.random() * 0.013 + edge * 0.012, r: 16 + Math.random() * 14, seed: Math.random() * 100 })
  }
  let t = 0
  const step = () => {
    t += 1
    for (let i = 0; i < 11; i++) spawn()
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      p.life += p.decay
      if (p.life >= 1) { parts.splice(i, 1); continue }
      // Draw toward the centre as it rises, with a wavering sideways pull: tongues.
      p.vx += (fx - p.x) * 0.003 + Math.sin(t * 0.07 + p.seed * 0.3 + p.y * 0.035) * 0.06
      p.x += p.vx
      p.y += p.vy
      p.vy *= 0.997
    }
  }
  const draw = () => {
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'lighter'
    for (const p of parts) {
      const sprite = SPRITES[Math.min(23, Math.floor(p.life * 24))]
      const r = p.r * (1 - p.life * 0.7)
      ctx.globalAlpha = p.life < 0.08 ? p.life / 0.08 : 1
      ctx.drawImage(sprite, p.x - r, p.y - r, r * 2, r * 2)
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const frame = () => {
    if (canvas.offsetParent !== null && (canvas.width || size())) {
      step()
      draw()
    }
    if (!still) requestAnimationFrame(frame)
  }
  if (still) {
    if (size()) { for (let i = 0; i < 90; i++) step(); draw() }
    return
  }
  new ResizeObserver(() => size()).observe(canvas)
  requestAnimationFrame(frame)
}
