import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkSchema, checkDocument, warnDocument } from '../schema/schema.js'

const schema = JSON.parse(readFileSync(new URL('../schema/sites/storyshaped.json', import.meta.url), 'utf8'))
const LISTING = {
  title: 'Sterling Blue Uranium Glass Ring Solitaire',
  description: 'A sapphire blue uranium glass gem in a 925 sterling silver solitaire ring.',
  photos: [{ src: '/assets/ring-day.webp', index: 'Light' }, { src: '/assets/ring-uv.webp', index: 'Dark' }],
  section: 'Uranium Glass Rings',
  etsyCategory: 'Jewelry < Rings < Statement Rings',
  tags: [{ _id: 't1', tag: 'uranium glass ring' }, { _id: 't2', tag: "vaseline glass" }],
  whoMade: 'i_did', whenMade: 'made_to_order', isSupply: false, condition: 'NEW',
  variationName: 'Ring size',
  variations: [{ _id: 'v1', option: '7 US', sku: 'RING-BLU-7', price: { amount: 14900, currency: 'USD' } }],
}

describe('StoryShaped Listing', () => {
  it('is a valid type, and a complete Listing publishes', () => {
    expect(checkSchema(schema)).toEqual([])
    expect(checkDocument(schema, 'listing', LISTING)).toEqual([])
  })

  it('publishes with photos under one index only, after a warning', () => {
    const one = { ...LISTING, photos: [LISTING.photos[0]] }
    expect(checkDocument(schema, 'listing', one)).toEqual([])
    expect(warnDocument(schema, 'listing', one)).toEqual([expect.stringMatching(/^Photos: no Dark photo\. The blacklight toggle will tint/)])
    expect(warnDocument(schema, 'listing', LISTING)).toEqual([])
    expect(warnDocument(schema, 'listing', { ...LISTING, photos: [] })).toEqual([]) // "required" already says so
  })

  it('holds Etsy to 13 tags of 20 characters in its own alphabet', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ _id: `t${i}`, tag: `tag ${i}` }))
    expect(checkDocument(schema, 'listing', { ...LISTING, tags: many })).toContain('tags: at most 13')
    expect(checkDocument(schema, 'listing', { ...LISTING, tags: [{ _id: 't', tag: 'glow #1' }] })).toEqual([expect.stringContaining('tags[0].tag')])
    expect(checkDocument(schema, 'listing', { ...LISTING, tags: [{ _id: 't', tag: 'x'.repeat(21) }] })).toEqual(['tags[0].tag: longer than 20'])
  })

  it('requires a category, a section and a priced SKU on every Variation', () => {
    const errors = checkDocument(schema, 'listing', { ...LISTING, etsyCategory: '', section: '', variations: [{ _id: 'v', option: '7 US', sku: 'bad sku!', price: { amount: null, currency: 'USD' } }] })
    expect(errors).toEqual(expect.arrayContaining(['etsyCategory: required', 'section: required', 'variations[0].sku: letters, numbers, . _ - only', 'variations[0].price: required']))
  })

  it("holds marketplace-only details: Etsy's materials and styles alphabet, two styles, eBay's 80-character title", () => {
    expect(checkDocument(schema, 'listing', { ...LISTING, materials: [{ _id: 'm', material: 'sterling-silver' }] })).toEqual([expect.stringContaining('materials[0].material')])
    const styles = [{ _id: 'a', style: 'Art Deco' }, { _id: 'b', style: 'Victorian' }, { _id: 'c', style: 'Retro' }]
    expect(checkDocument(schema, 'listing', { ...LISTING, etsy: { styles } })).toContain('etsy.styles: at most 2')
    expect(checkDocument(schema, 'listing', { ...LISTING, ebay: { title: 'x'.repeat(81) } })).toEqual(['ebay.title: longer than 80'])
    const full = {
      ...LISTING, condition: 'USED_EXCELLENT', conditionNote: 'Light wear to the band.', ebayCategoryId: '164343',
      channels: { site: true, etsy: true, ebay: true },
      package: { weight: 2, weightUnit: 'oz', length: 4, width: 4, height: 2, dimensionUnit: 'in' },
      etsy: { shippingProfileId: '123', styles: [styles[0]], autoRenew: true },
      ebay: { itemSpecifics: [{ _id: 's', name: 'Metal', value: 'Sterling Silver' }], bestOffer: false },
    }
    expect(checkDocument(schema, 'listing', full)).toEqual([])
  })

  it('refuses the new options where they do not belong', () => {
    const bad = { site: 'x', version: 1, types: { t: { fields: [
      { name: 'a', kind: 'text', maxItems: 3 },
      { name: 'b', kind: 'photos', warnMissingIndex: true },
      { name: 'c', kind: 'text', pattern: '(' },
    ] } } }
    expect(checkSchema(bad)).toHaveLength(3)
  })

  it('marks fields with the channels that need them, and reads choices from the site', () => {
    const channels = [{ name: 'etsy', label: 'Etsy', short: 'Et', color: '#f1641e' }, { name: 'ebay', label: 'eBay', short: 'eB' }]
    const ok = { site: 'x', version: 1, channels, types: { t: { fields: [
      { name: 'a', kind: 'text', requiredBy: ['etsy', 'ebay'] },
      { name: 'b', kind: 'select', optionsUrl: '/api/choices', options: [] },
      { name: 'c', kind: 'text', optionsUrl: 'https://example.com/choices' },
    ] } } }
    expect(checkSchema(ok)).toEqual([])
    // A value the site offers today may not be in the schema's own list.
    expect(checkDocument(ok, 't', { b: 'Anything the site offered' })).toEqual([])

    const bad = { site: 'x', version: 1, channels: [...channels, { name: 'etsy', label: 'Again', short: 'toolong' }], types: { t: { fields: [
      { name: 'a', kind: 'text', requiredBy: ['amazon'] },
      { name: 'b', kind: 'number', optionsUrl: '/api/choices' },
      { name: 'c', kind: 'text', optionsUrl: 'http://example.com' },
    ] } } }
    // The repeated channel and its short name, then one per field.
    expect(checkSchema(bad).length).toBeGreaterThanOrEqual(4)
    expect(checkSchema(bad)).toEqual(expect.arrayContaining([expect.stringContaining('requiredBy'), expect.stringContaining('optionsUrl')]))
  })

  it("marks what Etsy and eBay need, and offers the shop's own sections and categories", () => {
    const field = (n) => schema.types.listing.fields.find((f) => f.name === n)
    expect(schema.channels.map((c) => c.name)).toEqual(['etsy', 'ebay'])
    expect(field('title').requiredBy).toEqual(['etsy', 'ebay'])
    expect(field('section').optionsUrl).toBe('/api/marketplace/etsy/sections')
    expect(field('etsyCategory').optionsUrl).toBe('/api/marketplace/etsy/categories')
  })
})

describe('Listing manager', () => {
  it('searches title, tag and SKU, and checks its manage block', async () => {
    const { matches, valuesAt } = await import('../src/Manage.jsx')
    const m = schema.types.listing.manage
    const doc = { data: LISTING }
    expect(valuesAt(LISTING, 'tags.tag')).toEqual(['uranium glass ring', 'vaseline glass'])
    expect(matches(m, doc, 'ring solitaire')).toBe(true)
    expect(matches(m, doc, 'VASELINE')).toBe(true)
    expect(matches(m, doc, 'blu-7')).toBe(true)
    expect(matches(m, doc, 'necklace')).toBe(false)
    const bad = structuredClone(schema)
    bad.types.listing.manage = { ...m, groupBy: ['nope'], variations: { list: 'title', sku: 'sku', price: 'price' }, stock: { list: '/x', count: '/y' } }
    expect(checkSchema(bad).join('\n')).toMatch(/groupBy[\s\S]*variations[\s\S]*stock/)
  })
})
