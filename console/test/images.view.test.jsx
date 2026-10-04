// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import App from '../src/App.jsx'
import { createBridge } from '../src/bridge.js'
import { localStore } from '../src/store.js'
import { localAuth } from '../src/auth.js'

const schema = JSON.parse(readFileSync('schema/sites/storyshaped.json', 'utf8'))

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.matchMedia = (q) => ({ matches: q.includes('min-width'), media: q, addEventListener() {}, removeEventListener() {} })
})

const tick = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)))
const byText = (root, sel, text) => [...root.querySelectorAll(sel)].find((el) => el.textContent.includes(text))

async function mount() {
  localStorage.clear()
  const host = document.createElement('div')
  document.body.append(host)
  const bridge = createBridge()
  const store = localStore({ schema })
  await act(async () => createRoot(host).render(<App schema={schema} store={store} bridge={bridge} auth={localAuth()} onClose={() => {}} />))
  await tick()
  return { host, bridge, store }
}

describe('StoryShaped in the console', () => {
  it('shows the Theme as a Daylight and a Blacklight theme, each switching the page to its look', async () => {
    const { host, bridge } = await mount()
    expect(byText(host, 'button.eotm-card', 'Daylight theme')).toBeTruthy()
    expect(byText(host, 'button.eotm-card', 'Blacklight theme')).toBeTruthy()
    const modes = []
    bridge.subscribe((c) => c.type === '$mode' && modes.push(c.mode))

    await act(async () => byText(host, 'button.eotm-card', 'Daylight theme').click())
    await tick(10)
    expect(host.querySelector('.eotm-title').textContent).toContain('Daylight theme')
    expect(modes).toEqual(['daylight'])
    const groups = [...host.querySelectorAll('.eotm-editor details.is-fold')]
    expect(groups.find((d) => d.querySelector('summary').textContent === 'Light').open).toBe(true)
    expect(groups.some((d) => d.querySelector('summary').textContent === 'Blacklight')).toBe(false)
    expect(byText(host, '.eotm-editor summary', 'Shared by every theme')).toBeTruthy()

    await act(async () => host.querySelector('button[aria-label="Back"]').click())
    await tick(10)
    expect(modes).toEqual(['daylight', null])
  })

  it('lists a Listing with only Light photos in Images, and a Dark side gets filled from there', async () => {
    const { host, store } = await mount()
    const listing = await store.create({ type: 'listing', data: { title: 'Blue ring', photos: [{ src: '/l1.webp', index: 'Light' }, { src: '/l2.webp', index: 'Light' }] } })

    await act(async () => byText(host, 'button.eotm-card', 'Images').click())
    await tick(10)
    expect(byText(host, '.eotm-pair-doc', 'Blue ring')).toBeTruthy()
    expect(host.querySelectorAll('.eotm-pair-doc .eotm-slot.is-empty').length).toBe(2)
    expect(host.textContent).toContain('Only pairs missing a photo (2)')

    // A Dark photo removed from the first pair moves it behind the second.
    await act(async () => byText(host, '.eotm-pair-doc', 'Blue ring').querySelector('button[aria-label="Remove this pair"]').click())
    await tick(10)
    expect((await store.get(listing.id)).data.photos.map((p) => p.src)).toEqual(['/l2.webp'])
  })

  it('starts a new Image pair from Images', async () => {
    const { host, store } = await mount()
    await act(async () => byText(host, 'button.eotm-card', 'Images').click())
    await tick(10)
    await act(async () => byText(host, 'button', 'New image pair').click())
    await tick(10)
    expect((await store.list('imagePair'))[0].data.title).toBe('New pair')
    expect(byText(host, '.eotm-pair-doc', 'New pair').querySelectorAll('.eotm-slot.is-empty').length).toBe(2)
  })
})
