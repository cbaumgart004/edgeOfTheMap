// Reading a design exported from Canva as a PDF, in the browser, into what the
// editor can hold: each text run as text in its own font, size, colour and
// place, and each picture as a photo of its own, clipped as the PDF clips it,
// all in points from the page's top left. Nothing is guessed at silently: what
// cannot be brought in (vector shapes, further pages, text drawn as outlines)
// is listed in `skipped` for the import to say so.
//
// pdf.js ships with the console's build (scripts/build.js copies it under
// console/vendor/), loaded the first time a PDF is opened.

export const PDFJS_DIR = 'pdfjs-4.10.38'

let pdfjs = null
async function loadPdfjs(where) {
  if (pdfjs) return pdfjs
  // A full address: a worker made from a blob resolves nothing relative.
  const base = new URL(where, location.href).href.replace(/\/$/, '')
  const lib = await import(/* @vite-ignore */ `${base}/${PDFJS_DIR}/pdf.min.js`)
  // A worker from another origin is not allowed; a module worker made here
  // that imports it is.
  const src = `import '${base}/${PDFJS_DIR}/pdf.worker.min.js'`
  lib.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), { type: 'module' })
  pdfjs = lib
  return lib
}

// "AAAAAA+EuphoriaScript-Regular" is Euphoria Script, regular.
export function familyOf(pdfName) {
  const bare = String(pdfName ?? '').replace(/^[A-Z]{6}\+/, '')
  const [name, style = ''] = bare.split(/[-,]/)
  const family = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/[_]+/g, ' ').trim()
  return { family, bold: /bold|black|heavy/i.test(style), italic: /italic|oblique/i.test(style) }
}

const hex = (rgb) => (rgb ? `#${[...rgb].slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}` : null)
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

// A pdf.js path (constructPath's ops and coordinates) as a Path2D, in its own space.
function pathOf(OPS, ops, coords) {
  const p = new Path2D()
  let j = 0
  for (const op of ops) {
    if (op === OPS.rectangle) { p.rect(coords[j], coords[j + 1], coords[j + 2], coords[j + 3]); j += 4 }
    else if (op === OPS.moveTo) { p.moveTo(coords[j], coords[j + 1]); j += 2 }
    else if (op === OPS.lineTo) { p.lineTo(coords[j], coords[j + 1]); j += 2 }
    else if (op === OPS.curveTo) { p.bezierCurveTo(coords[j], coords[j + 1], coords[j + 2], coords[j + 3], coords[j + 4], coords[j + 5]); j += 6 }
    else if (op === OPS.curveTo2 || op === OPS.curveTo3) { p.quadraticCurveTo(coords[j], coords[j + 1], coords[j + 2], coords[j + 3]); j += 4 }
    else if (op === OPS.closePath) p.closePath()
  }
  return p
}

// The box a path covers on the page, from pdf.js's own bounds (minMax).
function boundsOf(minMax, ctm) {
  if (!minMax || minMax.length < 4) return null
  const pts = [[minMax[0], minMax[1]], [minMax[2], minMax[1]], [minMax[0], minMax[3]], [minMax[2], minMax[3]]].map(([x, y]) => apply(ctm, x, y))
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1])
  return { left: Math.min(...xs), right: Math.max(...xs), bottom: Math.min(...ys), top: Math.max(...ys) }
}

// The first page of a PDF file as a design: { name, width, height, background,
// texts: [{ text, pdfFont, family, bold, italic, loadedName, size, color, x, y, w, h }],
// images: [{ blob, width, height, x, y, w, h, area, opacity }], skipped: [string], page: canvas }
export async function readDesign(file, { base, maxPx = 2400 } = {}) {
  const lib = await loadPdfjs(base)
  const { OPS } = lib
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), fontExtraProperties: true }).promise
  const page = await doc.getPage(1)
  const vp = page.getViewport({ scale: 1 })
  const W = vp.width
  const H = vp.height
  const skipped = []
  if (doc.numPages > 1) skipped.push(`${doc.numPages - 1} more page${doc.numPages > 2 ? 's' : ''}: only the first is brought in`)

  // The page drawn once: it loads the PDF's own fonts into this document (for
  // the font comparisons) and is the picture the import is checked against.
  const pageCanvas = document.createElement('canvas')
  const scale = Math.min(2, 1600 / W)
  pageCanvas.width = Math.round(W * scale)
  pageCanvas.height = Math.round(H * scale)
  await page.render({ canvasContext: pageCanvas.getContext('2d'), viewport: page.getViewport({ scale }) }).promise

  // Walk the drawing: where each picture lands, what clips it, each font's colour.
  const list = await page.getOperatorList()
  // `alpha` is the opacity now set; `groupAlpha` that of the transparency groups
  // around it. Canva puts each picture in a group with the picture's opacity
  // and sets 1 inside, so what shows is the two multiplied.
  let state = { ctm: [1, 0, 0, 1, 0, 0], clips: [], fill: null, alpha: 1, groupAlpha: 1, font: null }
  const stack = []
  const groups = []
  let pending = null // a path waiting to be filled or used as a clip
  const colourOf = {}
  const pictures = []
  let shapes = 0
  let background = null
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i]
    const a = list.argsArray[i]
    if (fn === OPS.save) stack.push(state)
    else if (fn === OPS.restore) state = stack.pop() ?? state
    else if (fn === OPS.transform) state = { ...state, ctm: mul(state.ctm, a) }
    else if (fn === OPS.setFillRGBColor) state = { ...state, fill: a }
    else if (fn === OPS.setGState) { for (const [k, v] of a[0] ?? []) if (k === 'ca') state = { ...state, alpha: v } }
    else if (fn === OPS.setFont) state = { ...state, font: a[0] }
    else if (fn === OPS.beginGroup) { groups.push(state); state = { ...state, groupAlpha: state.groupAlpha * state.alpha, alpha: 1 } }
    else if (fn === OPS.endGroup) state = groups.pop() ?? state
    else if (fn === OPS.showText || fn === OPS.showSpacedText) { if (state.font && !colourOf[state.font]) colourOf[state.font] = hex(state.fill) }
    else if (fn === OPS.constructPath) pending = { path: pathOf(OPS, a[0], a[1]), ctm: state.ctm, bounds: boundsOf(a[2], state.ctm) }
    else if ((fn === OPS.clip || fn === OPS.eoClip) && pending) state = { ...state, clips: [...state.clips, { ...pending, evenOdd: fn === OPS.eoClip }] }
    else if ((fn === OPS.fill || fn === OPS.eoFill || fn === OPS.fillStroke || fn === OPS.eoFillStroke) && pending) {
      const b = pending.bounds
      // A fill over the whole page is the design's ground; any other is a shape.
      if (b && b.right - b.left >= W * 0.95 && b.top - b.bottom >= H * 0.95 && !pictures.length && state.fill) background = hex(state.fill)
      else shapes += 1
      pending = null
    } else if (fn === OPS.stroke || fn === OPS.closeStroke) { shapes += 1; pending = null }
    else if (fn === OPS.endPath) pending = null
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) pictures.push({ id: a[0], inline: fn === OPS.paintInlineImageXObject ? a[0] : null, ctm: state.ctm, clips: state.clips, alpha: state.alpha * state.groupAlpha })
    else if (fn === OPS.paintImageMaskXObject) shapes += 1
  }
  if (shapes) skipped.push(`${shapes} drawn shape${shapes === 1 ? '' : 's'} (lines or fills): not brought in; they are in the page preview`)

  // Each picture on a canvas of its own: the PDF's image, through its clips,
  // cut to where it shows on the page.
  const images = []
  for (const pic of pictures) {
    const obj = pic.inline ?? await new Promise((resolve) => page.objs.get(pic.id, resolve))
    const src = obj?.bitmap ?? (obj?.data ? (() => {
      const c = document.createElement('canvas'); c.width = obj.width; c.height = obj.height
      const rgba = obj.data.length === obj.width * obj.height * 4 ? obj.data : (() => {
        const out = new Uint8ClampedArray(obj.width * obj.height * 4)
        for (let p = 0, q = 0; p < obj.data.length; p += 3, q += 4) { out[q] = obj.data[p]; out[q + 1] = obj.data[p + 1]; out[q + 2] = obj.data[p + 2]; out[q + 3] = 255 }
        return out
      })()
      c.getContext('2d').putImageData(new ImageData(rgba, obj.width, obj.height), 0, 0)
      return c
    })() : null)
    if (!src) { skipped.push('a picture pdf.js could not read'); continue }
    // Where it lands: the unit square through its matrix, cut by each clip's box.
    const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => apply(pic.ctm, x, y))
    let box = { left: Math.min(...corners.map((c) => c[0])), right: Math.max(...corners.map((c) => c[0])), bottom: Math.min(...corners.map((c) => c[1])), top: Math.max(...corners.map((c) => c[1])) }
    for (const c of pic.clips) if (c.bounds) box = { left: Math.max(box.left, c.bounds.left), right: Math.min(box.right, c.bounds.right), bottom: Math.max(box.bottom, c.bounds.bottom), top: Math.min(box.top, c.bounds.top) }
    const w = box.right - box.left
    const h = box.top - box.bottom
    if (w < 1 || h < 1) continue
    // Its own resolution, no more than it has and no more than maxPx across.
    const drawnW = Math.hypot(pic.ctm[0], pic.ctm[1]) || 1
    const k = Math.min((src.width ?? obj.width) / drawnW, maxPx / w, 4)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(w * k))
    canvas.height = Math.max(1, Math.round(h * k))
    const ctx = canvas.getContext('2d')
    // Page points (y up) to this canvas (y down, from the box's top left).
    const toCanvas = [k, 0, 0, -k, -box.left * k, box.top * k]
    for (const c of pic.clips) {
      ctx.setTransform(...mul(toCanvas, c.ctm))
      ctx.clip(c.path, c.evenOdd ? 'evenodd' : 'nonzero')
    }
    ctx.setTransform(...mul(toCanvas, mul(pic.ctm, [1, 0, 0, -1, 0, 1])))
    // Drawn whole; its opacity is the piece's Fade, so it can be changed later.
    ctx.drawImage(src, 0, 0, 1, 1)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9))
    images.push({ blob, width: canvas.width, height: canvas.height, x: box.left, y: H - box.top, w, h, area: (w * h) / (W * H), opacity: Math.round(pic.alpha * 100) })
  }

  // The words, a run each, with the font each is set in.
  const content = await page.getTextContent()
  const texts = []
  for (const it of content.items) {
    if (!it.str?.trim()) continue
    const t = it.transform
    const size = Math.hypot(t[2], t[3]) || it.height
    const st = content.styles[it.fontName] ?? {}
    const ascent = st.ascent ?? 0.8
    const descent = st.descent ?? -0.2
    let pdfFont = it.fontName
    try { pdfFont = page.commonObjs.get(it.fontName)?.name ?? it.fontName } catch { /* its pdf.js name, then */ }
    const { family, bold, italic } = familyOf(pdfFont)
    texts.push({
      text: it.str, pdfFont, family, bold, italic, loadedName: it.fontName, size,
      color: colourOf[it.fontName] ?? '#000000', x: t[4], y: H - t[5] - ascent * size, w: it.width, h: (ascent - descent) * size,
    })
  }
  // Text drawn as outlines has no words to read: say so rather than import a picture of it.
  if (!texts.length) skipped.push('no text could be read: if the design has words, export it again from Canva without "Flatten PDF"')

  const name = String(file.name ?? 'Design').replace(/\.pdf$/i, '').split(/[;:|]/)[0].trim().slice(0, 60) || 'Design'
  return { name, width: W, height: H, background, texts, images, skipped, page: pageCanvas }
}

// What each piece most likely is, for its class and its kind of text: the
// largest words are the display, short lines headings, long ones body text;
// a picture over most of the page is the background, a small one a decoration.
export function inferRoles(design) {
  const sizes = design.texts.map((t) => t.size).sort((a, b) => b - a)
  const texts = design.texts.map((t) => {
    const role = t.text.length > 60 ? 'body' : t.size === sizes[0] && sizes.length > 1 && t.size >= sizes[1] * 1.5 ? 'display' : 'heading'
    return { ...t, role, tag: role === 'body' ? 'p' : role === 'display' ? 'h2' : 'h3' }
  })
  const images = design.images.map((im) => ({ ...im, role: im.area >= 0.6 ? 'background' : im.area < 0.04 ? 'decoration' : 'photo' }))
  return { ...design, texts, images }
}

export const ROLE_LABELS = { display: 'Display', heading: 'Heading', body: 'Body', background: 'Background', photo: 'Photo', decoration: 'Decoration' }
