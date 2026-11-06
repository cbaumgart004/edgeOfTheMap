// @vitest-environment jsdom
import { it, expect, beforeAll } from 'vitest'
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
  window.matchMedia = (q) => ({ matches: q.includes('min-width'), media: q, addEventListener() {}, removeEventListener() {} })
})

it('brings an open editor kept off screen by a wider window back into view', async () => {
  localStorage.clear()
  localStorage.setItem('eotm:panel-pos', JSON.stringify({ x: innerWidth + 75, y: innerHeight + 40 }))
  const host = document.createElement('div')
  document.body.append(host)
  await act(async () => createRoot(host).render(<App schema={schema} store={localStore({ schema })} bridge={createBridge()} auth={localAuth()} onClose={() => {}} />))
  await act(() => new Promise((r) => setTimeout(r, 0)))
  const sheet = host.querySelector('.eotm-sheet.is-loose')
  expect(sheet).toBeTruthy()
  expect(parseFloat(sheet.style.left)).toBeLessThan(innerWidth)
  expect(parseFloat(sheet.style.top)).toBeLessThan(innerHeight)
})
