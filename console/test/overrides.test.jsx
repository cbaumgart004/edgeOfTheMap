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
import { checkSchema } from '../schema/schema.js'

const shipped = JSON.parse(readFileSync('schema/sites/edgeofthemap.json', 'utf8'))
const schema = mergeCustom(shipped, null)
const tick = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)))

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  document.body.innerHTML = ''
  localStorage.clear()
  window.matchMedia = (q) => ({ matches: q.includes('min-width'), media: q, addEventListener() {}, removeEventListener() {} })
})

describe('Edge of the Map: overrides of the site’s own elements', () => {
  it('is a valid schema with a page of overrides', () => {
    expect(checkSchema(schema)).toEqual([])
    expect(schema.types.pageEdits.overrides).toBe('edits')
  })

  it('starts the page and the element’s row on the first edit, typed on the page', async () => {
    const store = localStore({ schema: shipped })
    const page = document.createElement('main')
    page.innerHTML = '<section data-eotm-edit="pageEdits:home" data-eotm-item="hero"><h1 data-eotm-in="hero:title" data-eotm-text="text" data-eotm-part="hero:title">One workshop</h1></section>'
    document.body.append(page)
    const host = document.createElement('div')
    document.body.append(host)
    await act(async () => createRoot(host).render(<App schema={schema} store={store} bridge={createBridge()} auth={localAuth()} onClose={() => {}} />))
    await tick()
    const h1 = page.querySelector('h1')
    await act(async () => h1.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })))
    await tick(50)
    h1.textContent = 'One workshop, four trades.'
    await act(async () => h1.dispatchEvent(new Event('input', { bubbles: true })))
    let docs = []
    for (let i = 0; i < 30 && !docs[0]?.data?.edits?.length; i++) { await tick(100); docs = await store.list('pageEdits') }
    expect(docs[0].slug).toBe('home')
    expect(docs[0].data.edits).toEqual([{ _id: 'hero:title', text: 'One workshop, four trades.' }])
  })
})
