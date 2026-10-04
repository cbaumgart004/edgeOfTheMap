// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import App from '../src/App.jsx'
import { createBridge } from '../src/bridge.js'
import { localStore } from '../src/store.js'
import { localAuth } from '../src/auth.js'
import { toUnits, toFree, setPart, dragPart, pinchPart, restack, snapX } from '../src/arrange.js'
import { checkDocument } from '../schema/schema.js'

const schema = JSON.parse(readFileSync('schema/sites/storyshaped.json', 'utf8'))
const S = { left: 100, top: 50, width: 1000, height: 400 }

describe('Arrange arithmetic', () => {
  it('turns a box on the page into units of the section’s width, across and down', () => {
    expect(toUnits({ left: 200, top: 150, width: 500, height: 80 }, S)).toEqual({ x: 10, y: 10, w: 50, h: 8 })
  })

  it('switches to Free where everything is drawn, keeping places it had before', () => {
    const old = { mode: 'flow', height: 30, parts: { heading: { x: 1, y: 2, w: 3 } } }
    const next = toFree(old, { heading: { x: 9, y: 9, w: 9, h: 9 }, body: { x: 5, y: 20, w: 90, h: 12 } }, 40)
    expect(next).toEqual({ mode: 'free', height: 30, parts: { heading: { x: 1, y: 2, w: 3 }, body: { x: 5, y: 20, w: 90 } } })
  })

  it('moves, snapping to twelve columns and an 8 px step', () => {
    const start = { x: 10, y: 10, w: 30 }
    expect(dragPart(start, 'move', 50, 25, { width: 1000 })).toEqual({ x: 15, y: 12.5, w: 30 })
    const snapped = dragPart(start, 'move', 50, 25, { width: 1000, snap: true })
    expect(snapped.x).toBe(snapX(15))
    expect(snapped.y).toBe(12.8) // 8 px is 0.8 units at 1000 px wide
  })

  it('scales text with a corner and only the width with a side', () => {
    const start = { x: 10, y: 10, w: 40, fs: 100 }
    expect(dragPart(start, 'se', 200, 0, { width: 1000, text: true })).toEqual({ x: 10, y: 10, w: 60, fs: 150 })
    expect(dragPart(start, 'e', 200, 0, { width: 1000, text: true })).toEqual({ x: 10, y: 10, w: 60, fs: 100 })
    expect(dragPart(start, 'w', 100, 0, { width: 1000 })).toEqual({ x: 20, y: 10, w: 30, fs: 100 })
    expect(dragPart({ x: 0, y: 0, w: 50, h: 20 }, 'se', 500, 0, { width: 1000 })).toEqual({ x: 0, y: 0, w: 100, h: 40 })
  })

  it('pinches about the centre, and layers to front or back', () => {
    expect(pinchPart({ x: 10, y: 10, w: 40, fs: 100 }, 1.5, { text: true })).toEqual({ x: 0, y: 10, w: 60, fs: 150 })
    const layout = { parts: { a: { x: 0, y: 0, w: 1, z: 3 }, b: { x: 0, y: 0, w: 1 } } }
    expect(restack(layout, 'b', true).parts.b.z).toBe(4)
    expect(restack(layout, 'a', false).parts.a.z).toBe(0)
  })

  it('writes positions the schema accepts, and clears what is set to null', () => {
    const layout = setPart(toFree({}, { heading: { x: 5, y: 5, w: 50 } }, 40), 'heading', { opacity: 60, fs: 120 })
    const page = { title: 'P', sections: [{ _id: 'v', _type: 'values', heading: 'H', items: [], _layout: layout }] }
    expect(checkDocument(schema, 'page', page)).toEqual([])
    expect(setPart(layout, 'heading', { fs: null }).parts.heading).toEqual({ x: 5, y: 5, w: 50, opacity: 60 })
  })
})

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.matchMedia = (q) => ({ matches: q.includes('min-width'), media: q, addEventListener() {}, removeEventListener() {} })
})
const tick = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)))
const byText = (root, sel, text) => [...root.querySelectorAll(sel)].find((el) => el.textContent.includes(text))
// Waits for the editor's autosave (800 ms after the last change) to store it.
const saved = async (store, id, has) => {
  for (let i = 0; i < 40; i++) {
    const v = (await store.get(id)).data.sections[0]._layout
    if (has(v)) return v
    await tick(100)
  }
  return (await store.get(id)).data.sections[0]._layout
}
const rect = (el, r) => { el.getBoundingClientRect = () => ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top }) }

describe('Arrange on the page', () => {
  it('makes a section Free from where its parts are drawn, then moves a part', async () => {
    localStorage.clear()
    const store = localStore({ schema })
    const doc = await store.create({ type: 'page', data: { title: 'Home', sections: [{ _id: 'sec1', _type: 'values', heading: 'Hello', items: [] }] } })
    // The site's markup for that section (Frame.jsx marks).
    const page = document.createElement('main')
    page.innerHTML = `<section data-eotm-edit="page:${doc.id}" data-eotm-item="sec1"><div data-eotm-part="heading">Hello</div><div data-eotm-part="items">…</div></section>`
    document.body.append(page)
    const section = page.querySelector('section')
    rect(section, S)
    rect(page.querySelector('[data-eotm-part="heading"]'), { left: 200, top: 100, width: 500, height: 60 })
    rect(page.querySelector('[data-eotm-part="items"]'), { left: 100, top: 200, width: 1000, height: 200 })

    const host = document.createElement('div')
    document.body.append(host)
    await act(async () => createRoot(host).render(<App schema={schema} store={store} bridge={createBridge()} auth={localAuth()} onClose={() => {}} />))
    await tick()
    await act(async () => byText(host, '.eotm-modes button', 'Arrange').click())
    await act(async () => section.querySelector('[data-eotm-part="heading"]').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 120, button: 0 })))
    await tick(20)
    await act(async () => byText(document.body, '.eotm-arrange-bar button', 'Free').click())
    expect(await saved(store, doc.id, (v) => v?.mode === 'free')).toEqual({ mode: 'free', height: 40, parts: { heading: { x: 10, y: 5, w: 50 }, items: { x: 0, y: 15, w: 100 } } })

    // The site redraws it Free; dragging the heading 100 px right moves it 10
    // units, onto the nearest column (Snap is on until the owner turns it off).
    section.dataset.eotmFrame = 'free'
    const heading = section.querySelector('[data-eotm-part="heading"]')
    const ev = (type, x) => new MouseEvent(type, { bubbles: true, clientX: x, clientY: 120, button: 0 })
    await act(async () => heading.dispatchEvent(ev('pointerdown', 300)))
    await act(async () => window.dispatchEvent(ev('pointermove', 400)))
    await tick(20)
    await act(async () => window.dispatchEvent(ev('pointerup', 400)))
    expect((await saved(store, doc.id, (v) => v?.parts?.heading?.x !== 10)).parts.heading).toEqual({ x: 16.67, y: 4.8, w: 50 })
  })
})
