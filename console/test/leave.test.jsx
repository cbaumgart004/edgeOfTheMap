// @vitest-environment jsdom
import { it, expect, beforeAll, afterAll } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import App from '../src/App.jsx'
import { createBridge } from '../src/bridge.js'
import { localStore } from '../src/store.js'
import { localAuth } from '../src/auth.js'

const schema = JSON.parse(readFileSync('schema/sites/spiritseeds.json', 'utf8'))
const tick = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)))
let phone = false
const media = window.matchMedia

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  window.matchMedia = (q) => ({ matches: q.includes('min-width') && !phone, media: q, addEventListener() {}, removeEventListener() {} })
})
afterAll(() => { window.matchMedia = media })

async function mount(store, props = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  await act(async () => createRoot(host).render(<App schema={schema} store={store} bridge={createBridge()} auth={localAuth()} onClose={() => {}} {...props} />))
  await tick(10)
  return host
}

it('asks Save, Review changes, Discard all or Cancel before the dashboard link leaves unpublished changes, Save first', async () => {
  localStorage.clear()
  phone = false
  const store = localStore({ schema })
  const type = Object.keys(schema.types).find((t) => !schema.types[t].singleton)
  await store.create({ type, data: { title: 'Draft' } })
  const host = await mount(store, { dashboard: 'https://admin.example' })
  await tick(10)
  const gear = host.querySelector('a[aria-label="Your account, pages and requests"]')
  const click = new MouseEvent('click', { bubbles: true, cancelable: true })
  await act(async () => gear.dispatchEvent(click))
  expect(click.defaultPrevented).toBe(true)
  const dialog = host.querySelector('[role="alertdialog"]')
  expect(dialog).toBeTruthy()
  expect([...dialog.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Save', 'Review changes', 'Discard all', 'Cancel'])
  expect(document.activeElement.textContent).toBe('Save')
  await act(async () => [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Cancel').click())
  expect(host.querySelector('[role="alertdialog"]')).toBeNull()
})
