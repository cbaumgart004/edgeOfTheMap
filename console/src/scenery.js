// Painted parts of the campfire scene (campfire.js): the pines, and the stones
// and logs of the pit. Each is shaded pixel by pixel from noise and a light at
// the fire, which is what vector shapes could not give them: rock with pits and
// ridges catching the light, charred bark, needles instead of outlines.
// Everything is drawn once per size, not per frame.

export function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Smooth value noise and its fractal sum, from a seeded table.
function noise(rand) {
  const vals = Float32Array.from({ length: 256 }, rand)
  const perm = Uint8Array.from({ length: 512 }, (_, i) => i & 255)
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]] }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i]
  const at = (x, y) => vals[perm[perm[x & 255] + (y & 255)]]
  const n = (x, y) => {
    const xi = Math.floor(x); const yi = Math.floor(y)
    const u = x - xi; const v = y - yi
    const su = u * u * (3 - 2 * u); const sv = v * v * (3 - 2 * v)
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * su
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * su
    return a + (b - a) * sv
  }
  return (x, y, oct = 4) => {
    let sum = 0; let amp = 0.5; let freq = 1; let norm = 0
    for (let o = 0; o < oct; o++) { sum += n(x * freq, y * freq) * amp; norm += amp; amp *= 0.5; freq *= 2.03 }
    return sum / norm
  }
}

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
// Filmic-ish tone curve so bright firelight rolls off instead of clipping.
const tone = (v) => Math.round(255 * clamp(1 - Math.exp(-v * 1.6)))
const FIRE = [1.0, 0.56, 0.22]
const SKY = [0.16, 0.24, 0.42]

// Light reaching a surface point at (px, py) with normal n, from the fire at
// (fx, fy) hanging `lift` units above the ground toward the viewer.
function shade(n, px, py, fire) {
  const lx = fire.x - px; const ly = fire.y - py; const lz = fire.lift
  const d = Math.hypot(lx, ly, lz)
  const lambert = Math.max(0, (n[0] * lx + n[1] * ly + n[2] * lz) / d)
  const fall = fire.power / (1 + (d * d) / (fire.reach * fire.reach))
  const sky = Math.max(0, -n[1] * 0.6 + n[2] * 0.4) * 0.35
  return [FIRE[0] * lambert * fall + SKY[0] * sky, FIRE[1] * lambert * fall + SKY[1] * sky, FIRE[2] * lambert * fall + SKY[2] * sky]
}

// A stone: an irregular dome with a pitted, ridged surface. `k` is device
// pixels per drawing unit; (x, y) its centre in drawing units.
export function paintStone(ctx, k, x, y, rx, ry, fire, fbm, seed) {
  const W = Math.ceil(rx * 2.4 * k); const H = Math.ceil(ry * 2.4 * k)
  const x0 = Math.round((x - rx * 1.2) * k); const y0 = Math.round((y - ry * 1.2) * k)
  const img = ctx.createImageData(W, H)
  const d = img.data
  const e = 0.035
  // Height of the surface at (u, v), each in -1.2..1.2: a dome, rough on top.
  const edgeAt = (a) => 0.86 + 0.22 * fbm(Math.cos(a) * 1.3 + seed, Math.sin(a) * 1.3 + seed, 3)
  const height = (u, v) => {
    const r = Math.hypot(u, v * (v > 0 ? 1.25 : 1)) / edgeAt(Math.atan2(v, u))
    if (r >= 1) return -1
    return Math.sqrt(1 - r * r) * 0.9 + (fbm(u * 3.2 + seed, v * 3.2 - seed, 5) - 0.5) * 0.28
  }
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const u = ((i + 0.5) / W) * 2.4 - 1.2; const v = ((j + 0.5) / H) * 2.4 - 1.2
      const h = height(u, v)
      if (h < 0) continue
      const hx = (height(u + e, v) - height(u - e, v)) / (2 * e)
      const hy = (height(u, v + e) - height(u, v - e)) / (2 * e)
      const len = Math.hypot(hx, hy, 1)
      const n = [-hx / len, -hy / len, 1 / len]
      const px = x + u * rx; const py = y + v * ry
      const l = shade(n, px, py, fire)
      // Grey rock, blotched, darker in its pits.
      const grain = fbm(u * 7 + seed * 3, v * 7, 3)
      const albedo = 0.3 + grain * 0.22 - Math.max(0, 0.45 - h) * 0.25
      // Ground contact: the underside falls into shadow.
      const ao = clamp(0.35 + h * 1.1) * (v > 0.55 ? clamp(1 - (v - 0.55) * 1.4) : 1)
      const o = (j * W + i) * 4
      d[o] = tone(l[0] * albedo * ao * 1.05)
      d[o + 1] = tone(l[1] * albedo * ao)
      d[o + 2] = tone(l[2] * albedo * ao * 0.95)
      d[o + 3] = Math.round(255 * clamp(h * 14))
    }
  }
  paint(ctx, img, x0, y0)
}

// A log from (x1, y1) at its foot to (x2, y2): a charred cylinder with bark
// grooves along it, lit from the fire, embers glowing low down.
export function paintLog(ctx, k, x1, y1, x2, y2, radius, fire, fbm, seed) {
  const minX = Math.min(x1, x2) - radius * 1.5; const minY = Math.min(y1, y2) - radius * 1.5
  const W = Math.ceil((Math.abs(x2 - x1) + radius * 3) * k); const H = Math.ceil((Math.abs(y2 - y1) + radius * 3) * k)
  const x0 = Math.round(minX * k); const y0 = Math.round(minY * k)
  const img = ctx.createImageData(W, H)
  const d = img.data
  const ax = x2 - x1; const ay = y2 - y1; const L = Math.hypot(ax, ay)
  const dx = ax / L; const dy = ay / L
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const px = minX + (i + 0.5) / k; const py = minY + (j + 0.5) / k
      const t = (px - x1) * dx + (py - y1) * dy
      const s = ((px - x1) * -dy + (py - y1) * dx) / radius
      // Rounded ends, a slightly uneven edge.
      const edge = 1 - 0.08 * fbm(t * 0.2 + seed, seed, 2)
      const endT = t < 0 ? -t / radius : t > L ? (t - L) / radius : 0
      const r2 = s * s + endT * endT
      if (r2 >= edge * edge) continue
      const z = Math.sqrt(1 - r2 / (edge * edge))
      // Bark: grooves running along the log.
      const groove = fbm(t * 0.08 + seed, s * 2.6, 4)
      const n0 = [-dy * s, dx * s, z]
      const bump = (groove - 0.5) * 0.9
      const n = [n0[0] + -dy * bump, n0[1] + dx * bump, n0[2]]
      const nl = Math.hypot(n[0], n[1], n[2])
      const l = shade([n[0] / nl, n[1] / nl, n[2] / nl], px, py, fire)
      const albedo = 0.06 + groove * 0.12
      // Embers in the cracks near the foot, where the wood burns.
      const low = clamp(1 - t / (L * 0.55))
      const glow = Math.max(0, fbm(t * 0.3 + seed * 2, s * 4, 3) - 0.58) * 5 * low
      const o = (j * W + i) * 4
      d[o] = tone(l[0] * albedo * z + glow * 1.6)
      d[o + 1] = tone(l[1] * albedo * z + glow * 0.55)
      d[o + 2] = tone(l[2] * albedo * z + glow * 0.12)
      d[o + 3] = Math.round(255 * clamp((edge - Math.sqrt(r2)) * 12))
    }
  }
  paint(ctx, img, x0, y0)
}

// putImageData ignores blending, so each piece goes through its own canvas.
function paint(ctx, img, x, y) {
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  c.getContext('2d').putImageData(img, 0, 0)
  ctx.drawImage(c, x, y)
}

// A conifer, foot at (x, y), h tall: a trunk, and branch after branch from the
// tip down, each drooping and fringed with needle strokes. One path, one stroke.
function conifer(ctx, rand, x, y, h, width) {
  ctx.beginPath()
  ctx.moveTo(x, y - h)
  const tiers = 9
  for (let k = 1; k <= tiers; k++) {
    const t = k / tiers
    ctx.lineTo(x + h * width * 0.5 * Math.pow(t, 0.9) * (0.8 + rand() * 0.3), y - h + h * 0.93 * t)
    ctx.lineTo(x + h * width * 0.14 * t, y - h + h * 0.93 * t - h * 0.03)
  }
  ctx.lineTo(x + h * 0.01, y)
  ctx.lineTo(x - h * 0.01, y)
  for (let k = tiers; k >= 1; k--) {
    const t = k / tiers
    ctx.lineTo(x - h * width * 0.14 * t, y - h + h * 0.93 * t - h * 0.03)
    ctx.lineTo(x - h * width * 0.5 * Math.pow(t, 0.9) * (0.8 + rand() * 0.3), y - h + h * 0.93 * t)
  }
  ctx.closePath()
  ctx.fillStyle = ctx.strokeStyle
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x, y - h)
  const count = Math.round(h / 1.9)
  for (let b = 0; b < count; b++) {
    const t = b / count
    const by = y - h + h * 0.94 * Math.pow(t, 0.95) + rand() * 3
    const side = rand() < 0.5 ? -1 : 1
    const reach = h * width * Math.pow(t, 0.85) * (0.6 + rand() * 0.55) + 3
    const lift = (0.2 - t * 0.55 + (rand() - 0.5) * 0.25)
    const steps = Math.max(3, Math.round(reach / 2.2))
    let px = x; let py = by
    for (let s = 1; s <= steps; s++) {
      const f = s / steps
      const nx = x + side * reach * f
      const ny = by - reach * lift * f + reach * 0.25 * f * f
      ctx.moveTo(px, py)
      ctx.lineTo(nx, ny)
      // Needles hang from the branch, longer toward its middle.
      const nl = (2.2 + rand() * 3.2) * (1 - Math.abs(f - 0.45)) * (0.6 + t * 0.7)
      for (let q = 0; q < 5; q++) {
        const a = Math.PI / 2 + (rand() - 0.5) * 1.9 + side * 0.35
        ctx.moveTo(nx, ny)
        ctx.lineTo(nx + Math.cos(a) * nl * side * 0.6, ny + Math.sin(a) * nl)
      }
      px = nx; py = ny
    }
  }
  ctx.stroke()
}

// The trees of one pane, drawn into `canvas` over its full size. `side` puts
// the big trees on the pane's outer edge; `fireX` (0-1) is where the fire
// stands, whose light warms the trees nearest it.
export function paintTrees(canvas, key, side, fireX) {
  const r = canvas.getBoundingClientRect()
  if (!r.width) return false
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(r.width * dpr)
  canvas.height = Math.round(r.height * dpr)
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const rand = seeded(key * 104729)
  const W = r.width; const H = r.height
  const ground = H - Math.min(150, H * 0.17)
  const outer = side === 'left' ? 0 : 1
  const at = (p) => (outer === 0 ? p : 1 - p) * W
  // Far to near: hazier and bluer behind, near-black in front.
  const rows = [
    { color: '#0f2036', width: 0.2, lw: 1.1, trees: [[0.3, 0.3], [0.62, 0.26], [0.84, 0.32], [0.12, 0.28], [0.5, 0.22]], base: ground - 18 },
    { color: '#060d18', width: 0.22, lw: 1.3, trees: [[0.2, 0.46], [0.76, 0.4], [0.9, 0.5]], base: ground - 4 },
    { color: '#010307', width: 0.25, lw: 1.6, trees: [[0.03, 0.72], [0.14, 0.54], [0.97, 0.6]], base: H + 6 },
  ]
  for (const row of rows) {
    ctx.strokeStyle = row.color
    ctx.lineWidth = row.lw
    ctx.lineCap = 'round'
    for (const [p, frac] of row.trees) conifer(ctx, rand, at(p) + (rand() - 0.5) * 10, row.base, H * frac * (0.9 + rand() * 0.2), row.width)
  }
  // Firelight on whatever it reaches: warm, fading with distance.
  ctx.globalCompositeOperation = 'source-atop'
  const g = ctx.createRadialGradient(fireX * W, ground + 40, 10, fireX * W, ground + 40, Math.max(W, 300) * 0.55)
  g.addColorStop(0, 'rgba(255,130,50,0.2)')
  g.addColorStop(0.35, 'rgba(200,80,30,0.06)')
  g.addColorStop(1, 'rgba(200,80,30,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  ctx.globalCompositeOperation = 'source-over'
  return true
}

// The pit's back logs and stones (`layer` 'back', behind the fire), the back
// logs again to veil over it ('mid'), or its front logs and stones
// ('front'), into a canvas laid over the pit's 320 x 230 drawing.
export function paintPit(canvas, key, layer, pit) {
  const r = canvas.getBoundingClientRect()
  if (!r.width) return false
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(r.width * dpr)
  canvas.height = Math.round(r.height * dpr)
  const k = canvas.width / 320
  const ctx = canvas.getContext('2d')
  const fbm = noise(seeded(key * 31337))
  const fire = { x: pit.cx, y: pit.base - 22, lift: 34, power: 3.2, reach: 70 }
  const logFire = { ...fire, y: pit.base - 16, lift: 20, power: 1.5 }
  if (layer === 'back') {
    pit.back.forEach(([x, y, rx, ry], i) => paintStone(ctx, k, x, y, rx, ry, fire, fbm, i * 1.7 + key))
    pit.backLogs.forEach(([foot, top, h], i) => paintLog(ctx, k, pit.cx + foot, pit.base + 6, pit.cx + top, pit.base - h, 7, logFire, fbm, i * 3.1 + key + 20))
  } else if (layer === 'mid') {
    // The back logs again, over the fire and veiled (dashboard.html, .pit-mid):
    // seen through the flames, as real logs are, instead of lost behind them.
    pit.backLogs.forEach(([foot, top, h], i) => paintLog(ctx, k, pit.cx + foot, pit.base + 6, pit.cx + top, pit.base - h, 7, logFire, fbm, i * 3.1 + key + 20))
  } else {
    pit.logs.forEach(([foot, top, h], i) => paintLog(ctx, k, pit.cx + foot, pit.base + 8, pit.cx + top, pit.base - h, 7.5, logFire, fbm, i * 2.3 + key))
    pit.front.forEach(([x, y, rx, ry], i) => paintStone(ctx, k, x, y, rx, ry, fire, fbm, i * 2.9 + key + 40))
  }
  return true
}
