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

  it('says who is signed in, and Sign out ends it on the admin page too', async () => {
    localStorage.clear()
    const host = document.createElement('div')
    document.body.append(host)
    const calls = []
    const auth = { ...localAuth(), signOut: async () => calls.push('signOut'), redirect: (o) => calls.push(o) }
    await act(async () => createRoot(host).render(<App schema={schema} store={localStore({ schema })} bridge={createBridge()} auth={auth} onClose={() => {}} />))
    await tick()
    expect(host.querySelector('.eotm-who').textContent).toContain('Signed in as owner@example.test')
    await act(async () => byText(host, '.eotm-who button', 'Sign out').click())
    expect(calls).toEqual(['signOut', { signout: true }])
  })

  it('the minimised editor can be dragged anywhere, remembered, and a tap opens it', async () => {
    localStorage.clear()
    const host = document.createElement('div')
    document.body.append(host)
    await act(async () => createRoot(host).render(<App schema={schema} store={localStore({ schema })} bridge={createBridge()} auth={localAuth()} onClose={() => {}} />))
    await tick()
    const sheet = host.querySelector('.eotm-sheet')
    await act(async () => host.querySelector('.eotm-title').click())
    expect(sheet.classList.contains('is-bar')).toBe(true)
    const grip = host.querySelector('.eotm-grip')
    const fire = (type, x, y) => grip.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }))
    await act(async () => { fire('pointerdown', 10, 10); fire('pointermove', 210, 110); fire('pointerup', 210, 110) })
    expect(sheet.classList.contains('is-floating')).toBe(true)
    expect(sheet.style.left).toBe('200px')
    expect(JSON.parse(localStorage.getItem('eotm:bar-pos'))).toEqual({ x: 200, y: 100 })
    await act(async () => { fire('pointerdown', 210, 110); fire('pointerup', 211, 111) })
    expect(sheet.classList.contains('is-half')).toBe(true)
  })

  it('links home to the dashboard and labels the preview toggle', async () => {
    localStorage.clear()
    const host = document.createElement('div')
    document.body.append(host)
    await act(async () => createRoot(host).render(<App schema={schema} store={localStore({ schema })} bridge={createBridge()} auth={localAuth()}
      dashboard="https://admin.theedgeofthemap.com" onClose={() => {}} />))
    await tick()
    expect(host.querySelector('a[aria-label="Back to your dashboard"]').href).toBe('https://admin.theedgeofthemap.com/')

    const preview = byText(host, 'button', 'Preview current changes')
    await act(async () => preview.click())
    expect(preview.getAttribute('aria-pressed')).toBe('true')
    expect(preview.textContent).toBe('Back to editing')
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
    // More than six top-level types show as a dropdown on a phone, else cards.
    const pick = host.querySelector('#eotm-type-pick')
    await act(async () => {
      if (!pick) return byText(host, 'button.eotm-card', 'Page layouts').click()
      pick.value = 'pageLayout'
      pick.dispatchEvent(new Event('change', { bubbles: true }))
    })
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

  it('opens what is clicked on the page in the pane, that section expanded and the rest folded', async () => {
    localStorage.clear()
    const ss = JSON.parse(readFileSync('schema/sites/spiritseeds.json', 'utf8'))
    const store = localStore({ schema: ss })
    const doc = await store.create({ type: 'page', data: { title: 'Services', blocks: [
      { _id: 'intro', _type: 'contentSection', layout: 'centered', title: 'Welcome' },
      { _id: 'thai', _type: 'service', title: 'Thai Yoga' },
    ] } })
    const page = document.createElement('div')
    page.innerHTML = '<section data-eotm-edit="page:' + doc.slug + '" data-eotm-item="thai" data-eotm-label="Thai Yoga"><h2>Thai Yoga</h2></section>'
    document.body.append(page)
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(<App schema={ss} store={store} bridge={createBridge()} auth={localAuth()} onClose={() => {}} />))
    await tick()
    await act(async () => page.querySelector('h2').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })))
    await tick(50)
    expect(host.querySelector('[data-eotm-item="thai"]').classList.contains('is-open')).toBe(true)
    expect(host.querySelector('[data-eotm-item="intro"]').classList.contains('is-open')).toBe(false)
    await act(async () => root.unmount())
    page.remove()
  })

  it('a double-click on page text types it in place and opens that field; the pane and the page agree', async () => {
    localStorage.clear()
    const ss = JSON.parse(readFileSync('schema/sites/spiritseeds.json', 'utf8'))
    const store = localStore({ schema: ss })
    const doc = await store.create({ type: 'page', data: { title: 'Home', blocks: [
      { _id: 'intro', _type: 'contentSection', layout: 'centered', title: 'Welcome' },
      { _id: 'vals', _type: 'contentSection', layout: 'values', title: 'Our Core Values' },
    ] } })
    const page = document.createElement('div')
    page.innerHTML = '<section data-eotm-edit="page:' + doc.slug + '" data-eotm-item="vals"><a href="#away"><h2 data-eotm-text="title">Our Core Values</h2></a><p>plain</p></section>'
    document.body.append(page)
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(<App schema={ss} store={store} bridge={createBridge()} auth={localAuth()} onClose={() => {}} />))
    await tick()

    // A click on the heading does not follow its link; a double-click types it
    // in place, its section open in the pane.
    const h2 = page.querySelector('h2')
    const clicked = new MouseEvent('click', { bubbles: true, cancelable: true })
    await act(async () => h2.dispatchEvent(clicked))
    expect(clicked.defaultPrevented).toBe(true)
    await act(async () => h2.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })))
    await tick(300)
    expect(h2.contentEditable).toBe('plaintext-only')
    expect(host.querySelector('[data-eotm-item="vals"]').classList.contains('is-open')).toBe(true)
    const field = host.querySelector('[data-eotm-item="vals"] [data-eotm-field="title"] input')
    expect(field.value).toBe('Our Core Values')

    // Typing on the page reaches the pane.
    h2.textContent = 'Values'
    await act(async () => h2.dispatchEvent(new Event('input', { bubbles: true })))
    await tick()
    expect(field.value).toBe('Values')
    await act(async () => h2.dispatchEvent(new Event('blur')))

    // A click elsewhere in the section opens it too.
    await act(async () => byText(host, 'button', 'Back')?.click())
    await act(async () => page.querySelector('p').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })))
    await tick(50)
    expect(host.querySelector('[data-eotm-item="vals"]')).toBeTruthy()
    await act(async () => root.unmount())
    page.remove()
  })

  it('lists a page\'s sections with what is not live, opens one there, and shows Page › Section', async () => {
    localStorage.clear()
    const ss = JSON.parse(readFileSync('schema/sites/spiritseeds.json', 'utf8'))
    const store = localStore({ schema: ss })
    const doc = await store.create({ type: 'page', data: { title: 'Home', blocks: [
      { _id: 'intro', _type: 'contentSection', layout: 'centered', title: 'Welcome' },
      { _id: 'vals', _type: 'contentSection', layout: 'values', title: 'Our Core Values' },
    ] } })
    const live = await store.publish(doc.id, doc.version)
    // One section edited and one added since: both marked, the third not.
    await store.save(doc.id, { baseVersion: live.version, data: { ...live.data, blocks: [
      { _id: 'intro', _type: 'contentSection', layout: 'centered', title: 'Welcome' },
      { _id: 'vals', _type: 'contentSection', layout: 'values', title: 'Values' },
      { _id: 'more', _type: 'contentSection', layout: 'centered', title: 'More' },
    ] } })
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(<App schema={ss} store={store} bridge={createBridge()} auth={localAuth()} onClose={() => {}} />))
    await tick()

    // Home: Site settings sits under Design, beside the templates.
    const head = byText(host, '.eotm-menu-head', 'Design')
    expect(head).toBeTruthy()
    expect(byText(host, 'ul.eotm-types:last-of-type button.eotm-card', 'Site settings')).toBeTruthy()
    expect(byText(host, 'button.eotm-card', 'Section templates')).toBeTruthy()

    await act(async () => byText(host, 'button.eotm-card', 'Pages').click())
    await tick(10)
    await act(async () => host.querySelector('button.eotm-fold-btn').click())
    const rows = [...host.querySelectorAll('.eotm-section-open')].map((b) => b.textContent)
    expect(rows).toEqual(['Content section: Welcome', 'Content section: ValuesNot live', 'Content section: MoreNew, not live'])

    await act(async () => byText(host, '.eotm-section-open', 'Values').click())
    await tick(20)
    expect(host.querySelector('[data-eotm-item="vals"]').classList.contains('is-open')).toBe(true)
    expect(host.querySelector('.eotm-trail').textContent).toBe('Home › Content section: Values')
    expect(host.querySelector('[data-eotm-item="vals"] .eotm-badge').textContent).toBe('Not live')
    expect(byText(host, '[data-eotm-item="vals"] button', 'Save as custom template')).toBeTruthy()
    expect(host.querySelector('[data-eotm-item="intro"] .eotm-badge')).toBeNull()
    await act(async () => root.unmount())
  })

  it('tucks the minimised editor against an edge, leaving a tab that brings it back', async () => {
    localStorage.clear()
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(<App schema={schema} store={localStore({ schema })} bridge={createBridge()} auth={localAuth()} onClose={() => {}} />))
    await tick()
    await act(async () => host.querySelector('.eotm-title').click())
    await act(async () => host.querySelector('button[aria-label="Tuck the editor to the right edge"]').click())
    expect(host.querySelector('.eotm-sheet')).toBeNull()
    const tab = host.querySelector('button.eotm-tab.is-right')
    expect(tab).toBeTruthy()
    expect(localStorage.getItem('eotm:bar-tuck')).toBe('right')
    await act(async () => tab.click())
    expect(host.querySelector('.eotm-sheet.is-bar')).toBeTruthy()
    expect(localStorage.getItem('eotm:bar-tuck')).toBeNull()
    await act(async () => root.unmount())
  })

  it('drags the tucked tab up and down its edge without bringing the bar back', async () => {
    localStorage.clear()
    localStorage.setItem('eotm:bar-tuck', 'left')
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    await act(async () => root.render(<App schema={schema} store={localStore({ schema })} bridge={createBridge()} auth={localAuth()} onClose={() => {}} />))
    await tick()
    await act(async () => host.querySelector('.eotm-title').click())
    const tab = host.querySelector('button.eotm-tab.is-left')
    expect(tab.querySelector('svg')).toBeTruthy()
    const fire = (type, clientX, clientY) => tab.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, clientY }))
    await act(async () => { fire('pointerdown', 10, 100); fire('pointermove', 60, 300); fire('pointerup', 60, 300) })
    expect(tab.style.top).toBe('200px')
    expect(tab.style.left).toBe('')
    expect(localStorage.getItem('eotm:tab-y')).toBe('200')
    await act(async () => tab.click())
    expect(host.querySelector('button.eotm-tab')).toBeTruthy()
    await act(async () => host.querySelector('button.eotm-tab').click())
    expect(host.querySelector('.eotm-sheet.is-bar')).toBeTruthy()
    await act(async () => root.unmount())
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

    await act(async () => byText(host, 'button.eotm-card', 'Types and names').click())
    await act(async () => byText(host, 'button', 'New section type').click())
    await type(host.querySelector('input[placeholder="e.g. Banner"]'), 'Banner')
    await type(host.querySelector('input[aria-label="Field name"]'), 'Message')
    await act(async () => byText(host, 'button.is-primary', 'Save').click())
    await tick(10)
    expect(bridge.schema.blocks.customBanner.fields[0]).toMatchObject({ name: 'message', kind: 'text', label: 'Message' })

    // Rename a built-in section; the page's palette uses the new name, with a sketch.
    await act(async () => byText(host, '.eotm-item-title', 'Service').click())
    await type(host.querySelector('input[aria-label="Name of Service / offering"]'), 'Treatment')
    await act(async () => byText(host, 'button.is-primary', 'Save').click())
    await tick(10)
    expect(bridge.schema.blocks.service.label).toBe('Treatment')

    await act(async () => host.querySelector('button[aria-label="Back"]').click())
    await act(async () => byText(host, 'button.eotm-card', 'Pages').click())
    await tick()
    await act(async () => byText(host, 'button.eotm-doc-open', 'Home').click())
    await tick(10)
    expect(byText(host, '.eotm-palette button', 'Banner')).toBeTruthy()
    expect(byText(host, '.eotm-palette button', 'Treatment')).toBeTruthy()
    expect(byText(host, '.eotm-palette button', 'Treatment').querySelector('.eotm-sketch-p')).toBeTruthy()
    await act(async () => root.unmount())
  })
})
