// The night scene behind the rising runes in the admin page's side panes:
// stars and a faint Milky Way, blue ridges, pines, and a campfire in a ring of
// stones. The sky and ridges are SVG; the trees, stones and logs are painted
// (scenery.js) and the fire is a noise shader, or particles without WebGL
// (startFire), because shapes alone looked like a cartoon. `key` makes each
// pane's sky, trees and ids its own.
// The left pane's fire stands left of centre and the right pane's right of it
// (dashboard.html, --fire-x), so the two frame the page.

import { seeded, paintTrees, paintPit } from './scenery.js'
import SceneryWorker from './scenery.worker.js?worker&inline'

// Painting runs in a worker (scenery.worker.js) wherever OffscreenCanvas does,
// so the page and the flame never wait on it; elsewhere, on the page as before.
let worker
let jobId = 0
const replies = new Map()
function painter() {
  if (worker !== undefined) return worker
  try {
    worker = typeof OffscreenCanvas === 'undefined' ? null : new SceneryWorker()
    if (worker) worker.onmessage = ({ data }) => { replies.get(data.id)?.(data.bitmap); replies.delete(data.id) }
  } catch {
    worker = null
  }
  return worker
}

// Paints `canvas` at its current size through the worker, keeping the old
// picture until the new one arrives; `fallback` paints it on the page instead.
// A reply that a newer request has overtaken is dropped.
const latest = new WeakMap()
function paintOff(canvas, job, fallback) {
  const w = painter()
  if (!w) return Promise.resolve(fallback())
  const r = canvas.getBoundingClientRect()
  if (!r.width) return Promise.resolve(false)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const pw = Math.round(r.width * dpr)
  const ph = Math.round(r.height * dpr)
  const id = ++jobId
  latest.set(canvas, id)
  return new Promise((resolve) => {
    replies.set(id, (bitmap) => {
      if (latest.get(canvas) === id) {
        canvas.width = pw
        canvas.height = ph
        canvas.getContext('2d').drawImage(bitmap, 0, 0)
      }
      bitmap.close()
      resolve(true)
    })
    w.postMessage({ ...job, id, w: r.width, h: r.height, dpr, pw, ph })
  })
}

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
  // Inner logs stand behind the fire, outer ones in front of it.
  backLogs: [[-26, 12, 42], [30, -12, 40], [2, -6, 46]],
  logs: [[-58, 10, 34], [56, -10, 36]],
  // Kindling sticks, [foot x offset, top x offset, top height], behind and in front.
  backSticks: [[-40, 8, 30], [36, -6, 32], [-12, 14, 38]],
  frontSticks: [[-24, 4, 22], [30, 2, 20]],
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
      <canvas class="pit-mid"></canvas>
      <canvas class="pit-front"></canvas>
    </div>
    <div class="burn" aria-hidden="true">
      <svg class="burn-svg" focusable="false">
        <defs>
          <filter id="${id('tear')}" x="-12%" y="-12%" width="124%" height="124%">
            <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="2" seed="${11 + key}" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="26" xChannelSelector="R" yChannelSelector="G" result="torn" />
            <feGaussianBlur in="torn" stdDeviation="3" />
          </filter>
          <mask id="${id('burn')}" maskUnits="userSpaceOnUse">
            <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
            <circle class="burn-hole" fill="#000" filter="url(#${id('tear')})" />
          </mask>
        </defs>
      </svg>
      <div class="burn-sheet" style="mask: url(#${id('burn')}); -webkit-mask: url(#${id('burn')})"></div>
      <div class="burn-ember-warp" style="filter: url(#${id('tear')})"><div class="burn-ember"></div></div>
    </div>`
}

// Paints the trees and the pit into a mounted scene, again whenever the pane
// changes size, and lights the fire. `side` is 'left' or 'right'. The fire's
// place is the pane's --fire-x, which the phone layout centres.
export function startScene(pane, key, side) {
  const fireX = () => parseFloat(getComputedStyle(pane).getPropertyValue('--fire-x')) / 100 || (side === 'left' ? 0.36 : 0.64)
  // The pit is drawn pixel by pixel, the costly part; it keeps its size when
  // only the pane's height changes, so it is repainted only when it resizes.
  let pitSize = ''
  const paintAll = async () => {
    const jobs = [paintOff(pane.querySelector('canvas.trees'), { kind: 'trees', key, side, fireX: fireX() }, () => paintTrees(pane.querySelector('canvas.trees'), key, side, fireX()))]
    const pit = pane.querySelector('.pit').getBoundingClientRect()
    const size = `${Math.round(pit.width)}x${Math.round(pit.height)}`
    if (size !== pitSize) {
      pitSize = size
      for (const layer of ['back', 'mid', 'front']) {
        const canvas = pane.querySelector(`canvas.pit-${layer}`)
        jobs.push(paintOff(canvas, { kind: 'pit', key, layer, pit: PIT }, () => paintPit(canvas, key, layer, PIT)))
      }
    }
    // Shown once every layer is in, so the scene never appears half-drawn.
    await Promise.all(jobs)
    pane.classList.add('is-painted')
    if (!lit) light()
  }
  // The pane opens black (dashboard.html, .burn). Once the scene is painted
  // the fire is lit, and when it has drawn its first frame the dark burns away
  // outward from the fire, as Edge of the Map's pages burn between modes
  // (edgeOfTheMap/src/App.css, BURN). A pane that never paints burns anyway.
  // The burn layer is hidden once it has passed, so its filter costs nothing after.
  let lit = false
  const burn = () => {
    if (pane.classList.contains('is-lit')) return
    pane.classList.add('is-lit')
    setTimeout(() => pane.classList.add('is-burnt'), 2600)
  }
  const light = () => {
    lit = true
    startFire(pane.querySelector('.flame-canvas'))
    requestAnimationFrame(() => requestAnimationFrame(burn))
  }
  setTimeout(burn, 5000)
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
}

// ---------------------------------------------------------------- fire
// Particles rise from the logs, cooling from white through amber and red to
// nothing; drawn with additive blending, so where they overlap the fire is
// hottest. Colours are pre-drawn sprites, one per stage of a particle's life.
function sprites() {
  const stops = [[235, 110, 35], [255, 175, 70], [255, 205, 115], [250, 135, 40], [205, 62, 20], [120, 30, 12]]
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
  return Array.from({ length: 24 }, (_, i) => {
    const t = (i / 23) * (stops.length - 1)
    const c = mix(stops[Math.floor(t)], stops[Math.min(stops.length - 1, Math.floor(t) + 1)], t % 1)
    const s = document.createElement('canvas')
    s.width = s.height = 64
    const g = s.getContext('2d')
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, `rgba(${c},0.3)`)
    grad.addColorStop(0.35, `rgba(${c},0.12)`)
    grad.addColorStop(1, `rgba(${c},0)`)
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    return s
  })
}

let SPRITES = null
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5

// Runs the fire in `canvas`, which spans x 70-250 and y -190 to 190 of the pit's
// drawing (dashboard.html, .flame-canvas): the shader flame where WebGL runs,
// the particle fire where it does not. Stops drawing while its pane is
// hidden; with reduced motion, draws one settled frame and stops.
export function startFire(canvas) {
  if (!canvas.getContext) return
  // It catches rather than appearing at full height.
  const kindle = (c) => c.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 1200, easing: 'ease-out' })
  if (startShaderFire(canvas)) return kindle(canvas)
  // A canvas that gave out a WebGL context cannot give a 2D one: the
  // particles get a fresh copy of it.
  const fresh = canvas.cloneNode(false)
  canvas.replaceWith(fresh)
  startParticleFire(fresh)
  kindle(fresh)
}

function startParticleFire(canvas) {
  SPRITES ??= sprites()
  const ctx = canvas.getContext('2d')
  const W = 180
  const H = 380
  const fx = CX - 70 // the fire's centre and base, in the canvas's own units
  const fy = BASE - 4 + 190
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
  // Tongues: a few sources that wander along the bed of the fire. Particles
  // from one source rise together, so the flame parts into separate tongues.
  const sources = Array.from({ length: 7 }, (_, i) => ({ at: (i - 3) * 12.5, phase: Math.random() * 6.3, speed: 0.012 + Math.random() * 0.02, x: fx }))
  const spawn = () => {
    const src = sources[Math.floor(Math.random() * sources.length)]
    const x = src.x + gauss() * 6
    const edge = Math.min(1, Math.abs(x - fx) / 46)
    parts.push({ x, y: fy + gauss() * 4, vx: gauss() * 0.08, vy: -(1.5 + Math.random() * 0.8),
      life: 0, decay: 0.0075 + Math.random() * 0.009 + edge * 0.012, r: 12 + Math.random() * 9 - edge * 3, seed: Math.random() * 100 })
  }
  let t = 0
  let surge = 1
  let target = 1
  const step = () => {
    t += 1
    if (Math.random() < 0.004) target = 0.82 + Math.random() * 0.55
    surge += (target - surge) * 0.012
    for (const src of sources) src.x = fx + src.at + Math.sin(t * src.speed + src.phase) * 7
    const count = 5 + surge * 2.5
    // A ceiling, so a long surge can never pile up more than a frame can draw.
    if (parts.length < 1400) for (let i = 0; i < count; i++) spawn()
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      p.life += p.decay / surge
      if (p.life >= 1) { parts.splice(i, 1); continue }
      // Hot gas speeds up as it rises and is drawn in toward the tip, wavering.
      p.vy = Math.max(-3.4 * Math.sqrt(surge), p.vy - 0.045 * surge)
      p.vx = p.vx * 0.94 + (fx - p.x) * 0.0035 + Math.sin(t * 0.11 + p.seed + p.y * 0.06) * 0.08
      p.x += p.vx
      p.y += p.vy
    }
  }
  const draw = () => {
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'lighter'
    for (const p of parts) {
      const sprite = SPRITES[Math.min(23, Math.floor(p.life * 24))]
      // Shrinks and stretches upward as it rises, so tongues end in points.
      // Small where it is born (so the bed glows rather than blows out), fullest
      // a third of the way up, then narrowing to a point.
      const r = p.r * (p.life < 0.3 ? 0.45 + p.life * 1.9 : 1.02 - (p.life - 0.3) * 1.3)
      const stretch = 1.2 + p.life * 1.4 + Math.min(1.2, -p.vy * 0.3)
      // Faint while young: the bed is where most particles overlap, and would white out.
      // Fades out before the canvas's top edge, so no flame is ever cut off by it.
      ctx.globalAlpha = Math.min(1, p.life / 0.2) * (0.15 + 0.85 * Math.min(1, p.life / 0.5)) * Math.min(1, Math.max(0, (p.y - 20) / 60))
      ctx.drawImage(sprite, p.x - r, p.y - r * stretch * 0.6, r * 2, r * 2 * stretch)
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  // The simulation steps 60 times a second of clock time, however fast the
  // screen refreshes: stepping once per frame burned a 144 Hz screen's fire
  // 2.4 times faster. After a stall (a hidden tab) it catches up at most 4 steps.
  const STEP = 1000 / 60
  let clock = null
  let owed = 0
  const frame = (now) => {
    if (canvas.offsetParent !== null && (canvas.width || size())) {
      owed = Math.min(owed + (clock === null ? STEP : now - clock), STEP * 4)
      for (; owed >= STEP; owed -= STEP) step()
      draw()
    }
    clock = now
    if (!still) requestAnimationFrame(frame)
  }
  if (still) {
    if (size()) { for (let i = 0; i < 90; i++) step(); draw() }
    return
  }
  new ResizeObserver(() => size()).observe(canvas)
  requestAnimationFrame(frame)
}

// ---------------------------------------------------------------- shader fire
// One continuous flame drawn per pixel on the GPU, after the usual real-time
// fire technique (The Book of Shaders, noise and fBm chapters; Inigo Quilez,
// "domain warping"): layered noise scrolls upward through a flame-shaped
// envelope, warped by more noise so the edges fold and split into tongues.
// Colour comes from temperature, as a blackbody cools: near-white at the core,
// then yellow, orange, and deep red at the edges. The height flickers at about
// 10 Hz, as a small wood fire does, under a slower surge. Time is the clock's.
const FIRE_VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0., 1.); }`
const FIRE_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float uScale;
uniform float uTime;
uniform float uSurge;
// Hashed on the lattice point taken mod 289, exact in 32-bit floats, so the
// noise is periodic every 289 units and never loses precision.
float hash(vec2 i) {
  i = mod(i, 289.);
  float x = mod((i.x * 34. + 1.) * i.x, 289.);
  x = mod(((x + i.y) * 34. + 1.) * (x + i.y), 289.);
  return x / 289.;
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0., a = .5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2. + vec2(1.7, 9.2); a *= .5; }
  return v;
}
vec3 blackbody(float k) {
  vec3 c = mix(vec3(.42, .04, .01), vec3(1., .3, .03), smoothstep(0., .35, k));
  c = mix(c, vec3(1., .66, .17), smoothstep(.35, .7, k));
  return mix(c, vec3(1., .93, .74), smoothstep(.78, 1., k));
}
void main() {
  // Canvas units, y up: the fire's foot is at (90, 18), its body about 46 wide each side, 200 tall.
  vec2 u = gl_FragCoord.xy / uScale;
  float x = (u.x - 90.) / 46.;
  float h = (u.y - 18.) / 200.;
  float t = uTime;
  // The flicker moves only the flame's outline (hh), never the noise inside it:
  // scaling the noise with it shook the whole texture ten times a second.
  // Sums of sines, so it is smooth however fast it pulses.
  float flick = 1. + .03 * sin(t * 62.83 + .8 * sin(t * 7.1)) + .02 * sin(t * 41.3 + 1.7);
  float hh = max(h, 0.) / (uSurge * flick);
  // Time enters the noise only wrapped to 289, the noise's own period (octaves
  // double exactly, so every octave repeats with it): the coordinates stay
  // small and the scroll is seamless. Unwrapped, they grew with the page's age
  // until float precision made the texture step instead of flow.
  vec2 q = vec2(x * 1.5, max(h, 0.) * 2.2 - mod(t * 1.9, 289.));
  vec2 w = vec2(fbm(q + vec2(0., mod(t * .4, 289.))), fbm(q + vec2(5.2, 1.3 - mod(t * .2, 289.))));
  float n = fbm(q + (w - .5) * 3.2 + vec2(3.1, 7.7));
  float sway = (w.x - .5) * .55 * h + sin(t * 1.3 + h * 2.) * .06 * h;
  float width = 1.02 * max(.05, 1. - hh * .55);
  float d = abs(x - sway);
  float body = 1. - smoothstep(width * .35, width, d);
  // Noise breaks the flame up only near its outline, so no fire floats free of it.
  float near = 1. - smoothstep(width * .7, width * 1.25, d);
  float heat = body * (1.15 - hh * .95) + (n - .5) * (.55 + hh * .9) * near;
  heat += exp(-x * x * 9.) * (1. - smoothstep(0., .3, hh)) * .35;
  // Tips may part from the body, but not far above it.
  heat *= smoothstep(-.08, .06, h) * (1. - smoothstep(.95, 1.3, hh)) * (1. - smoothstep(1.4, 1.7, h));
  heat = clamp(heat, 0., 1.);
  float a = smoothstep(.12, .45, heat);
  // Premultiplied, and slightly brighter than its cover, so it adds light where it overlaps.
  gl_FragColor = vec4(blackbody(smoothstep(.12, 1., heat)) * a, a * .85);
}`

function startShaderFire(canvas) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false })
  if (!gl) return false
  const shader = (type, src) => {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
  }
  const vs = shader(gl.VERTEX_SHADER, FIRE_VERT)
  const fs = shader(gl.FRAGMENT_SHADER, FIRE_FRAG)
  if (!vs || !fs) return false
  const prog = gl.createProgram()
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false
  gl.useProgram(prog)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const at = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(at)
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0)
  const uScale = gl.getUniformLocation(prog, 'uScale')
  const uTime = gl.getUniformLocation(prog, 'uTime')
  const uSurge = gl.getUniformLocation(prog, 'uSurge')

  const W = 180
  const H = 380
  let scale = 1
  const size = () => {
    const r = canvas.getBoundingClientRect()
    if (!r.width) return false
    scale = (r.width / W) * Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(W * scale)
    canvas.height = Math.round(H * scale)
    gl.viewport(0, 0, canvas.width, canvas.height)
    return true
  }
  // Each pane's fire starts at its own point in time, so the two never match.
  const offset = Math.random() * 500
  let surge = 1
  let target = 1
  let clock = null
  const draw = (now) => {
    const dt = clock === null ? 0 : Math.min(0.1, (now - clock) / 1000)
    clock = now
    if (Math.random() < dt * 0.25) target = 0.85 + Math.random() * 0.35
    surge += (target - surge) * Math.min(1, dt * 0.7)
    gl.uniform1f(uScale, scale)
    // Wrapped at 2890 s, a whole number of the noise's 289 periods for each
    // scroll speed (1.9, 0.4, 0.2), so the wrap is invisible.
    gl.uniform1f(uTime, (offset + now / 1000) % 2890)
    gl.uniform1f(uSurge, surge)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (still) {
    if (size()) draw(0)
    return true
  }
  const frame = (now) => {
    if (canvas.offsetParent !== null && (canvas.width || size())) draw(now)
    else clock = null
    requestAnimationFrame(frame)
  }
  new ResizeObserver(() => size()).observe(canvas)
  requestAnimationFrame(frame)
  return true
}
