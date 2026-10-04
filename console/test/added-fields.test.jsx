// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import App from '../src/App.jsx'
import { createBridge } from '../src/bridge.js'
import { localStore } from '../src/store.js'
import { localAuth } from '../src/auth.js'
import { checkCustom, mergeCustom, addedFields } from '../schema/custom.js'
import { checkDocument } from '../schema/schema.js'

const schema = JSON.parse(readFileSync('schema/sites/storyshaped.json', 'utf8'))

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.matchMedia = (q) => ({ matches: q.includes('min-width'), media: q, addEventListener() {}, removeEventListener() {} })
})

const tick = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)))
const byText = (root, sel, text) => [...root.querySelectorAll(sel)].find((el) => el.textContent.includes(text))
const type = async (el, value) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}

describe('fields the owner adds to built-in elements', () => {
  const custom = { fields: {
    'types.siteSettings.socials': [{ name: 'customPhoto', kind: 'image', label: 'Photo' }],
    'blocks.values': [{ name: 'customLook', kind: 'style', label: 'Look' }],
  } }

  it('merge into the row, section or type they name, marked as added', () => {
    expect(checkCustom(schema, custom)).toEqual([])
    const merged = mergeCustom(schema, custom)
    expect(addedFields(merged, 'types.siteSettings.socials').map((f) => f.name)).toEqual(['customPhoto'])
    expect(merged.types.siteSettings.fields.find((f) => f.name === 'socials').fields.at(-1)).toMatchObject({ name: 'customPhoto', added: true })
    expect(addedFields(merged, 'blocks.values')[0].kind).toBe('style')
    // Validated like any field: a photo needs a src, a style its options.
    const settings = { socials: [{ _id: 's', label: 'Etsy', url: 'https://etsy.com', customPhoto: { alt: 'x' } }] }
    expect(checkDocument(merged, 'siteSettings', settings)).toEqual(['socials[0].customPhoto: image needs a src'])
  })

  it('are refused under a name that is not custom, on something that takes none, or twice', () => {
    expect(checkCustom(schema, { fields: { 'types.siteSettings.socials': [{ name: 'photo', kind: 'image', label: 'Photo' }] } }))
      .toContain('fields.types.siteSettings.socials.photo: added names start with "custom"')
    expect(checkCustom(schema, { fields: { 'types.siteSettings.siteName': [{ name: 'customX', kind: 'text', label: 'X' }] } }))
      .toContain('fields.types.siteSettings.siteName: nothing there takes fields')
    expect(checkCustom(schema, { fields: { 'blocks.hero': [{ name: 'customX', kind: 'photos', label: 'X' }] } }))
      .toContain('fields.blocks.hero.customX: "photos" cannot be used in a custom type')
  })

  it('checks a style against the site’s named colours', () => {
    const merged = mergeCustom(schema, custom)
    const page = (look) => ({ title: 'P', sections: [{ _id: 'v', _type: 'values', heading: 'H', items: [], customLook: look }] })
    expect(checkDocument(merged, 'page', page({ size: 'large', color: 'accent', background: '#102030', width: 60 }))).toEqual([])
    expect(checkDocument(merged, 'page', page({ size: 'huge', color: 'pink' }))).toEqual([
      'sections[0].customLook.size: "huge" is not an option', 'sections[0].customLook.color: a site colour or #rrggbb',
    ])
  })

  it('are added from the editor, to every social link at once', async () => {
    localStorage.clear()
    const host = document.createElement('div')
    document.body.append(host)
    const store = localStore({ schema })
    await store.create({ type: 'siteSettings', data: { socials: [{ _id: 's1', label: 'Etsy', url: 'https://etsy.com' }] } })
    await act(async () => createRoot(host).render(<App schema={schema} store={store} bridge={createBridge()} auth={localAuth()} onClose={() => {}} />))
    await tick()
    await act(async () => byText(host, 'button.eotm-card', 'Site header and footer').click())
    await tick(10)
    await act(async () => host.querySelector('.eotm-doc-open').click())
    await tick(10)
    // Open the Etsy row, then add a Photo field to it.
    await act(async () => byText(host, '.eotm-item-head button', 'Etsy').click())
    await tick()
    const row = host.querySelector('[data-eotm-item="s1"]')
    await act(async () => byText(row, 'button', '+ Add a field').click())
    expect(row.textContent).toContain('Adds a field to every row of')
    await type(row.querySelector('input[aria-label="Field name"]'), 'Photo')
    await act(async () => byText(row, 'button', 'Add field').click())
    await tick(10)
    const added = host.querySelector('[data-eotm-item="s1"] [data-eotm-field="customPhoto"]')
    expect(added.querySelector('.eotm-image')).toBeTruthy()
    expect(added.textContent).toContain('Remove field')
  })
})
