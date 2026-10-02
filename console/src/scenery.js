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
  // Deeper relief than a smooth dome: coarse lumps, and cracks cut into them.
  const crackAt = (u, v) => Math.pow(clamp(1 - Math.abs(fbm(u * 2.4 + seed * 2, v * 2.4, 4) - 0.5) * 8), 3)
  const height = (u, v) => {
    const r = Math.hypot(u, v * (v > 0 ? 1.25 : 1)) / edgeAt(Math.atan2(v, u))
    if (r >= 1) return -1
    return Math.sqrt(1 - r * r) * 0.9 + (fbm(u * 3.2 + seed, v * 3.2 - seed, 5) - 0.5) * 0.4 - crackAt(u, v) * 0.1
  }
  // Its shadow on the ground first, so it sits on the earth instead of floating.
  ctx.save()
  ctx.translate(x * k, (y + ry * 0.7) * k)
  ctx.scale(1, 0.38)
  const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 1.3 * k)
  sh.addColorStop(0, 'rgba(0,0,0,.6)')
  sh.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = sh
  ctx.fillRect(-rx * 1.3 * k, -rx * 1.3 * k, rx * 2.6 * k, rx * 2.6 * k)
  ctx.restore()
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
      // Grey rock, blotched, darker in its pits and cracks, flecked like
      // granite, and sooted on the face that looks into the fire.
      const grain = fbm(u * 7 + seed * 3, v * 7, 3)
      const fleck = fbm(u * 24 + seed, v * 24 - seed, 2)
      const sp = fleck > 0.64 ? 0.12 : fleck < 0.36 ? -0.07 : 0
      const toward = Math.sign(fire.x - x) * u
      const soot = clamp(toward * 0.9 + 0.1) * clamp(0.9 - v) * 0.5
      const albedo = Math.max(0.03, (0.3 + grain * 0.22 + sp - Math.max(0, 0.45 - h) * 0.25) * (1 - soot) * (1 - crackAt(u, v) * 0.6))
      // Ground contact: the underside and the cracks fall into shadow.
      const ao = clamp(0.25 + h * 1.3) * (v > 0.5 ? clamp(1 - (v - 0.5) * 1.5) : 1)
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
  const minX = Math.min(x1, x2) - radius * 2; const minY = Math.min(y1, y2) - radius * 2
  const W = Math.ceil((Math.abs(x2 - x1) + radius * 4) * k); const H = Math.ceil((Math.abs(y2 - y1) + radius * 4) * k)
  const x0 = Math.round(minX * k); const y0 = Math.round(minY * k)
  const img = ctx.createImageData(W, H)
  const d = img.data
  const ax = x2 - x1; const ay = y2 - y1; const L = Math.hypot(ax, ay)
  const dx = ax / L; const dy = ay / L
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const px = minX + (i + 0.5) / k; const py = minY + (j + 0.5) / k
      const t = (px - x1) * dx + (py - y1) * dy
      // Not a turned cylinder: it tapers toward the top, bows a little, and
      // swells and narrows along its length; knots stand proud of the bark.
      const along = clamp(t / L)
      const bow = Math.sin(Math.PI * along) * radius * 0.35 * (seed % 2 < 1 ? 1 : -1) + (fbm(t * 0.07 + seed, 5.5, 2) - 0.5) * radius * 0.5
      const knot = Math.max(0, 1 - Math.hypot((t - L * (0.3 + (seed % 1) * 0.4)) / (radius * 0.9), (((px - x1) * -dy + (py - y1) * dx) - bow) / radius - 0.55) * 1.6) * 0.18
      const girth = radius * (1 - along * 0.16) * (0.9 + 0.2 * fbm(t * 0.04 + seed * 3, 1.7, 2)) * (1 + knot)
      const s = ((px - x1) * -dy + (py - y1) * dx - bow) / girth
      // A rounded foot, a slightly uneven edge, and a broken top: the far end
      // is splintered rather than capped, which is what read as a cartoon.
      const top = t > L ? 0.55 + 0.6 * fbm(s * 3.8 + seed, seed * 2.3, 3) : 1
      const edge = (1 - 0.08 * fbm(t * 0.2 + seed, seed, 2)) * top
      const endT = t < 0 ? -t / girth : t > L ? (t - L) / girth : 0
      const r2 = s * s + endT * endT
      if (r2 >= edge * edge) continue
      // The broken top keeps the log's round shading across it; elsewhere the end rounds off.
      const z = t > L ? Math.sqrt(1 - Math.min(1, s * s)) : Math.sqrt(1 - r2 / (edge * edge))
      // Bark: grooves running along the log.
      const groove = fbm(t * 0.08 + seed, s * 2.6, 4)
      // Char: the whole foot, burning out unevenly toward the top.
      const char = clamp(1.2 - t / (L * 0.72) + (fbm(t * 0.05 + seed, s + seed, 2) - 0.5) * 0.9)
      // Alligator cracks in the char: the thin ridges of a noise field.
      const rv = fbm(t * 0.24 + seed * 1.3, s * 3.4 + seed, 3)
      const crack = Math.pow(clamp(1 - Math.abs(rv - 0.5) * 10), 2) * char
      const n0 = [-dy * s, dx * s, z]
      const bump = (groove - 0.5) * 0.9 - crack * 0.5 + knot * 3
      const n = [n0[0] + -dy * bump, n0[1] + dx * bump, n0[2]]
      const nl = Math.hypot(n[0], n[1], n[2])
      const l = shade([n[0] / nl, n[1] / nl, n[2] / nl], px, py, fire)
      // Unburnt bark is brown with grain along it; char is near black and
      // faintly silvered where it has ashed over; broken wood at the top end is pale.
      const grain = fbm(t * 0.6 + seed, s * 9, 3)
      const bark = [0.2 + grain * 0.12, 0.13 + grain * 0.07, 0.08 + grain * 0.04]
      const ash = clamp((fbm(t * 0.4 + seed, s * 5 - seed, 2) - 0.6) * 4) * char
      const coal = [0.05 + groove * 0.09 + ash * 0.1, 0.045 + groove * 0.08 + ash * 0.1, 0.04 + groove * 0.07 + ash * 0.1]
      const broke = t > L ? clamp(endT * 2.5) * (0.8 + 0.4 * fbm(s * 14 + seed, t * 0.5, 2)) : 0
      const wood = [0.34, 0.24, 0.15]
      const albedo = [0, 1, 2].map((c) => (bark[c] + (coal[c] - bark[c]) * char) * (1 - broke) * (1 - crack * 0.85) + wood[c] * broke * (1 - char))
      // Embers in the cracks near the foot, where the wood burns.
      const low = clamp(1 - t / (L * 0.55))
      const glow = (Math.max(0, fbm(t * 0.3 + seed * 2, s * 4, 3) - 0.58) * 5 + crack * 0.9) * low
      const o = (j * W + i) * 4
      d[o] = tone(l[0] * albedo[0] * z + glow * 1.6)
      d[o + 1] = tone(l[1] * albedo[1] * z + glow * 0.55)
      d[o + 2] = tone(l[2] * albedo[2] * z + glow * 0.12)
      d[o + 3] = Math.round(255 * clamp((edge - Math.sqrt(r2)) * 12))
    }
  }
  paint(ctx, img, x0, y0)
}

// The bed of the fire: a heap of coals and ash under the logs, lumpy, glowing
// hottest at its heart and in the cracks between lumps, grey with ash at its rim.
export function paintCoals(ctx, k, cx, cy, rx, ry, fbm, seed) {
  const W = Math.ceil(rx * 2.2 * k); const H = Math.ceil(ry * 3.2 * k)
  const x0 = Math.round((cx - rx * 1.1) * k); const y0 = Math.round((cy - ry * 2) * k)
  const img = ctx.createImageData(W, H)
  const d = img.data
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const u = ((i + 0.5) / k + cx - rx * 1.1 - cx) / rx
      const v = ((j + 0.5) / k + cy - ry * 2 - cy) / ry
      const r = Math.hypot(u, v * (v < 0 ? 0.55 : 1)) / (0.85 + 0.25 * fbm(Math.atan2(v, u) * 2 + seed, seed, 2))
      if (r >= 1) continue
      // Lumps: cells of noise; the seams between them glow.
      const lump = fbm(u * 5 + seed, v * 9, 3)
      const seam = Math.pow(clamp(1 - Math.abs(lump - 0.5) * 7), 2)
      const heart = clamp(1 - r * 1.15)
      const ash = clamp((fbm(u * 3 - seed, v * 6, 2) - 0.5) * 3) * clamp(r * 1.6 - 0.4)
      const glow = (seam * 1.6 + Math.max(0, lump - 0.55) * 2) * heart * (0.6 + 0.6 * fbm(u * 11, v * 17 + seed, 2))
      const base = 0.05 + (lump - 0.5) * 0.06 + ash * 0.22
      const o = (j * W + i) * 4
      d[o] = tone(base * 1.1 + glow * 1.7)
      d[o + 1] = tone(base + glow * 0.6)
      d[o + 2] = tone(base * 0.95 + glow * 0.13)
      d[o + 3] = Math.round(255 * clamp((1 - r) * 6))
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
  ctx.globalAlpha = 0.88
  ctx.fill()
  ctx.globalAlpha = 1
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
  // Charcoal: the stroke, then the same lines again a hair off and thinner,
  // as a stick drags and skips, so edges smudge instead of reading as vector.
  const lw = ctx.lineWidth
  ctx.stroke()
  ctx.save()
  ctx.translate(0.7, -0.5)
  ctx.globalAlpha = 0.4
  ctx.lineWidth = lw * 0.55
  ctx.stroke()
  ctx.restore()
}

// Charcoal's tooth: short slanted flecks knocked out of what is drawn, as
// paper grain shows through a charcoal stroke. One tile, repeated.
let TOOTH = null
function tooth() {
  if (TOOTH) return TOOTH
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const g = c.getContext('2d')
  const rand = seeded(4049)
  g.strokeStyle = '#000'
  g.lineCap = 'round'
  for (let i = 0; i < 420; i++) {
    const x = rand() * 96; const y = rand() * 96; const len = 1 + rand() * 3.5
    g.globalAlpha = 0.25 + rand() * 0.6
    g.lineWidth = 0.5 + rand() * 0.9
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + len * 0.8, y - len * 0.6)
    g.stroke()
  }
  TOOTH = c
  return c
}

// Trees of the given rows into a layer of their own, grained there, so the
// grain never touches the ground or sky beneath.
function treeLayer(w, h, dpr, rows, rand, at) {
  const c = document.createElement('canvas')
  c.width = Math.round(w * dpr)
  c.height = Math.round(h * dpr)
  const ctx = c.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  for (const row of rows) {
    ctx.strokeStyle = row.color
    ctx.lineWidth = row.lw
    ctx.lineCap = 'round'
    for (const [p, frac] of row.trees) conifer(ctx, rand, at(p) + (rand() - 0.5) * 10, row.base, h * frac * (0.9 + rand() * 0.2), row.width)
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.globalAlpha = 0.5
  ctx.fillStyle = ctx.createPattern(tooth(), 'repeat')
  ctx.fillRect(0, 0, c.width, c.height)
  return c
}

// The forest floor from `top` down: dark soil foreshortened into the
// distance, blotched with leaf mould, scattered with pebbles and needle
// litter, lit warm near the fire at (fx, fy) and falling to near black.
function paintGround(ctx, w, h, dpr, top, fx, fy, fbm, rand) {
  // The ground's top edge: a long roll and a shorter one, so it never reads as a ruled line.
  const edgeAt = (x) => top + (fbm(x * 0.025, 3.3, 2) - 0.5) * 22 + (fbm(x * 0.12, 8.1, 3) - 0.5) * 10
  // Firelight on the ground: pooled round the pit, gone a few paces off.
  const lightAt = (x, y) => 2.2 / (1 + ((x - fx) ** 2 + ((y - fy) * 2.3) ** 2) / (62 * 62))
  // Where grass grows: in drifts, and not where feet have trodden it bare round the fire.
  const grassAt = (x, y) => clamp((fbm(x * 0.022 + 7, y * 0.06, 3) - 0.42) * 4) * clamp(((x - fx) ** 2 + ((y - fy) * 2.3) ** 2) / (85 * 85) - 0.25)
  const y0 = Math.floor(top - 22)
  const W = Math.round(w * dpr); const Hh = Math.round((h - y0) * dpr)
  const img = ctx.createImageData(W, Hh)
  const d = img.data
  const edges = Float32Array.from({ length: W }, (_, i) => edgeAt(i / dpr))
  for (let j = 0; j < Hh; j++) {
    const y = y0 + j / dpr
    const depth = clamp((y - top) / Math.max(1, h - top))
    // Nearer is bigger: the noise coarsens toward the viewer, and is squashed
    // vertically because the ground is seen at a low angle.
    const f = 0.075 - depth * 0.04
    for (let i = 0; i < W; i++) {
      const x = i / dpr
      const edge = edges[i]
      if (y < edge) continue
      const mould = fbm(x * f, y * f * 2.4, 4)
      const fine = fbm(x * 0.6, y * 1.1, 2)
      const pebble = fbm(x * 0.3 + 40, y * 0.62, 3)
      const grass = grassAt(x, y)
      // Bare packed earth is paler and dusty, with fine cracks; grassy ground
      // is darker and greener underneath its blades.
      const crack = Math.pow(clamp(1 - Math.abs(fbm(x * 0.14 + 3, y * 0.3, 3) - 0.5) * 12), 2) * (1 - grass)
      const bare = [0.1, 0.078, 0.056]
      const sward = [0.038, 0.047, 0.032]
      let a = [0, 1, 2].map((c) => bare[c] + (sward[c] - bare[c]) * grass)
      const m = clamp((mould - 0.4) * 3.5)
      a = [a[0] + m * 0.06, a[1] + m * 0.04, a[2] + m * 0.024]
      const g = (fine - 0.5) * 0.06 - crack * 0.05
      // Pebbles: lighter, lit on top, shadowed beneath, mostly on bare earth.
      const pb = clamp((pebble - 0.66) * 12) * (1 - grass * 0.7)
      const lip = clamp((fbm(x * 0.3 + 40, (y - 1.2) * 0.62, 3) - pebble) * 30)
      const stone = pb * (0.07 + lip * 0.06)
      const fall = lightAt(x, y)
      const sky = 0.16 + depth * 0.1
      // Fades in from the tree line, so the ground has no hard horizon.
      const dusk = 0.35 + 0.65 * clamp((y - edge) / 30)
      const o = (j * W + i) * 4
      for (let c = 0; c < 3; c++) {
        const alb = Math.max(0, a[c] + g + stone)
        d[o + c] = tone(alb * (FIRE[c] * fall + SKY[c] * sky) * dusk)
      }
      d[o + 3] = Math.round(255 * clamp((y - edge) / 10))
    }
  }
  paint(ctx, img, 0, Math.round(y0 * dpr))

  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.lineCap = 'round'
  // A colour for something at (x, y) on the ground: its own dark tone, warmed by the fire.
  const lit = (x, y, base, alpha) => {
    const l = Math.min(1.4, lightAt(x, y))
    const dusk = 0.45 + 0.55 * clamp((y - edgeAt(x)) / 30)
    return `rgba(${Math.round((base[0] + l * 150) * dusk)},${Math.round((base[1] + l * 70) * dusk)},${Math.round((base[2] + l * 18) * dusk)},${alpha})`
  }
  const blade = (x, y, len, lean, width) => {
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + lean * 0.4, y - len * 0.6, x + lean, y - len)
    ctx.stroke()
  }
  // Needle litter and twigs, mostly on the bare earth.
  for (let i = 0; i < Math.round(w * 0.9); i++) {
    const x = rand() * w
    const y = top + 4 + Math.pow(rand(), 0.8) * (h - top - 4)
    if (y < edgeAt(x) + 2 || rand() < grassAt(x, y) * 0.8) continue
    const depth = clamp((y - top) / Math.max(1, h - top))
    const len = (2 + rand() * 5) * (0.5 + depth)
    const ang = (rand() - 0.5) * 0.9 + (rand() < 0.5 ? 0 : Math.PI)
    ctx.strokeStyle = lit(x, y, [60, 42, 30], 0.25 + rand() * 0.25)
    ctx.lineWidth = 0.35 + depth * 0.5
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len * 0.35)
    ctx.stroke()
  }
  // Short grass in tufts, far to near so nearer blades overlap farther ones.
  const tufts = []
  for (let i = 0; i < Math.round(w * 2.2); i++) {
    const x = rand() * w
    const y = top + Math.pow(rand(), 1.3) * (h - top)
    if (y < edgeAt(x) + 1 || rand() > grassAt(x, y)) continue
    tufts.push([x, y])
  }
  tufts.sort((p, q) => p[1] - q[1])
  for (const [x, y] of tufts) {
    const depth = clamp((y - top) / Math.max(1, h - top))
    const size = 2.5 + depth * 7
    const n = 4 + Math.floor(rand() * 5)
    for (let b = 0; b < n; b++) {
      ctx.strokeStyle = lit(x, y, rand() < 0.3 ? [46, 44, 22] : [22, 34, 18], 0.75)
      blade(x + (rand() - 0.5) * size * 0.8, y, size * (0.5 + rand() * 0.7), (rand() - 0.5) * size * 0.9, 0.4 + depth * 0.6)
    }
  }
  // Weeds: a taller stem now and then, forked or seeded at its head.
  for (let i = 0; i < Math.round(w * 0.06); i++) {
    const x = rand() * w
    const y = top + 6 + rand() * (h - top - 6)
    if (y < edgeAt(x) + 3 || rand() > grassAt(x, y) + 0.15) continue
    const depth = clamp((y - top) / Math.max(1, h - top))
    const tall = (8 + rand() * 10) * (0.5 + depth)
    const lean = (rand() - 0.5) * tall * 0.4
    ctx.strokeStyle = lit(x, y, [30, 30, 20], 0.85)
    blade(x, y, tall, lean, 0.5 + depth * 0.5)
    const hx = x + lean; const hy = y - tall
    for (let s = 0; s < 3; s++) blade(hx, hy + s * tall * 0.12, tall * 0.22, (s - 1) * tall * 0.18, 0.4)
  }
  // The tree line's foot: dark scrub and grass standing up out of the ground's
  // edge against the dusk, so the horizon is broken rather than ruled.
  for (let x = 0; x < w; x += 1.5 + rand() * 4) {
    const ey = edgeAt(x) + 4 + rand() * 4
    // Scrub stands in clumps along the line; between them, low grass.
    const clump = clamp((fbm(x * 0.045 + 11, 2.2, 2) - 0.45) * 5)
    const n = 3 + Math.round(clump * 14)
    const tall = 3 + clump * (10 + rand() * 12) + rand() * 4
    for (let b = 0; b < n; b++) {
      // Lit faintly from the sky on top, so the silhouettes separate from the ground's dark edge.
      ctx.strokeStyle = rand() < 0.35 ? 'rgba(22,32,48,0.85)' : 'rgba(5,8,13,0.95)'
      blade(x + (rand() - 0.5) * (2 + clump * 12), ey, tall * (0.35 + rand() * 0.75), (rand() - 0.5) * tall * 0.7, 0.5 + clump * 0.7)
    }
  }
  ctx.restore()
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
  // Far to near: hazier and bluer behind, near-black in front. The near row
  // stands on the ground at the pane's edges, rather than running off its
  // foot over the clearing, where it swallowed the foreground.
  const far = [
    { color: '#0f2036', width: 0.2, lw: 1.1, trees: [[0.3, 0.3], [0.62, 0.26], [0.84, 0.32], [0.12, 0.28], [0.5, 0.22]], base: ground - 18 },
    { color: '#060d18', width: 0.22, lw: 1.3, trees: [[0.2, 0.46], [0.76, 0.4], [0.9, 0.5]], base: ground - 4 },
  ]
  const near = [{ color: '#010307', width: 0.24, lw: 1.5, trees: [[0.02, 0.66], [0.11, 0.5], [0.98, 0.56]], base: ground + 16 }]
  // The fire's foot in the pane: the pit is at most 300 wide, 320 x 230 drawn, its fire at y 176.
  const pitH = (Math.min(W, 300) * 230) / 320
  const fireY = H - pitH * (1 - 176 / 230)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(treeLayer(W, H, dpr, far, rand, at), 0, 0)
  paintGround(ctx, W, H, dpr, ground, fireX * W, fireY, noise(seeded(key * 7727)), rand)
  ctx.drawImage(treeLayer(W, H, dpr, near, rand, at), 0, 0)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
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
  // The logs sit in the fire; light them from a little way off so they read as wood, not glare.
  const logFire = { ...fire, y: pit.base - 30, lift: 42, power: 1.3 }
  // Kindling: thin sticks leaning in among the logs.
  const sticks = (list, foot, seed) => list.forEach(([f, tp, hgt], i) => paintLog(ctx, k, pit.cx + f, pit.base + foot, pit.cx + tp, pit.base - hgt, 2.6, logFire, fbm, i * 5.3 + seed))
  if (layer === 'back') {
    pit.back.forEach(([x, y, rx, ry], i) => paintStone(ctx, k, x, y, rx, ry, fire, fbm, i * 1.7 + key))
    paintCoals(ctx, k, pit.cx, pit.base + 5, 44, 9, fbm, key)
    sticks(pit.backSticks, 4, key + 60)
    pit.backLogs.forEach(([foot, top, h], i) => paintLog(ctx, k, pit.cx + foot, pit.base + 6, pit.cx + top, pit.base - h, 7, logFire, fbm, i * 3.1 + key + 20))
  } else if (layer === 'mid') {
    // The back logs again, over the fire and veiled (dashboard.html, .pit-mid):
    // seen through the flames, as real logs are, instead of lost behind them.
    pit.backLogs.forEach(([foot, top, h], i) => paintLog(ctx, k, pit.cx + foot, pit.base + 6, pit.cx + top, pit.base - h, 7, logFire, fbm, i * 3.1 + key + 20))
  } else {
    // A branch stub off each front log, and coals spilled forward of the logs.
    pit.logs.forEach(([foot, top, h], i) => paintLog(ctx, k, pit.cx + foot + (top - foot) * 0.45 + (i ? -2 : 2), pit.base + 8 - (h + 8) * 0.45, pit.cx + foot + (top - foot) * 0.45 + (i ? 9 : -9), pit.base - (h + 8) * 0.45 - 7, 2.4, logFire, fbm, i * 4.1 + key + 80))
    pit.logs.forEach(([foot, top, h], i) => paintLog(ctx, k, pit.cx + foot, pit.base + 8, pit.cx + top, pit.base - h, 7.5, logFire, fbm, i * 2.3 + key))
    sticks(pit.frontSticks, 9, key + 90)
    paintCoals(ctx, k, pit.cx + 6, pit.base + 14, 22, 4.5, fbm, key + 7)
    pit.front.forEach(([x, y, rx, ry], i) => paintStone(ctx, k, x, y, rx, ry, fire, fbm, i * 2.9 + key + 40))
  }
  return true
}
