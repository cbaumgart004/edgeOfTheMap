import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkDocument, duplicateData } from '../schema/schema.js'

const schema = JSON.parse(readFileSync(new URL('../schema/sites/storyshaped.json', import.meta.url), 'utf8'))
const page = (layout) => ({ title: 'P', sections: [{ _id: 'h', _type: 'values', heading: 'H', items: [], _layout: layout }] })

describe('a Free section (StoryShaped ADR-0010)', () => {
  it('keeps its arrangement on any section, checked to ranges', () => {
    const ok = { mode: 'free', height: 48, parts: { heading: { x: 5, y: 4, w: 60 }, items: { x: 0, y: 20, w: 100, h: 25, z: 2, opacity: 80 } } }
    expect(checkDocument(schema, 'page', page(ok))).toEqual([])
    expect(checkDocument(schema, 'page', page({ mode: 'grid', parts: { heading: { x: 5, w: 300, opacity: 5, left: 1 } } }))).toEqual([
      'sections[0]._layout.mode: flow or free',
      'sections[0]._layout.parts.heading.left: not a position',
      'sections[0]._layout.parts.heading.y: required',
      'sections[0]._layout.parts.heading.w: 1 to 200',
      'sections[0]._layout.parts.heading.opacity: 10 to 100',
    ])
  })

  it('may keep the desktop arrangement on a phone, and size a part’s text', () => {
    expect(checkDocument(schema, 'page', page({ mode: 'free', phone: 'scale', parts: { heading: { x: 0, y: 0, w: 40, fs: 180 } } }))).toEqual([])
    expect(checkDocument(schema, 'page', page({ mode: 'free', phone: 'shrink', parts: { heading: { x: 0, y: 0, w: 40, fs: 900 } } }))).toEqual([
      'sections[0]._layout.phone: stack, scale or free', 'sections[0]._layout.parts.heading.fs: 10 to 500',
    ])
  })

  it('may have its own arrangement on a phone, checked as the desktop one is', () => {
    const own = { mode: 'flow', phone: 'free', phoneHeight: 140, phoneParts: { heading: { x: 5, y: 5, w: 90, fs: 80 } } }
    expect(checkDocument(schema, 'page', page(own))).toEqual([])
    expect(checkDocument(schema, 'page', page({ ...own, phoneParts: { heading: { x: 5, w: 90 } } }))).toEqual(['sections[0]._layout.phoneParts.heading.y: required'])
  })

  it('travels with a duplicated section, as a saved template does', () => {
    const layout = { mode: 'free', parts: { heading: { x: 1, y: 1, w: 50 } } }
    const copy = duplicateData(page(layout).sections[0])
    expect(copy._id).not.toBe('h')
    expect(copy._layout).toEqual(layout)
  })
})
