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
  whoMade: 'i_did', whenMade: 'made_to_order', isSupply: false,
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

  it('refuses the new options where they do not belong', () => {
    const bad = { site: 'x', version: 1, types: { t: { fields: [
      { name: 'a', kind: 'text', maxItems: 3 },
      { name: 'b', kind: 'photos', warnMissingIndex: true },
      { name: 'c', kind: 'text', pattern: '(' },
    ] } } }
    expect(checkSchema(bad)).toHaveLength(3)
  })
})
