// edits.jsx
//
// The owner's edits to this site, kept apart from the code that is its default
// (the console's `pageEdits` type, StoryShaped's console ADR-0010 and SCHEMA.md
// "Overrides"). Every element carries a stable id; what the code says is what
// shows until the owner changes it in the editor, and then the change is kept
// against that id in one document per page (`home`, `keeper`, `storyteller`,
// and `shell` for the header and footer every page shares):
//
//   { page: 'home', edits: [{ _id: 'hero:title', text, html, href, image,
//     style, class, hidden, _layout, _elements }] }
//
//   <EditsPage page="home">              the page's document, for what is inside
//     <Region id="hero" as="section">    a region: arranged as a whole in the
//                                        console's Arrange (its parts placed,
//                                        Free on a desktop and on a phone), holds
//                                        the owner's own elements, takes a class
//                                        and a Style; can be hidden
//       <E id="hero:title" as="h1">…</E> an element: its words typed where they
//                                        stand, its link, photo, class and Style
//                                        changed in the panel; can be hidden
//
// A row exists only once its element has been edited (the console starts it on
// the first edit), so a page nobody has touched reads exactly as the code does.

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useLiveDocuments, CONSOLE_API } from './siteConsole.jsx'
import { frameOf } from './Frame.jsx'
import { buttonClass, lookToCss, classNameOf } from './look.js'

const PageCtx = createContext({ page: null, rows: new Map() })
const FrameCtx = createContext(null)

// The site's schema (classes, button styles, named colours): the live one
// while the editor is open, else the console's public boot answer.
let bootSchema = null
export function useSchema() {
  const [schema, setSchema] = useState(() => window.EOTM?.schema ?? null)
  useEffect(() => {
    let active = true
    bootSchema ??= fetch(`${CONSOLE_API}/boot`).then((r) => (r.ok ? r.json() : null)).then((b) => b?.schema ?? null).catch(() => null)
    bootSchema.then((s) => active && !window.EOTM?.schema && s && setSchema(s))
    let unsubscribe = null
    let timer = null
    const wire = () => {
      if (!window.EOTM) { timer = setTimeout(wire, 50); return }
      if (window.EOTM.schema) setSchema(window.EOTM.schema)
      unsubscribe = window.EOTM.subscribe((c) => c.type === '$schema' && setSchema(window.EOTM.schema))
    }
    wire()
    return () => {
      active = false
      clearTimeout(timer)
      if (unsubscribe) unsubscribe()
    }
  }, [])
  return schema
}

export function EditsPage({ page, children }) {
  const docs = useLiveDocuments('pageEdits')
  const doc = docs.find((d) => d.slug === page || d.data?.page === page)
  const rows = useMemo(() => new Map((doc?.data?.edits ?? []).filter((r) => r?._id).map((r) => [r._id, r])), [doc])
  return <PageCtx.Provider value={{ page, rows }}>{children}</PageCtx.Provider>
}

// A row's class and Style as props for its element, over what the code gives.
function dress(schema, row, className, style) {
  const cls = [className, classNameOf(schema, row?.class)].filter(Boolean).join(' ')
  const own = lookToCss(schema, row?.style)
  return { className: cls || undefined, style: own || style ? { ...style, ...own } : undefined }
}

// `id` is the edit id; `domId` is the element's own id attribute (an anchor
// target such as #about), which `id` would otherwise take the place of.
export function Region({ id, domId, as: Tag = 'div', label, className, style, children, ...rest }) {
  const { page, rows } = useContext(PageCtx)
  const schema = useSchema()
  const row = rows.get(id)
  const frame = frameOf(row)
  if (row?.hidden) return null
  const { style: frameStyle, ...frameMarks } = frame.root
  const dressed = dress(schema, row, className, style)
  return (
    <Tag {...rest} {...(domId ? { id: domId } : {})} {...frameMarks} className={dressed.className}
      style={dressed.style || frameStyle ? { ...dressed.style, ...frameStyle } : undefined}
      {...(page ? { 'data-eotm-edit': `pageEdits:${page}`, 'data-eotm-item': id, 'data-eotm-label': label ?? id } : {})}>
      <FrameCtx.Provider value={frame}>
        {children}
        <Elements row={row} frame={frame} />
      </FrameCtx.Provider>
    </Tag>
  )
}

// An element. `text`: its words are its children until the owner retypes them
// (plain text). `rich`: its children until the owner writes formatted text
// (HTML, sanitized by the console on save). `href`/`src` are its link and photo,
// overridable too. `group`: several elements moved as one part, no box of its
// own while its region flows. `place={false}`: editable, but not a part of its
// own (a link inside a nav that moves as one).
export function E({ id, domId, as: Tag = 'span', text = true, rich = false, group = false, place = true, href, src, alt, className, style, children, ...rest }) {
  const { rows } = useContext(PageCtx)
  const frame = useContext(FrameCtx)
  const schema = useSchema()
  const row = rows.get(id)
  if (row?.hidden) return null
  const dressed = dress(schema, row, className, style)
  const part = frame && place ? (group ? frame.group(id, dressed.style) : frame.part(id, dressed.style)) : { ...(dressed.style ? { style: dressed.style } : {}) }
  const link = row?.href || href
  const pic = row?.image?.src || src
  const own = { 'data-eotm-in': id, 'data-eotm-label': id }
  const words = rich
    ? row?.html ? { 'data-eotm-richtext': 'html', dangerouslySetInnerHTML: { __html: row.html } } : { 'data-eotm-richtext': 'html' }
    : text && !pic ? { 'data-eotm-text': 'text' } : {}
  const body = rich && row?.html ? undefined : text && typeof row?.text === 'string' && row.text.trim() ? row.text : children
  return (
    <Tag {...rest} {...(domId ? { id: domId } : {})} {...own} {...words} {...part} className={dressed.className}
      {...(link != null ? { href: link } : {})}
      {...(pic != null ? { src: pic, alt: row?.image?.alt ?? alt } : {})}>
      {Tag === 'img' ? undefined : body}
    </Tag>
  )
}

// The owner's own elements in a region (`_elements`; the console's
// schema/elements.js): text, formatted text, a photo, a button or a box.
function Elements({ row, frame }) {
  const schema = useSchema()
  const list = Array.isArray(row?._elements) ? row._elements.filter((e) => e?._id) : []
  return list.map((el) => {
    const cls = `eotm-el eotm-el--${el.kind} ${classNameOf(schema, el.class)}`.trim()
    const marks = { 'data-eotm-element': el.kind, 'data-eotm-in': el._id, ...frame.part(el._id, lookToCss(schema, el.style)) }
    switch (el.kind) {
      case 'text': {
        const T = ['h2', 'h3'].includes(el.tag) ? el.tag : 'p'
        return <T key={el._id} className={cls} data-eotm-text="text" {...marks}>{el.text}</T>
      }
      case 'richtext':
        return <div key={el._id} className={cls} data-eotm-richtext="html" dangerouslySetInnerHTML={{ __html: el.html ?? '' }} {...marks} />
      case 'image':
        return el.image?.src ? <img key={el._id} className={cls} src={el.image.src} alt={el.image.alt ?? ''} {...marks} /> : null
      case 'button':
        return el.url ? (
          <a key={el._id} className={`${buttonClass(schema, el.look)} ${cls}`} href={el.url} {...marks}>
            {el.icon?.src && <img className="btn-icon" src={el.icon.src} alt="" />}
            <span data-eotm-text="label" data-eotm-in={el._id}>{el.label}</span>
          </a>
        ) : null
      default:
        return <div key={el._id} className={cls} {...marks} />
    }
  })
}
