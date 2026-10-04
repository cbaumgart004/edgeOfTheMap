// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import App from '../src/App.jsx'
import { createBridge } from '../src/bridge.js'
import { localStore } from '../src/store.js'
import { localAuth } from '../src/auth.js'
import { mergeCustom } from '../schema/custom.js'

const shipped = JSON.parse(readFileSync('schema/sites/spiritseeds.json', 'utf8'))
const schema = mergeCustom(shipped, null) // as the API's boot answer is
const tick = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)))
const byText = (root, sel, text) => [...root.querySelectorAll(sel)].find((el) => el.textContent.includes(text))
const rect = (el, r) => { el.getBoundingClientRect = () => ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top }) }
const settle = async (store, id, pick, has) => {
  for (let i = 0; i < 40; i++) { const v = pick((await store.get(id)).data); if (has(v)) return v; await tick(100) }
  return pick((await store.get(id)).data)
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  document.body.innerHTML = ''
  localStorage.clear()
  window.matchMedia = (q) => ({ matches: q.includes('min-width'), media: q, addEventListener() {}, removeEventListener() {} })
})

async function mount(data) {
  const store = localStore({ schema: shipped })
  const doc = data ? await store.create({ type: 'page', data }) : null
  const host = document.createElement('div')
  document.body.append(host)
  await act(async () => createRoot(host).render(<App schema={schema} store={store} bridge={createBridge()} auth={localAuth()} onClose={() => {}} />))
  await tick()
  return { store, doc, host }
}

describe('Classes', () => {
  it('lists the site’s own, buttons first, and takes a class of the owner’s', async () => {
    expect(schema.types.classes.fields.map((f) => f.label)).toContain('Buttons')
    const { host, store } = await mount()
    await store.create({ type: 'classes', data: {} })
    await act(async () => byText(host, 'button.eotm-card', 'Classes').click())
    await tick(20)
    await act(async () => host.querySelector('.eotm-doc-open')?.click())
    await tick(20)
    expect(byText(host, '.eotm-field', 'Buttons')).toBeTruthy()
    const input = host.querySelector('input[aria-label="Class name"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Gold call-out')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => byText(host, 'button', 'Add class').click())
    await tick(20)
    expect(byText(host, '.eotm-field', 'Gold call-out')).toBeTruthy()
  })
})

describe('Elements from Arrange', () => {
  it('adds a text to a Free section, placed and kept, and copies one of the site’s parts as an element', async () => {
    const { store, doc } = await mount({ title: 'Home', sections: [{ _id: 's1', _type: 'contentSection', layout: 'centered', title: 'Hello', _layout: { mode: 'free', height: 40, parts: { title: { x: 10, y: 5, w: 50 } } } }] })
    const page = document.createElement('main')
    page.innerHTML = `<section data-eotm-edit="page:${doc.id}" data-eotm-item="s1" data-eotm-frame="free"><h2 data-eotm-part="title" data-eotm-placed style="--x:10;--y:5;--w:50">Hello</h2></section>`
    document.body.append(page)
    const section = page.querySelector('section')
    rect(section, { left: 0, top: 0, width: 1000, height: 400 })
    rect(section.querySelector('h2'), { left: 100, top: 50, width: 500, height: 60 })
    await act(async () => byText(document.body, '.eotm-modes button', 'Arrange').click())
    await act(async () => section.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })))
    await tick(20)
    await act(async () => byText(document.body, '.eotm-arrange-add button', '+ Text').click())
    const added = await settle(store, doc.id, (d) => d.sections[0], (s) => s._elements?.length === 1)
    const el = added._elements[0]
    expect(el).toMatchObject({ kind: 'text', text: 'New text', tag: 'p' })
    expect(added._layout.parts[el._id]).toMatchObject({ x: 30, w: 40 })

    // Select the heading and duplicate it: it becomes an element with its words.
    await act(async () => section.querySelector('h2').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 200, clientY: 60 })))
    await act(async () => window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })))
    await tick(20)
    await act(async () => byText(document.body, '.eotm-arrange-bar button', 'Duplicate').click())
    const copied = await settle(store, doc.id, (d) => d.sections[0], (s) => s._elements?.length === 2)
    expect(copied._elements[1]).toMatchObject({ kind: 'text', text: 'Hello', tag: 'h2' })
    expect(copied._layout.parts[copied._elements[1]._id]).toMatchObject({ x: 13, y: 8, w: 50 })
  })
})
