import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkSchema, checkDocument, duplicateDocument, newBlock, relationIds, suggestionsFor, setItemField } from '../schema/schema.js'
import { createService, ConflictError } from '../core/service.js'
import { createMemoryRepo } from '../core/repo-memory.js'

const load = (name) => JSON.parse(readFileSync(new URL(`../schema/sites/${name}.json`, import.meta.url), 'utf8'))
const storyshaped = load('storyshaped')
// Events and banners: SpiritSeeds' first sketch, kept to test dates, money,
// rich text and singletons (the live schema mirrors its TinaCMS model).
const spiritseeds = JSON.parse(readFileSync(new URL('./fixtures/events.json', import.meta.url), 'utf8'))
// StoryShaped's inventory moved to its own Stock Item tables (StoryShaped
// ADR-0002); its former console types stay here because they exercise money,
// labelled photos, relations and drafts.
const inventory = JSON.parse(readFileSync(new URL('./fixtures/inventory.json', import.meta.url), 'utf8'))

describe('site schemas', () => {
  it.each([['storyshaped', storyshaped], ['spiritseeds', load('spiritseeds')], ['events fixture', spiritseeds], ['edgeofthemap', load('edgeofthemap')], ['inventory fixture', inventory]])('%s is a valid schema', (_, schema) => {
    expect(checkSchema(schema)).toEqual([])
  })

  it('checks tools and menuUnder', () => {
    const base = { site: 'x', version: 1, types: { page: { fields: [] }, entry: { fields: [], menuUnder: 'page' } } }
    expect(checkSchema({ ...base, tools: [{ label: 'Inventory', path: '/admin/inventory' }] })).toEqual([])
    expect(checkSchema({ ...base, tools: [{ label: 'Bad', path: 'admin' }] })).toEqual([expect.stringMatching(/tools/)])
    expect(checkSchema({ ...base, types: { ...base.types, stray: { fields: [], menuUnder: 'nope' } } })).toEqual([expect.stringMatching(/menuUnder/)])
  })

  it('rejects an unknown kind and a relation to a missing type', () => {
    const errors = checkSchema({ site: 'x', version: 1, types: { a: { fields: [
      { name: 'f', kind: 'colour' }, { name: 'r', kind: 'relation', to: 'nope' } ] } } })
    expect(errors).toEqual(expect.arrayContaining([expect.stringMatching(/unknown kind/), expect.stringMatching(/unknown type "nope"/)]))
  })
})

describe('documents', () => {
  const photo = (index) => ({ src: 'https://cdn.example/p.webp', alt: '', width: 800, height: 800, index })
  const item = {
    name: 'Neiger necklace', sku: 'NB-001', description: '<p>Glows.</p>', price: { amount: 12500, currency: 'USD' },
    quantityOnHand: 1, components: [], photos: [photo('Light'), photo('Dark')], materials: [], showOnSite: true,
    etsy: { enabled: false, tags: [], whoMade: 'i_did', whenMade: 'made_to_order' }, ebay: { enabled: false, aspects: [], condition: 'NEW' },
  }

  it('checks a theme: colours as #rrggbb or blank, glow strength 0 to 200', () => {
    const theme = (blacklight) => checkDocument(storyshaped, 'theme', { headingFont: 'Cinzel', bodyFont: '', blacklight, daylight: {} })
    expect(theme({ accent: '#00fb00', glow: '', glowStrength: 150 })).toEqual([])
    expect(theme({ accent: 'green' })).toEqual([expect.stringMatching(/#1a2b3c/)])
    expect(theme({ glowStrength: 250 })).toEqual([expect.stringMatching(/at most 200/)])
  })

  it('checks a page layout: plain keys, each once, 1 to 12 columns', () => {
    const layout = (blocks) => checkDocument(storyshaped, 'pageLayout', { title: 'Home', path: '/', blocks })
    expect(layout([{ key: 'hero', span: 12 }, { key: 'our-story', span: 6 }])).toEqual([])
    expect(layout([{ key: 'a b', span: 12 }])).toEqual([expect.stringMatching(/plain name/)])
    expect(layout([{ key: 'hero', span: 6 }, { key: 'hero', span: 6 }])).toEqual([expect.stringMatching(/twice/)])
    expect(layout([{ key: 'hero', span: 13 }])).toEqual([expect.stringMatching(/1 to 12/)])
  })

  it('accepts a complete inventory item', () => {
    expect(checkDocument(inventory, 'stockItem', item)).toEqual([])
  })

  it('requires every photo to carry a Light or Dark index', () => {
    const errors = checkDocument(inventory, 'stockItem', { ...item, photos: [photo('Dusk')] })
    expect(errors[0]).toMatch(/index must be one of Light, Dark/)
  })

  it('lets a draft be incomplete but not malformed', () => {
    expect(checkDocument(inventory, 'stockItem', { name: 'Half done' }, { draft: true })).toEqual([])
    expect(checkDocument(inventory, 'stockItem', { quantityOnHand: 1.5 }, { draft: true })[0]).toMatch(/whole number/)
  })

  it('rejects a javascript: link', () => {
    expect(checkDocument(spiritseeds, 'banner', { message: '<p>x</p>', linkUrl: 'javascript:alert(1)' })[0]).toMatch(/must be a link/)
  })

  it('duplicates with fresh block ids and a distinct title', () => {
    const block = newBlock(spiritseeds, 'contentSection')
    const copy = duplicateDocument(spiritseeds, { type: 'page', slug: 'about', data: { title: 'About', blocks: [block] } })
    expect(copy.data.title).toBe('About (copy)')
    expect(copy.data.blocks[0]._id).not.toBe(block._id)
    expect(copy.status).toBe('draft')
  })

  it('finds relations inside lists', () => {
    const ids = relationIds(inventory, 'stockItem', { ...item, components: [{ _id: 'r', component: 'c1', quantityPerUnit: 2 }] })
    expect(ids).toEqual([{ to: 'component', id: 'c1' }])
  })
})

describe('service', () => {
  const make = () => createService({ schema: spiritseeds, repo: createMemoryRepo() })
  const event = { title: 'Full moon sound bath', startsAt: '2026-10-17T19:00:00-06:00', description: '<p>Bring a mat.</p>' }

  it('creates a draft with a slug from the title', async () => {
    const doc = await make().create({ type: 'event', data: event })
    expect(doc).toMatchObject({ slug: 'full-moon-sound-bath', status: 'draft', version: 1 })
  })

  it('keeps slugs unique per type', async () => {
    const s = make()
    await s.create({ type: 'event', data: event })
    expect((await s.create({ type: 'event', data: event })).slug).toBe('full-moon-sound-bath-2')
  })

  it('rejects a save based on an old version and returns the current document', async () => {
    const s = make()
    const doc = await s.create({ type: 'event', data: event })
    await s.save(doc.id, { baseVersion: 1, data: { ...event, location: 'Online' } })
    const err = await s.save(doc.id, { baseVersion: 1, data: event }).catch((e) => e)
    expect(err).toBeInstanceOf(ConflictError)
    expect(err.current.data.location).toBe('Online')
  })

  it('publishes only a complete document, and marks later edits as changed', async () => {
    const s = make()
    const draft = await s.create({ type: 'event', data: { title: 'No date yet' } })
    await expect(s.publish(draft.id, { baseVersion: 1 })).rejects.toMatchObject({ status: 422 })
    const full = await s.save(draft.id, { baseVersion: 1, data: event })
    const live = await s.publish(full.id, { baseVersion: full.version })
    expect(live.status).toBe('published')
    const edited = await s.save(live.id, { baseVersion: live.version, data: { ...event, title: 'Renamed' } })
    expect(edited.status).toBe('changed')
    expect((await s.listPublished('event'))[0].data.title).toBe('Full moon sound bath')
  })

  it('refuses to publish a link to a deleted component', async () => {
    const s = createService({ schema: inventory, repo: createMemoryRepo() })
    const c = await s.create({ type: 'component', data: { name: 'Bead', quantityOnHand: 10 } })
    const photo = { src: '/p.webp', alt: '', width: 1, height: 1, index: 'Light' }
    const doc = await s.create({ type: 'stockItem', data: { name: 'Earrings', sku: 'E1', description: '<p>x</p>',
      price: { amount: 100, currency: 'USD' }, quantityOnHand: 1, photos: [photo], components: [{ _id: 'a', component: c.id, quantityPerUnit: 2 }] } })
    await s.remove(c.id, { baseVersion: c.version })
    await expect(s.publish(doc.id, { baseVersion: doc.version })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/Component no longer exists/) })
  })
})

describe('page-scoped suggestions and sizing', () => {
  const ss = load('spiritseeds')
  const page = (buttonService) => ({
    title: 'Services',
    blocks: [
      { _id: 'a', _type: 'service', title: 'Thai Yoga', status: 'available' },
      { _id: 'b', _type: 'contentSection', layout: 'centered', buttons: [{ _id: 'c', label: 'Book', service: buttonService }] },
    ],
  })

  it('offers the headings of Service sections on the same page', () => {
    expect(suggestionsFor(ss, page('x'), { block: 'service', field: 'title' })).toEqual(['Thai Yoga'])
  })

  it('refuses to publish a button tied to a Service the page does not have, but saves the draft', () => {
    expect(checkDocument(ss, 'page', page('thai yoga'))).toEqual([])
    expect(checkDocument(ss, 'page', page('Reiki'))[0]).toMatch(/blocks\[1\]\.buttons\[0\]\.service: no Service \/ offering titled "Reiki"/)
    expect(checkDocument(ss, 'page', page('Reiki'), { draft: true })).toEqual([])
  })

  it('accepts an #anchor link to a section on the page', () => {
    const data = page('Thai Yoga')
    data.blocks[1].buttons[0].url = '#thai-yoga'
    expect(checkDocument(ss, 'page', data)).toEqual([])
  })

  it('sets a field on a section by its id, however deep, and leaves the rest alone', () => {
    const data = page('x')
    const out = setItemField(data, 'c', 'label', 'Book now')
    expect(out.blocks[1].buttons[0].label).toBe('Book now')
    expect(out.blocks[0]).toBe(data.blocks[0])
    expect(data.blocks[1].buttons[0].label).toBe('Book')
    expect(setItemField(data, 'missing', 'x', 1)).toBe(data)
    expect(setItemField(data, null, 'title', 'T').title).toBe('T')
    expect(setItemField(data, 'c', 'label', (old) => `${old}!`).blocks[1].buttons[0].label).toBe('Book!')
  })
})

describe('publish', () => {
  it('lists everything not yet live, of every type, and publishes what passes, holding the rest', async () => {
    const s = createService({ schema: storyshaped, repo: createMemoryRepo() })
    const good = await s.create({ type: 'page', data: { title: 'Policies' } })
    const bad = await s.create({ type: 'page', data: { title: '' } })
    const article = await s.create({ type: 'libraryArticle', data: { title: 'An article' } })

    const pending = await s.pending()
    expect(pending.map((d) => d.id).sort()).toEqual([good.id, bad.id, article.id].sort())
    expect(pending.find((d) => d.id === bad.id).errors.length).toBeGreaterThan(0)

    const r = await s.publishAll()
    expect(r.published.map((d) => d.id)).toEqual([good.id])
    expect(r.held.map((d) => d.id).sort()).toEqual([bad.id, article.id].sort())
    expect(r.failed).toEqual([])
    expect((await s.get(good.id)).status).toBe('published')
    expect((await s.get(bad.id)).status).toBe('draft')
    expect((await s.pending()).map((d) => d.id).sort()).toEqual([bad.id, article.id].sort())
  })
})

describe('discarding unpublished changes', () => {
  it('puts a changed document back to what is live, and refuses one never published', async () => {
    const s = createService({ schema: storyshaped, repo: createMemoryRepo() })
    const page = await s.create({ type: 'page', data: { title: 'Policies' } })
    const live = await s.publish(page.id, { baseVersion: page.version })
    const edited = await s.save(page.id, { baseVersion: live.version, data: { ...live.data, title: 'Policies, edited' } })
    expect(edited.status).toBe('changed')
    const back = await s.discard(page.id, { baseVersion: edited.version })
    expect(back.status).toBe('published')
    expect(back.data.title).toBe('Policies')
    const draft = await s.create({ type: 'page', data: { title: 'New' } })
    await expect(s.discard(draft.id, { baseVersion: draft.version })).rejects.toMatchObject({ status: 409 })
    const all = await s.discardAll()
    expect(all.kept.map((d) => d.id)).toEqual([draft.id])
  })
})
