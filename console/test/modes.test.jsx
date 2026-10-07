// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import App from '../src/App.jsx'
import { createBridge } from '../src/bridge.js'
import { localStore } from '../src/store.js'
import { localAuth } from '../src/auth.js'

const schema = JSON.parse(readFileSync('schema/sites/storyshaped.json', 'utf8'))
const tick = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)))
const byText = (root, sel, text) => [...root.querySelectorAll(sel)].find((el) => el.textContent.includes(text))
const rect = (el, r) => { el.getBoundingClientRect = () => ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top }) }
let phone = false

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  document.body.innerHTML = ''
  localStorage.clear()
  sessionStorage.clear()
  // A desktop, or with `phone` a phone held upright.
  window.matchMedia = (q) => ({ matches: phone ? q.includes('max-width') || q.includes('portrait') : q.includes('min-width'), media: q, addEventListener() {}, removeEventListener() {} })
})

async function mount() {
  const store = localStore({ schema })
  const doc = await store.create({ type: 'page', data: { title: 'Home', sections: [{ _id: 'h1', _type: 'hero', tagline: 'Hi', buttons: [{ _id: 'b1', label: 'Shop', url: '/shop' }] }] } })
  const page = document.createElement('main')
  page.innerHTML = `<section data-eotm-edit="page:${doc.id}" data-eotm-item="h1"><p data-eotm-part="tagline">Hi</p>
    <div data-eotm-part="buttons" data-eotm-field="buttons"><a href="/shop" data-eotm-in="b1"><img alt=""><span data-eotm-text="label" data-eotm-in="b1">Shop</span></a></div></section>`
  document.body.append(page)
  const host = document.createElement('div')
  document.body.append(host)
  await act(async () => createRoot(host).render(<App schema={schema} store={store} bridge={createBridge()} auth={localAuth()} onClose={() => {}} />))
  await tick()
  return { store, doc, page, host }
}

describe('View, Edit and Arrange', () => {
  it('Edit opens a button instead of following it; View lets it work', async () => {
    const { page, host } = await mount()
    const link = page.querySelector('a')
    const click = () => { const e = new MouseEvent('click', { bubbles: true, cancelable: true }); page.querySelector('img').dispatchEvent(e); return e }
    let e
    await act(async () => { e = click() })
    await tick(20)
    expect(e.defaultPrevented).toBe(true)
    expect(host.querySelector('[data-eotm-item="b1"]')?.className).toContain('is-open')
    await act(async () => byText(host, '.eotm-modes button', 'View').click())
    await act(async () => { e = click() })
    expect(e.defaultPrevented).toBe(false)
    expect(link.getAttribute('href')).toBe('/shop')
  })

  it('on a phone, Free starts the phone’s own layout and leaves the desktop one alone', async () => {
    phone = true
    try {
      const { store, doc, page, host } = await mount()
      const section = page.querySelector('section')
      rect(section, { left: 0, top: 0, width: 400, height: 300 })
      rect(page.querySelector('[data-eotm-part="tagline"]'), { left: 20, top: 20, width: 360, height: 40 })
      rect(page.querySelector('[data-eotm-part="buttons"]'), { left: 20, top: 100, width: 200, height: 40 })
      await act(async () => byText(host, '.eotm-modes button', 'Arrange').click())
      expect(document.body.textContent).toContain('Edits on a phone change the phone view only')
      await act(async () => section.querySelector('p').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })))
      await act(async () => window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 })))
      await tick(20)
      // A click on a part selects the part; Section steps out to the section's own choices.
      await act(async () => byText(document.body, '.eotm-arrange-bar button', 'Section').click())
      await tick(20)
      await act(async () => byText(document.body, '.eotm-arrange-bar button', 'Free').click())
      let layout
      for (let i = 0; i < 30 && !layout?.phoneParts; i++) { await tick(100); layout = (await store.get(doc.id)).data.sections[0]._layout }
      expect(layout).toEqual({ phone: 'free', phoneHeight: 75, phoneParts: { tagline: { x: 5, y: 5, w: 90 }, buttons: { x: 5, y: 25, w: 50 } } })
    } finally {
      phone = false
    }
  })
})
