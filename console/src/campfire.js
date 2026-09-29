// The night scene behind the rising runes in the admin page's side panes:
// stars and a faint Milky Way, blue ridges, pines, and a campfire in a ring of
// stones. The sky and ridges are SVG; the trees, stones and logs are painted
// (scenery.js) and the fire is particles (startFire), because shapes alone
// looked like a cartoon. `key` makes each pane's sky, trees and ids its own.
// The left pane's fire stands left of centre and the right pane's right of it
// (dashboard.html, --fire-x), so the two frame the page.

import { seeded, paintTrees, paintPit } from './scenery.js'

const f = (n) => Math.round(n * 10) / 10

function stars(rand) {
  return Array.from({ length: 90 }, (_, i) => {
    const size = rand() < 0.08 ? 2.2 : 0.6 + rand() * 1.1
    const twinkle = i % 6 === 0 ? ' class="tw"' : ''
    return `<i${twinkle} style="left:${f(rand() * 100)}%;top:${f(rand() * 62)}%;width:${f(size)}px;height:${f(size)}px;opacity:${f(0.35 + rand() * 0.6)};--d:${f(2 + rand() * 4)}s"></i>`
  }).join('')
}

// Fire centre and the foot of the flames, in the pit's 320 x 230 drawing, and
// what surrounds it: stones behind and in front, and the logs' teepee as
// [foot x offset, top x offset, top height].
const CX = 160
const BASE = 176
const PIT = {
  cx: CX,
  base: BASE,
  back: [[58, 170, 21, 13], [96, 159, 19, 12], [136, 153, 17, 10], [180, 153, 18, 11], [221, 159, 20, 12], [260, 170, 22, 13]],
  front: [[44, 196, 25, 16], [93, 208, 28, 17], [150, 213, 26, 16], [206, 209, 28, 17], [260, 197, 25, 16]],
  logs: [[-58, -10, 52], [56, 10, 56], [-24, 7, 64], [30, -6, 60]],
}

export function campfire(key) {
  const rand = seeded(key * 7919)
  const id = (name) => `${name}-${key}`
  return `
    <div class="sky" aria-hidden="true">${stars(rand)}<div class="milky"></div></div>
    <svg class="land" viewBox="0 0 400 360" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <defs>
        <filter id="${id('rockface')}" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018 0.05" numOctaves="4" seed="${key}" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 -.18" result="speck" />
          <feComposite in="speck" in2="SourceAlpha" operator="in" result="grain" />
          <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="grain" /></feMerge></filter>
        <linearGradient id="${id('haze')}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#1d3a5c" /><stop offset="1" stop-color="#0d1d31" /></linearGradient>
      </defs>
      <path class="ridge-far" filter="url(#${id('rockface')})" d="M0 196L22 170L38 150L52 161L70 176L90 146L112 118L128 136L150 160L170 139L188 128L208 150L232 176L250 139L268 112L288 138L310 162L330 146L350 134L376 156L400 170V360H0Z" />
      <path fill="url(#${id('haze')})" filter="url(#${id('rockface')})" d="M0 236L24 219L46 206L70 222L92 232L118 210L140 196L166 216L196 230L220 214L244 204L268 222L290 234L316 218L338 208L370 224L400 236V360H0Z" />
      <path class="ground" d="M0 262Q200 248 400 262V360H0Z" />
    </svg>
    <canvas class="trees" aria-hidden="true"></canvas>
    <div class="firelight" aria-hidden="true"></div>
    <div class="pit" aria-hidden="true">
      <svg viewBox="0 0 320 230" focusable="false">
        <defs>
          <radialGradient id="${id('pool')}"><stop offset="0" stop-color="#f59e0b" stop-opacity=".5" /><stop offset=".6" stop-color="#c2410c" stop-opacity=".15" /><stop offset="1" stop-color="#c2410c" stop-opacity="0" /></radialGradient>
          <radialGradient id="${id('ash')}"><stop offset="0" stop-color="#1c1410" /><stop offset=".7" stop-color="#120d0a" /><stop offset="1" stop-color="#120d0a" stop-opacity="0" /></radialGradient>
        </defs>
        <ellipse class="pool" cx="${CX}" cy="${BASE + 6}" rx="165" ry="46" fill="url(#${id('pool')})" />
        <ellipse cx="${CX}" cy="${BASE + 4}" rx="70" ry="16" fill="url(#${id('ash')})" />
      </svg>
      <canvas class="pit-back"></canvas>
      <canvas class="flame-canvas"></canvas>
      <canvas class="pit-front"></canvas>
    </div>`
}

// Paints the trees and the pit into a mounted scene, again whenever the pane
// changes size, and lights the fire. `side` is 'left' or 'right'.
export function startScene(pane, key, side) {
  const fireX = side === 'left' ? 0.36 : 0.64
  const paintAll = () => {
    paintTrees(pane.querySelector('canvas.trees'), key, side, fireX)
    paintPit(pane.querySelector('canvas.pit-back'), key, 'back', PIT)
    paintPit(pane.querySelector('canvas.pit-front'), key, 'front', PIT)
  }
  let timer = null
  let last = ''
  new ResizeObserver(() => {
    const r = pane.getBoundingClientRect()
    const size = `${Math.round(r.width)}x${Math.round(r.height)}`
    if (!r.width || size === last) return
    last = size
    clearTimeout(timer)
    timer = setTimeout(paintAll, 120)
  }).observe(pane)
  startFire(pane.querySelector('.flame-canvas'))
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
