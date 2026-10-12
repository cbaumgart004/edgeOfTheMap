import React, { useEffect, useMemo, useState } from 'react'
import { readDesign, inferRoles, ROLE_LABELS } from './canva.js'
import { googleHas, closestFonts, loadFont, fitSize } from './fonts.js'
import { VENDOR } from './where.js'
import { newId } from '../schema/schema.js'
import { classOptions, pointsToFs } from '../schema/elements.js'

// Bringing a design from Canva into a section (src/canva.js reads the PDF):
// a page of what was found, each piece with the class it is given, each font
// checked, and Import. What it makes is one Design element (schema/elements.js)
// holding a text element for each line and a photo for each picture, placed as
// the PDF places them; after that it is edited and arranged like any other.
//
// `apply({ design, classes })` writes it: the new classes first, then the design.

const NEW = '+new'

export default function ImportDesign({ schema, upload, notify, apply, onCancel }) {
  const [file, setFile] = useState(null)
  const [design, setDesign] = useState(null)
  const [busy, setBusy] = useState(null)
  const [fonts, setFonts] = useState({}) // family -> { has, options: [{ family, score }], chosen }
  const [pieces, setPieces] = useState({}) // index -> { classChoice, newLabel, alt }
  const classes = classOptions(schema)

  useEffect(() => {
    if (!file) return
    let live = true
    setBusy('Reading the PDF…')
    readDesign(file, { base: VENDOR })
      .then(async (d) => {
        if (!live) return
        const found = inferRoles(d)
        setDesign(found)
        // Each piece's class: one already called by its role, else a new one.
        const byLabel = (label) => classes.find((c) => c.label.toLowerCase() === label.toLowerCase())?.value
        const start = {}
        found.texts.forEach((t, i) => { const label = ROLE_LABELS[t.role]; start[`t${i}`] = { classChoice: byLabel(label) ?? NEW, newLabel: label } })
        found.images.forEach((im, i) => { const label = ROLE_LABELS[im.role]; start[`i${i}`] = { classChoice: byLabel(label) ?? NEW, newLabel: label, alt: '' } })
        setPieces(start)
        setBusy('Checking the fonts…')
        const families = [...new Map(found.texts.map((t) => [t.family, t])).values()]
        const next = {}
        for (const t of families) {
          const has = await googleHas(t.family)
          if (has) { loadFont(t.family); next[t.family] = { has, chosen: t.family, options: [] } }
          else {
            const sample = found.texts.filter((x) => x.family === t.family).map((x) => x.text).join(' ')
            const options = await closestFonts(t.family, sample, { original: t.loadedName })
            next[t.family] = { has, chosen: options[0]?.family ?? '', options, sample }
          }
        }
        if (live) { setFonts(next); setBusy(null) }
      })
      .catch((e) => { if (live) { setBusy(null); notify(`Could not read that PDF: ${e.message}`) } })
    return () => { live = false }
  }, [file]) // eslint-disable-line react-hooks/exhaustive-deps

  const preview = useMemo(() => design?.page.toDataURL('image/png'), [design])
  const set = (key, patch) => setPieces((p) => ({ ...p, [key]: { ...p[key], ...patch } }))

  const run = async () => {
    setBusy('Bringing it in…')
    try {
      const W = design.width
      const pct = (v) => Math.round((v / W) * 100 * 100) / 100
      // New classes asked for, by label, made once each.
      const wanted = new Map()
      const classFor = (key) => {
        const p = pieces[key]
        if (p.classChoice !== NEW) return { ref: p.classChoice }
        const label = (p.newLabel || 'Design').trim()
        if (!wanted.has(label.toLowerCase())) wanted.set(label.toLowerCase(), label)
        return { label }
      }
      const elements = []
      const parts = {}
      const refs = []
      let z = 1
      for (const [i, im] of design.images.entries()) {
        const src = await upload(im.blob)
        const id = newId()
        elements.push({ _id: id, kind: 'image', image: { src, alt: pieces[`i${i}`].alt?.trim() ?? '', width: im.width, height: im.height } })
        refs.push([id, classFor(`i${i}`)])
        parts[id] = { x: pct(im.x), y: pct(im.y), w: pct(im.w), h: pct(im.h), z: z++, ...(im.opacity < 100 ? { opacity: Math.max(10, im.opacity) } : {}) }
      }
      for (const [i, t] of design.texts.entries()) {
        const id = newId()
        const family = fonts[t.family]?.chosen || undefined
        const style = { family, color: t.color, ...(t.bold ? { weight: 'bold' } : {}) }
        elements.push({ _id: id, kind: 'text', text: t.text, tag: t.tag, style: Object.fromEntries(Object.entries(style).filter(([, v]) => v)) })
        refs.push([id, classFor(`t${i}`)])
        // A little more room than the PDF's own run: a stand-in font is seldom
        // exactly as wide, and a line that wraps would move what is under it.
        // A stand-in font sized to span the line as the original did.
        const size = family && family !== t.family ? fitSize(t.text, family, t.w, t.size) : t.size
        parts[id] = { x: pct(t.x), y: pct(t.y), w: Math.min(200, pct(t.w) * 1.08), fs: pointsToFs(size, W), z: z++ }
      }
      const element = {
        _id: newId(), kind: 'design', label: `Canva import: ${design.name}`, width: W,
        ...(design.background ? { style: { background: design.background } } : {}),
        _elements: elements,
        // Kept whole on a phone (scaled down), as Canva shows it; Arrange on a
        // phone can give it a phone arrangement of its own.
        _layout: { mode: 'free', phone: 'scale', height: Math.round((design.height / W) * 100 * 100) / 100, parts },
      }
      await apply({ design: element, refs, newClasses: [...wanted.values()] })
      notify(`Brought in “${design.name}”: ${design.texts.length} text${design.texts.length === 1 ? '' : 's'} and ${design.images.length} picture${design.images.length === 1 ? '' : 's'}.`)
    } catch (e) {
      notify(e.message)
      setBusy(null)
    }
  }

  if (!file) return (
    <div className="eotm-import">
      <p>Bring in a design made in Canva. In Canva: <strong>Share → Download → PDF Standard</strong>, with <strong>Flatten PDF</strong> off, so its words stay words.</p>
      <label className="eotm-btn is-primary">Choose a PDF…
        <input type="file" accept="application/pdf,.pdf" hidden onChange={(e) => setFile(e.target.files[0] ?? null)} />
      </label>
      <button type="button" className="eotm-btn is-quiet" onClick={onCancel}>Cancel</button>
    </div>
  )
  if (!design) return <div className="eotm-import"><p className="eotm-help">{busy ?? 'Reading…'}</p></div>

  const unfree = Object.entries(fonts).filter(([, f]) => f.has === false)
  return (
    <div className="eotm-import">
      <img className="eotm-import-page" src={preview} alt={`The first page of ${design.name}, as the PDF draws it`} />
      {design.skipped.length > 0 && (
        <div className="eotm-warn" role="note"><strong>Not brought in</strong><ul>{design.skipped.map((s) => <li key={s}>{s}</li>)}</ul></div>
      )}

      <h3>Fonts</h3>
      {Object.entries(fonts).map(([family, f]) => (
        <div key={family} className={`eotm-import-font${f.has === false ? ' is-warn' : ''}`}>
          {f.has ? <p><strong>{family}</strong>: a free web font. <span style={{ fontFamily: `'${family}'` }}>{design.texts.find((t) => t.family === family)?.text}</span></p>
            : f.has === null ? <p><strong>{family}</strong>: could not check Google Fonts (offline?). It will be used if the site can load it.</p>
            : (
              <>
                <p role="alert"><strong>{family}</strong> is not a free web font: Canva’s licence covers it in Canva, not on a website. Choose the closest free one:</p>
                <div className="eotm-font-original"><span className="eotm-help">In the PDF</span><span style={{ fontFamily: `"${design.texts.find((t) => t.family === family)?.loadedName}"` }}>{f.sample}</span></div>
                {f.options.map((o, n) => (
                  <label key={o.family} className={`eotm-font-option${f.chosen === o.family ? ' is-on' : ''}`}>
                    <input type="radio" name={`font-${family}`} checked={f.chosen === o.family} onChange={() => setFonts((all) => ({ ...all, [family]: { ...f, chosen: o.family } }))} />
                    <span className="eotm-help">{o.family}{n === 0 && o.score != null ? ' (closest)' : ''}{o.score != null ? ` · ${Math.round(o.score * 100)}% alike` : ''}</span>
                    <span style={{ fontFamily: `'${o.family}'` }}>{f.sample}</span>
                  </label>
                ))}
              </>
            )}
        </div>
      ))}

      <h3>Pieces</h3>
      <p className="eotm-help">Each gets a class, so its look can be changed in Classes and given to other elements too. Change any of them now or later.</p>
      {[...design.texts.map((t, i) => [`t${i}`, `Text: “${t.text.length > 50 ? `${t.text.slice(0, 48)}…` : t.text}”`, `${Math.round(t.size)} pt, ${t.family}`]),
        ...design.images.map((im, i) => [`i${i}`, `${ROLE_LABELS[im.role]} picture`, `${im.width} × ${im.height} px`])].map(([key, title, meta]) => (
        <div key={key} className="eotm-import-piece">
          <p><strong>{title}</strong> <span className="eotm-help">{meta}</span></p>
          <div className="eotm-row">
            <select className="eotm-input" aria-label={`Class for ${title}`} value={pieces[key]?.classChoice ?? NEW} onChange={(e) => set(key, { classChoice: e.target.value })}>
              <option value={NEW}>New class…</option>
              {classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            {pieces[key]?.classChoice === NEW && (
              <input className="eotm-input" aria-label={`New class name for ${title}`} value={pieces[key]?.newLabel ?? ''} maxLength={40} onChange={(e) => set(key, { newLabel: e.target.value })} />
            )}
          </div>
          {key.startsWith('i') && (
            <input className="eotm-input" aria-label={`Describe ${title}`} placeholder="Describe it for people who cannot see it (blank: decoration)" value={pieces[key]?.alt ?? ''} onChange={(e) => set(key, { alt: e.target.value })} />
          )}
        </div>
      ))}

      <div className="eotm-row">
        <button type="button" className="eotm-btn is-primary" disabled={!!busy || unfree.some(([, f]) => !f.chosen)} onClick={run}>{busy ?? 'Import'}</button>
        <button type="button" className="eotm-btn is-quiet" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
