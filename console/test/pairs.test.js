import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkSchema } from '../schema/schema.js'
import { pairedFields, holdsPairs, getAt, updateAt, pairsOf, setSlot, removeSlot, removePair, tagPhoto, incomplete } from '../src/pairs.js'

const schema = JSON.parse(readFileSync(new URL('../schema/sites/storyshaped.json', import.meta.url), 'utf8'))
const IX = ['Light', 'Dark']
const L = (n) => ({ src: `/l${n}.webp`, index: 'Light' })
const D = (n) => ({ src: `/d${n}.webp`, index: 'Dark' })
const pairs = (photos) => pairsOf(photos, IX).map((r) => (r.untagged ? `?${r.untagged.photo.src}` : `${r.slots.Light?.photo.src ?? '-'}|${r.slots.Dark?.photo.src ?? '-'}`))

describe('image pairs', () => {
  it('pairs the nth Light with the nth Dark, and lists untagged photos apart', () => {
    expect(pairs([L(1), D(1), L(2), { src: '/x.webp' }])).toEqual(['/l1.webp|/d1.webp', '/l2.webp|-', '?/x.webp'])
    expect(incomplete(pairsOf([L(1), D(1), L(2)], IX))).toBe(1)
  })

  it('fills the empty side of the pair asked for, not the first one missing it', () => {
    const photos = [L(1), L(2), L(3)]
    const next = setSlot(photos, IX, 2, 'Dark', { src: '/d3.webp' })
    expect(pairs(next)).toContain('/l3.webp|/d3.webp')
    expect(pairs(next)).toHaveLength(3)
  })

  it('replaces a photo and keeps its description', () => {
    const next = setSlot([{ ...L(1), alt: 'ring' }, D(1)], IX, 0, 'Light', { src: '/new.webp', width: 10 })
    expect(next[0]).toEqual({ src: '/new.webp', width: 10, alt: 'ring', index: 'Light' })
  })

  it('refuses a photo past maxItems', () => {
    expect(() => setSlot([L(1), D(1)], IX, 1, 'Light', { src: '/x' }, { maxItems: 2 })).toThrow(/at most 2/)
  })

  it('keeps the later pairs together when one side is removed', () => {
    const next = removeSlot([L(1), D(1), L(2), D(2), L(3), D(3)], IX, 0, 'Dark')
    expect(pairs(next)).toEqual(['/l2.webp|/d2.webp', '/l3.webp|/d3.webp', '/l1.webp|-'])
    expect(pairs(removePair([L(1), D(1), L(2), D(2)], IX, 0))).toEqual(['/l2.webp|/d2.webp'])
  })

  it('marks an untagged photo, joining the first pair missing that side', () => {
    expect(pairs(tagPhoto([L(1), { src: '/x.webp' }], IX, 1, 'Dark'))).toEqual(['/l1.webp|/x.webp'])
  })

  it('finds paired fields in a Listing, a page section and an Image pair', () => {
    expect(checkSchema(schema)).toEqual([])
    expect(holdsPairs(schema, 'listing')).toBe(true)
    expect(holdsPairs(schema, 'page')).toBe(true)
    expect(holdsPairs(schema, 'imagePair')).toBe(true)
    expect(holdsPairs(schema, 'menu')).toBe(false)
    const page = { title: 'Home', sections: [{ _id: 'h', _type: 'hero', photos: [L(1)] }, { _id: 'c', _type: 'card', images: [] }] }
    const [loc] = pairedFields(schema, 'page', page)
    expect(loc.where).toBe('Hero')
    expect(getAt(page, loc.path)).toEqual([L(1)])
    const next = updateAt(page, loc.path, (p) => setSlot(p, IX, 0, 'Dark', { src: '/d1.webp' }))
    expect(next.sections[0].photos).toEqual([L(1), D(1)])
    expect(next.sections[1]).toBe(page.sections[1])
  })
})

describe('schema views and images', () => {
  it('splits the Theme into Daylight and Blacklight views', () => {
    expect(schema.types.theme.views.map((v) => v.mode)).toEqual(['daylight', 'blacklight'])
  })

  it('rejects views on a type with many documents, or naming a field it lacks', () => {
    const bad = structuredClone(schema)
    bad.types.listing.views = [{ label: 'X', fields: ['nope'] }]
    expect(checkSchema(bad)).toEqual(expect.arrayContaining([
      'types.listing.views: only a singleton has views', 'types.listing.views.X: unknown field "nope"',
    ]))
    bad.images = { type: 'menu' }
    expect(checkSchema(bad)).toContain('images: menu needs a photos field with two indexes')
  })
})
