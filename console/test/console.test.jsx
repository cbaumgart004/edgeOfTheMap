// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import App from '../src/App.jsx'
import { createBridge } from '../src/bridge.js'
import { localStore } from '../src/store.js'
import { localAuth } from '../src/auth.js'

const schema = JSON.parse(readFileSync('schema/sites/spiritseeds.json', 'utf8'))

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })
})

const tick = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)))
const byText = (root, sel, text) => [...root.querySelectorAll(sel)].find((el) => el.textContent.includes(text))

describe('console in a page', () => {
  it('creates an event, pushes the draft to the page as it is typed, saves and publishes it', async () => {
    localStorage.clear()
    const host = document.createElement('div')
    document.body.append(host)
    const bridge = createBridge()
    const seen = []
    bridge.subscribe((c) => seen.push(c))
    const store = localStore({ schema })
    await act(async () => createRoot(host).render(<App schema={schema} store={store} bridge={bridge} auth={localAuth()} onClose={() => {}} />))
    await tick()

    await act(async () => byText(host, 'button.eotm-card', 'Events').click())
    await tick()
    await act(async () => byText(host, 'button', 'New event').click())
    await tick(10)

    const title = host.querySelector('input.eotm-input')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    await act(async () => {
      setter.call(title, 'Full moon sound bath')
      title.dispatchEvent(new Event('input', { bubbles: true }))
    })
    // The page hears about the edit before any save.
    expect(bridge.drafts('event')[0].data.title).toBe('Full moon sound bath')
    expect(seen.length).toBeGreaterThan(0)

    await tick(900) // autosave after 800 ms
    const [saved] = await store.list('event')
    expect(saved.data.title).toBe('Full moon sound bath')
    expect(saved.version).toBe(2)

    // Publishing is refused until the required fields are filled.
    await act(async () => byText(host, 'button', 'Publish').click())
    await tick(10)
    expect((await store.list('event'))[0].status).toBe('draft')
    expect(host.textContent).toMatch(/required/)
  })
})
