// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import App from '../src/App.jsx'
import { createBridge } from '../src/bridge.js'
import { localStore } from '../src/store.js'
import { localAuth } from '../src/auth.js'

const schema = JSON.parse(readFileSync('test/fixtures/events.json', 'utf8'))

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })
})

const tick = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)))
const byText = (root, sel, text) => [...root.querySelectorAll(sel)].find((el) => el.textContent.includes(text))

describe('customer view', () => {
  it('hides drafts from the page without dropping them, and says so', () => {
    const bridge = createBridge()
    const seen = []
    bridge.subscribe((c) => seen.push(c))
    const published = [{ id: 'a', type: 'event', data: { title: 'Live' } }]
    bridge.push({ id: 'a', type: 'event', data: { title: 'Draft' } })
    bridge.push({ id: 'b', type: 'event', data: { title: 'New' } })
    expect(bridge.merge('event', published).map((d) => d.data.title)).toEqual(['Draft', 'New'])

    seen.length = 0
    bridge.setPreviewing(true)
    expect(bridge.previewing).toBe(true)
    expect(bridge.merge('event', published).map((d) => d.data.title)).toEqual(['Live'])
    expect(bridge.draft('event', 'a')).toBeNull()
    expect(seen).toEqual([{ type: '$preview' }, { type: 'event' }])

    bridge.setPreviewing(false)
    expect(bridge.merge('event', published).map((d) => d.data.title)).toEqual(['Draft', 'New'])
  })

  it('closing the editor ends customer view', () => {
    const bridge = createBridge()
    const seen = []
    bridge.subscribe((c) => seen.push(c))
    bridge.setPreviewing(true)
    bridge.clear()
    expect(bridge.previewing).toBe(false)
    expect(seen.filter((c) => c.type === '$preview')).toHaveLength(2)
  })

  it('steps the editor aside and brings it back', async () => {
    localStorage.clear()
    const host = document.createElement('div')
    document.body.append(host)
    const bridge = createBridge()
    await act(async () => createRoot(host).render(<App schema={schema} store={localStore({ schema })} bridge={bridge} auth={localAuth()} onClose={() => {}} />))
    await tick()

    await act(async () => byText(host, 'button', 'Customer view').click())
    expect(bridge.previewing).toBe(true)
    expect(host.querySelector('.eotm-sheet')).toBeNull()

    await act(async () => byText(host, 'button', 'Back to editing').click())
    await tick()
    expect(bridge.previewing).toBe(false)
    expect(host.querySelector('.eotm-sheet')).not.toBeNull()
  })
})
