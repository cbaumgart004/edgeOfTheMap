import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkSchema, checkDocument, duplicateDocument, newBlock, relationIds } from '../schema/schema.js'
import { createService, ConflictError } from '../core/service.js'
import { createMemoryRepo } from '../core/repo-memory.js'

const load = (name) => JSON.parse(readFileSync(new URL(`../schema/sites/${name}.json`, import.meta.url), 'utf8'))
const storyshaped = load('storyshaped')
const spiritseeds = load('spiritseeds')
// StoryShaped's inventory moved to its own Stock Item tables (StoryShaped
// ADR-0002); its former console types stay here because they exercise money,
// labelled photos, relations and drafts.
const inventory = JSON.parse(readFileSync(new URL('./fixtures/inventory.json', import.meta.url), 'utf8'))

describe('site schemas', () => {
  it.each([['storyshaped', storyshaped], ['spiritseeds', spiritseeds], ['inventory fixture', inventory]])('%s is a valid schema', (_, schema) => {
    expect(checkSchema(schema)).toEqual([])
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
