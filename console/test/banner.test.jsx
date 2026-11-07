// @vitest-environment jsdom
// Conditional fields (`when`), ready-made rows (`presets`) and filling a row
// from the site (`fill`), as the Spirit Seeds banner slides use them.
import { describe, it, expect, beforeAll } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { FieldList } from '../src/Fields.jsx'
import { checkSchema, checkDocument, shown, fillCandidates, fillItem, htmlToText } from '../schema/schema.js'

const schema = JSON.parse(readFileSync('schema/sites/spiritseeds.json', 'utf8'))
const slides = schema.types.settings.fields.find((f) => f.name === 'promoSlides')

const pages = [
  { id: 'p1', type: 'page', slug: 'services', data: { title: 'Services', blocks: [
    { _id: 's0', _type: 'service', title: 'Integrative Massage Sessions', description: '<p>Thai Yoga &amp; reiki.</p><p>Whole person.</p>', image: { src: '/uploads/f.jpg', alt: '' } },
    { _id: 's1', _type: 'contentSection', title: '' }] } },
  { id: 'p2', type: 'page', slug: 'home', data: { title: 'Home', blocks: [{ _id: 'h0', _type: 'contentSection', title: 'Our Services', body: 'Hello' }] } },
]
const settings = [{ id: 'st', type: 'settings', slug: 'settings', data: { connectTitle: '' } }]
const docsOf = async (t) => (t === 'page' ? pages : t === 'settings' ? settings : [])

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })

describe('banner slides schema', () => {
  it('is a valid schema', () => expect(checkSchema(schema)).toEqual([]))

  it('refuses a when naming no field beside it, and fill naming no row field', () => {
    const bad = structuredClone(schema)
    const f = bad.types.settings.fields.find((x) => x.name === 'promoSlides')
    f.fields[3].when = { field: 'nope', is: 'card' }
    f.fill.set = { missing: 1 }
    const errs = checkSchema(bad).join('\n')
    expect(errs).toMatch(/promoSlides\.text: when needs/)
    expect(errs).toMatch(/fill names "missing"/)
  })

  it('shows a field only for its kind, counting an unsaved kind as the default', () => {
    const text = slides.fields.find((f) => f.name === 'text')
    const count = slides.fields.find((f) => f.name === 'count')
    expect(shown(text, {}, slides.fields)).toBe(true)
    expect(shown(text, { kind: 'events' }, slides.fields)).toBe(false)
    expect(shown(count, { kind: 'events' }, slides.fields)).toBe(true)
  })

  it('checks only the fields that show', () => {
    const errs = checkDocument(schema, 'settings', { promoSlides: [{ _id: 'a', kind: 'events', title: 'X', count: 99 }, { _id: 'b', kind: 'card', title: 'Y', count: 99 }] })
    expect(errs.some((e) => e.startsWith('promoSlides[0].count'))).toBe(true)
    expect(errs.some((e) => e.startsWith('promoSlides[1].count'))).toBe(false)
  })
})

describe('fill from the site', () => {
  it('offers titled page sections and the Connect page', async () => {
    const c = await fillCandidates(schema, slides, docsOf)
    expect(c.map((x) => `${x.group}/${x.label}`)).toEqual(['Services/Integrative Massage Sessions', 'Home/Our Services', 'Site settings/Connect page'])
    expect(c[0].link).toBe('/services#integrative-massage-sessions')
    expect(c[1].link).toBe('/#our-services')
  })

  it('copies plain words, the picture and the link into the row', async () => {
    const [massage, , connect] = await fillCandidates(schema, slides, docsOf)
    expect(fillItem(slides, massage)).toEqual({
      kind: 'card', title: 'Integrative Massage Sessions', text: 'Thai Yoga & reiki.\nWhole person.',
      image: { src: '/uploads/f.jpg', alt: '' }, url: '/services#integrative-massage-sessions', label: 'Learn more',
    })
    const filled = fillItem(slides, connect)
    expect(filled.title).toBe('Subscribe to our newsletter')
    expect(filled.url).toBe('/connect')
    expect(filled.label).toBe('Connect')
  })

  it('turns formatted text into lines', () => {
    expect(htmlToText('<h2>A</h2><p>b&nbsp;c<br>d</p>')).toBe('A\nb c\nd')
  })
})

describe('the slides editor', () => {
  it('offers the presets and the site, and hides the fields of the other kind', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    let value = { promoSlides: [] }
    const store = { list: docsOf }
    const ctx = { schema, store, notify: () => {} }
    const r = createRoot(root)
    const draw = () => r.render(<FieldList fields={[slides]} value={value} ctx={ctx} onChange={(v) => { value = v; draw() }} />)
    await act(async () => draw())
    await act(() => new Promise((res) => setTimeout(res, 0)))
    const buttons = [...root.querySelectorAll('.eotm-palette button')].map((b) => b.textContent)
    expect(buttons).toEqual(['+ Picture and words', '+ Upcoming events', '+ Memberships', '+ Book a Massage', '+ Connect'])
    const pick = root.querySelector('.eotm-palette .eotm-fill')
    expect([...pick.options].map((o) => o.textContent)).toContain('Integrative Massage Sessions')

    await act(async () => [...root.querySelectorAll('.eotm-palette button')][1].click())
    expect(value.promoSlides[0]).toMatchObject({ kind: 'events', title: 'Upcoming Events', count: 3 })
    const labels = [...root.querySelectorAll('.eotm-item-body label')].map((l) => l.textContent)
    expect(labels.some((l) => l.startsWith('How many events'))).toBe(true)
    expect(labels.some((l) => l.startsWith('Message'))).toBe(false)

    await act(async () => {
      const sel = root.querySelector('.eotm-palette .eotm-fill')
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, 'p1:s0')
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(value.promoSlides[1]).toMatchObject({ kind: 'card', title: 'Integrative Massage Sessions', url: '/services#integrative-massage-sessions' })
    act(() => r.unmount())
  })
})
