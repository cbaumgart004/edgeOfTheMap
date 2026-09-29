import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkCustom, mergeCustom, customName, fieldName, droppedCustom } from '../schema/custom.js'
import { checkDocument } from '../schema/schema.js'
import { createHandler } from '../api/handler.js'

const base = JSON.parse(readFileSync(new URL('../schema/sites/spiritseeds.json', import.meta.url), 'utf8'))
const banner = {
  blocks: {
    customBanner: { label: 'Banner', fields: [
      { name: 'message', kind: 'richtext', label: 'Message', required: true },
      { name: 'look', kind: 'select', label: 'Look', options: [{ value: 'calm', label: 'Calm' }] },
      { name: 'links', kind: 'list', label: 'Links', fields: [{ name: 'label', kind: 'text', label: 'Label' }, { name: 'url', kind: 'url', label: 'Link' }] },
    ] },
  },
  types: { customTestimonial: { label: 'Testimonial', plural: 'Testimonials', titleField: 'name', fields: [{ name: 'name', kind: 'text', label: 'Name' }] } },
}

describe('owner-defined types', () => {
  it('names types and fields from what the owner calls them', () => {
    expect(customName('Event banner!')).toBe('customEventBanner')
    expect(fieldName('Button link')).toBe('buttonLink')
  })

  it('adds a custom section to every page palette and a custom collection as a type', () => {
    expect(checkCustom(base, banner)).toEqual([])
    const merged = mergeCustom(base, banner)
    expect(merged.types.page.fields.find((f) => f.name === 'blocks').of).toContain('customBanner')
    expect(merged.types.customTestimonial.custom).toBe(true)
    expect(base.types.page.fields.find((f) => f.name === 'blocks').of).not.toContain('customBanner')
    const page = { title: 'Home', blocks: [{ _id: 'b', _type: 'customBanner', message: '<p>Closed Monday</p>', links: [{ _id: 'l', label: 'More', url: '/about' }] }] }
    expect(checkDocument(merged, 'page', page)).toEqual([])
  })

  it('refuses names that could collide, kinds that need code, and empty types', () => {
    expect(checkCustom(base, { blocks: { banner: { label: 'B', fields: [{ name: 'a', kind: 'text', label: 'A' }] } } })[0]).toMatch(/start with "custom"/)
    expect(checkCustom(base, { blocks: { customX: { label: 'X', fields: [{ name: 'a', kind: 'relation', label: 'A', to: 'page' }] } } })[0]).toMatch(/cannot be used/)
    expect(checkCustom(base, { types: { customX: { label: 'X', fields: [] } } })[0]).toMatch(/at least one field/)
    expect(checkCustom(base, { blocks: { customX: { label: 'X', fields: [{ name: 'l', kind: 'list', label: 'L', fields: [{ name: 'n', kind: 'list', label: 'N', fields: [] }] }] } } }).join()).toMatch(/cannot be used/)
  })

  it('knows which custom types a save drops', () => {
    expect(droppedCustom(banner, { blocks: banner.blocks })).toEqual({ blocks: [], types: ['customTestimonial'] })
  })
})

describe('photo settings', () => {
  it('accepts a quarter turn, a flip and an opacity, and nothing else', () => {
    const doc = (image) => ({ title: 'T', blocks: [{ _id: 'a', _type: 'contentSection', image }] })
    expect(checkDocument(base, 'page', doc({ src: '/a.jpg', rotate: 90, flip: true, opacity: 60 }))).toEqual([])
    expect(checkDocument(base, 'page', doc({ src: '/a.jpg', rotate: 45 }))[0]).toMatch(/rotate/)
    expect(checkDocument(base, 'page', doc({ src: '/a.jpg', opacity: 5 }))[0]).toMatch(/opacity/)
  })
})

describe('PUT /custom-schema', () => {
  const ORIGIN = 'https://spiritseedswellness.com'
  const make = ({ role = 'owner', inUse = false, custom = {} } = {}) => {
    const saved = []
    const site = { id: 's', slug: 'spiritseeds', name: 'SS', schema: base, custom_schema: custom, console_version: '0.1.0', console_integrity: 'x', allowed_origins: [ORIGIN] }
    const handle = createHandler({
      control: {
        async query(sql, p) {
          if (sql.startsWith('SELECT * FROM sites')) return { rows: [structuredClone(site)] }
          if (sql.includes('FROM site_members')) return { rows: [{ role }] }
          if (sql.startsWith('UPDATE sites SET custom_schema')) { saved.push(p[1]); return { rowCount: 1 } }
          throw new Error(sql)
        },
      },
      siteDb: async () => ({ query: async () => ({ rows: inUse ? [{}] : [] }) }),
      verifyToken: async () => ({ id: 'u' }), presign: async () => '', sanitize: () => (t, d) => d,
    })
    const call = (body) => handle({ requestContext: { http: { method: 'PUT' } }, rawPath: '/api/sites/spiritseeds/custom-schema',
      headers: { origin: ORIGIN, authorization: 'Bearer t' }, body: JSON.stringify(body) })
      .then((r) => ({ status: r.statusCode, json: JSON.parse(r.body) }))
    return { call, saved }
  }

  it('saves an owner\'s types and answers with the merged schema', async () => {
    const { call, saved } = make()
    const r = await call({ custom: banner })
    expect(r.status).toBe(200)
    expect(r.json.schema.blocks.customBanner.custom).toBe(true)
    expect(saved).toEqual([banner])
  })

  it('refuses an editor, a bad definition, and dropping a type still in use', async () => {
    expect((await make({ role: 'editor' }).call({ custom: banner })).status).toBe(403)
    expect((await make().call({ custom: { blocks: { nope: {} } } })).status).toBe(400)
    const r = await make({ inUse: true, custom: banner }).call({ custom: {} })
    expect(r.status).toBe(409)
    expect(r.json.error).toMatch(/still/)
  })
})
