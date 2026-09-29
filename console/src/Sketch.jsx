import React from 'react'

// A small picture of a section, shown on its "add" button so the owner sees
// roughly what they are adding before they add it. A site can ship a real
// thumbnail (`preview` on the block in its schema, a path on the site);
// otherwise the sketch is drawn from the section's fields: a heading bar for
// the first short text, lines for text, a framed box for a photo, a pill for
// a link, repeated rows for a list. Custom sections get one with no extra work.

const TEXTY = ['textarea', 'richtext']

export default function Sketch({ def }) {
  if (def?.preview) return <img className="eotm-sketch is-image" src={def.preview} alt="" loading="lazy" />
  const fields = def?.fields ?? []
  const heading = fields.some((f) => f.kind === 'text')
  const photo = fields.some((f) => f.kind === 'image' || f.kind === 'photos')
  const text = fields.some((f) => TEXTY.includes(f.kind))
  const button = fields.some((f) => f.kind === 'url' || (f.kind === 'list' && f.fields?.some((x) => x.kind === 'url')))
  const list = fields.some((f) => f.kind === 'list' && !f.fields?.some((x) => x.kind === 'url'))
  const body = (
    <div className="eotm-sketch-body">
      {heading && <span className="eotm-sketch-h" />}
      {text && <><span className="eotm-sketch-l" /><span className="eotm-sketch-l" /><span className="eotm-sketch-l is-short" /></>}
      {list && <span className="eotm-sketch-list"><i /><i /><i /></span>}
      {button && <span className="eotm-sketch-b" />}
    </div>
  )
  return (
    <span className={`eotm-sketch${photo ? ' has-photo' : ''}`} aria-hidden="true">
      {photo && <span className="eotm-sketch-p" />}
      {body}
    </span>
  )
}
