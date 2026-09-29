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

  it('links home to the dashboard and labels the preview toggle', async () => {
    localStorage.clear()
    const host = document.createElement('div')
    document.body.append(host)
    await act(async () => createRoot(host).render(<App schema={schema} store={localStore({ schema })} bridge={createBridge()} auth={localAuth()}
      dashboard="https://admin.theedgeofthemap.com" onClose={() => {}} />))
    await tick()
    expect(host.querySelector('a[aria-label="Back to your dashboard"]').href).toBe('https://admin.theedgeofthemap.com/')

    const preview = byText(host, 'button', 'Preview')
    await act(async () => preview.click())
    expect(preview.getAttribute('aria-pressed')).toBe('true')
    expect(preview.textContent).toBe('Edit')
    expect(host.querySelector('.eotm-sheet').classList.contains('is-peek')).toBe(true)
  })

  it('orders and sizes the blocks the page marks, and writes the whole arrangement', async () => {
    localStorage.clear()
    const story = JSON.parse(readFileSync('schema/sites/storyshaped.json', 'utf8'))
    const page = document.createElement('main')
    page.dataset.eotmLayout = ''
    page.innerHTML = ['hero', 'story', 'makers'].map((k) => `<section data-eotm-block="${k}" data-eotm-label="${k}" data-eotm-span="12"></section>`).join('')
    document.body.append(page)
    const host = document.createElement('div')
    document.body.append(host)
    const store = localStore({ schema: story })
    const doc = await store.create({ type: 'pageLayout', data: { title: 'Home', path: '/' } })
    const root = createRoot(host)
    await act(async () => root.render(<App schema={story} store={store} bridge={createBridge()} auth={localAuth()} onClose={() => {}} />))
    await tick()
    await act(async () => byText(host, 'button.eotm-card', 'Page layouts').click())
    await tick()
    await act(async () => byText(host, 'button.eotm-doc-open', 'Home').click())
    await tick(10)

    await act(async () => host.querySelector('button[aria-label="Move makers up"]').click())
    const width = host.querySelector('select[aria-label="Width of story"]')
    await act(async () => {
      width.value = '6'
      width.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await tick(900)
    expect((await store.get(doc.id)).data.blocks).toEqual([{ key: 'hero', span: 12 }, { key: 'makers', span: 12 }, { key: 'story', span: 6 }])
    await act(async () => root.unmount())
    page.remove()
  })

  it('opens what is clicked on the page, and sizes it by dragging its edge', async () => {
    localStorage.clear()
    const ss = JSON.parse(readFileSync('schema/sites/spiritseeds.json', 'utf8'))
    const store = localStore({ schema: ss })
    const doc = await store.create({ type: 'page', data: { title: 'Services', blocks: [
      { _id: 'intro', _type: 'contentSection', layout: 'centered', title: 'Welcome' },
      { _id: 'thai', _type: 'service', title: 'Thai Yoga' },
    ] } })
    const page = document.createElement('div')
    page.innerHTML = '<section data-eotm-edit="page:' + doc.slug + '" data-eotm-item="thai" data-eotm-label="Thai Yoga" data-eotm-size="width" data-eotm-min="30" data-eotm-max="100"><h2>Thai Yoga</h2></section>'
    document.body.append(page)
    const section = page.firstChild
    const box = (width) => () => ({ top: 100, left: 0, right: width, bottom: 300, width, height: 200 })
    section.getBoundingClientRect = box(500)
    page.getBoundingClientRect = box(1000)
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(<App schema={ss} store={store} bridge={createBridge()} auth={localAuth()} onClose={() => {}} />))
    await tick()

    await act(async () => section.querySelector('h2').dispatchEvent(new MouseEvent('pointerover', { bubbles: true })))
    await tick(20)
    const edit = byText(host, 'button.eotm-target-edit', 'Edit Thai Yoga')
    expect(edit).toBeTruthy()
    await act(async () => edit.click())
    await tick(20)
    // The document opens with the clicked section expanded.
    expect(host.querySelector('[data-eotm-item="thai"]').classList.contains('is-open')).toBe(true)
    expect(host.querySelector('[data-eotm-item="intro"]').classList.contains('is-open')).toBe(false)

    // Dragging the right edge 100px wider: 600 of 1000. Snapping (the default)
    // lands on seven twelfths; free sizing keeps 60%.
    const dragTo = async (x) => act(async () => {
      host.querySelector('button.eotm-target-size').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 500 }))
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: x }))
      window.dispatchEvent(new MouseEvent('pointerup', {}))
    })
    await dragTo(600)
    await tick(900)
    expect((await store.get(doc.id)).data.blocks[1].width).toBe(58)
    await act(async () => byText(host, 'button.eotm-target-snap', 'Snap').click())
    expect(byText(host, 'button.eotm-target-snap', 'Free')).toBeTruthy()
    await dragTo(600)
    await tick(900)
    expect((await store.get(doc.id)).data.blocks[1].width).toBe(60)
    localStorage.removeItem('eotm:snap')
    await act(async () => root.unmount())
    page.remove()
  })

  it('lets the owner design a section type and then place it on a page', async () => {
    localStorage.clear()
    const ss = JSON.parse(readFileSync('schema/sites/spiritseeds.json', 'utf8'))
    const store = localStore({ schema: ss })
    await store.create({ type: 'page', data: { title: 'Home', blocks: [] } })
    const bridge = createBridge()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(<App schema={ss} store={store} bridge={bridge} auth={localAuth()} onClose={() => {}} />))
    await tick()
    const type = async (el, text) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, text)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => byText(host, 'button.eotm-card', 'Your own types').click())
    await act(async () => byText(host, 'button', 'New section type').click())
    await type(host.querySelector('input[placeholder="e.g. Banner"]'), 'Banner')
    await type(host.querySelector('input[aria-label="Field name"]'), 'Message')
    await act(async () => byText(host, 'button', 'Save types').click())
    await tick(10)
    expect(bridge.schema.blocks.customBanner.fields[0]).toMatchObject({ name: 'message', kind: 'text', label: 'Message' })

    await act(async () => host.querySelector('button[aria-label="Back"]').click())
    await act(async () => byText(host, 'button.eotm-card', 'Pages').click())
    await tick()
    await act(async () => byText(host, 'button.eotm-doc-open', 'Home').click())
    await tick(10)
    expect(byText(host, '.eotm-palette button', 'Banner')).toBeTruthy()
    await act(async () => root.unmount())
  })
})
