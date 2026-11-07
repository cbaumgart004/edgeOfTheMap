// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import Media from '../src/Media.jsx'
import { localStore } from '../src/store.js'

const schema = JSON.parse(readFileSync('test/fixtures/events.json', 'utf8'))
beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })
const tick = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)))
const byText = (root, sel, text) => [...root.querySelectorAll(sel)].find((el) => el.textContent.includes(text))
const type = (el, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
})

describe('Media tab', () => {
  it('lists uploads by name, makes a folder and moves a file into it', async () => {
    localStorage.clear()
    const store = localStore({ schema })
    await store.upload(new Blob(['x'], { type: 'image/jpeg' }), { name: 'Sunrise', width: 10, height: 10 })
    const host = document.createElement('div')
    document.body.append(host)
    const notes = []
    await act(async () => createRoot(host).render(<Media store={store} notify={(m) => notes.push(m)} />))
    await tick()
    expect(host.querySelector('.eotm-media-name').value).toBe('Sunrise')
    expect(host.textContent).toContain('1 files')

    await act(async () => byText(host, 'button', 'New folder').click())
    await type(host.querySelector('input[aria-label="New folder name"]'), 'Retreats')
    await act(async () => byText(host, 'button', 'Make folder').click())
    await tick()
    expect(byText(host, '.eotm-media-folder', 'Retreats')).toBeTruthy()

    const move = host.querySelector('.eotm-media-item select')
    await act(async () => { move.value = 'Retreats'; move.dispatchEvent(new Event('change', { bubbles: true })) })
    await tick()
    expect(host.querySelector('.eotm-media-item')).toBeNull()
    await act(async () => byText(host, '.eotm-media-folder', 'Retreats').click())
    expect(host.querySelector('.eotm-media-name').value).toBe('Sunrise')
    expect((await store.media.list()).items[0]).toMatchObject({ name: 'Sunrise', folder: 'Retreats' })
    expect(notes).toEqual([])
  })
})
