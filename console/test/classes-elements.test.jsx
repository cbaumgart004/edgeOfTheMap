// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import App from '../src/App.jsx'
import { createBridge } from '../src/bridge.js'
import { localStore } from '../src/store.js'
import { localAuth } from '../src/auth.js'
import { mergeCustom } from '../schema/custom.js'

const shipped = JSON.parse(readFileSync('schema/sites/spiritseeds.json', 'utf8'))
const schema = mergeCustom(shipped, null) // as the API's boot answer is
const tick = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)))
const byText = (root, sel, text) => [...root.querySelectorAll(sel)].find((el) => el.textContent.includes(text))
// A heading on the home list, folded open (App.jsx, Home).
const unfold = (root, label) => act(async () => {
  const d = [...root.querySelectorAll('details.eotm-home-fold')].find((x) => x.querySelector('.eotm-fold-label').textContent === label)
  if (!d.open) { d.open = true; d.dispatchEvent(new Event('toggle')) }
})
const rect = (el, r) => { el.getBoundingClientRect = () => ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top }) }
const settle = async (store, id, pick, has) => {
  for (let i = 0; i < 40; i++) { const v = pick((await store.get(id)).data); if (has(v)) return v; await tick(100) }
  return pick((await store.get(id)).data)
}

const roots = []
afterEach(async () => { await act(async () => roots.splice(0).forEach((r) => r.unmount())) })

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  document.body.innerHTML = ''
  localStorage.clear()
  sessionStorage.clear()
  window.matchMedia = (q) => ({ matches: q.includes('min-width'), media: q, addEventListener() {}, removeEventListener() {} })
})

async function mount(data) {
  const store = localStore({ schema: shipped })
  const doc = data ? await store.create({ type: 'page', data }) : null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  await act(async () => root.render(<App schema={schema} store={store} bridge={createBridge()} auth={localAuth()} onClose={() => {}} />))
  await tick()
  return { store, doc, host }
}

describe('Classes', () => {
  it('lists the site’s own, buttons first, and takes a class of the owner’s', async () => {
    expect(schema.types.classes.fields.map((f) => f.label)).toContain('Buttons')
    const { host, store } = await mount()
    await store.create({ type: 'classes', data: {} })
    await unfold(host, 'Classes')
    await tick(20)
    // Site, then this page; each class has a Style that opens its look.
    expect(byText(host, 'summary', 'Whole site')).toBeTruthy()
    await act(async () => byText(host, '.eotm-class-row', 'Buttons').querySelector('button.is-quiet').click())
    await tick(20)
    expect(byText(host, '.eotm-field', 'Buttons')).toBeTruthy()
    const input = host.querySelector('input[aria-label="Class name"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Gold call-out')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => byText(host, 'button', 'Add class').click())
    await tick(20)
    expect(byText(host, '.eotm-field', 'Gold call-out')).toBeTruthy()
  })
})

describe('Classes on the home list', () => {
  it('nests the open page’s classes as they sit, and + adds an object with one to a section there', async () => {
    const { store, doc, host } = await mount({ title: 'Home', blocks: [{ _id: 's1', _type: 'contentSection', title: 'Hello' }] })
    const page = document.createElement('main')
    page.innerHTML = `<section class="panel" data-eotm-edit="page:${doc.id}" data-eotm-item="s1"><div class="card"><a class="btn">Go</a></div></section>`
    document.body.append(page)
    await unfold(host, 'Classes')
    await tick(400)
    const here = byText(host, 'details.eotm-fold', 'This page')
    const panels = byText(here, '.eotm-class-tree[data-depth="0"] > li', 'Panels')
    expect(byText(panels, '.eotm-class-tree[data-depth="1"] > li', 'Cards').textContent).toContain('Buttons')

    await act(async () => byText(here, '.eotm-class-row', 'Buttons').querySelector('button[aria-label="Add an object with Buttons"]').click())
    await tick(20)
    const dialog = host.querySelector('[role="dialog"]')
    expect(dialog.textContent).toContain('Add an object with this class?')
    expect(dialog.querySelector('.eotm-class-sample').innerHTML).toContain('class="btn"')
    const [pageSel, into, kind, klass] = dialog.querySelectorAll('select')
    expect(pageSel.selectedOptions[0].textContent).toContain('(this page)')
    expect(into.value).toBe('s1')
    expect(into.selectedOptions[0].parentElement.label).toBe('Panels')
    expect(kind.value).toBe('button')
    expect(klass.value).toBe('btn')
    await act(async () => dialog.querySelector('.eotm-class-add .is-primary').click())
    const els = await settle(store, doc.id, (d) => d.blocks[0]._elements, (v) => v?.length)
    expect(els[0]).toMatchObject({ kind: 'button', class: 'btn' })
  })
})

describe('A class’s card', () => {
  it('draws one from its selector when none is on the page, adds into a card where its class sits, and makes a class from it', async () => {
    const { store, doc, host } = await mount({ title: 'Home', blocks: [{ _id: 's1', _type: 'contentSection', layout: 'cardGrid', title: 'Offerings', cards: [{ _id: 'c1', title: 'Reiki' }, { _id: 'c2', title: 'Yoga' }] }, { _id: 's2', _type: 'contentSection', title: 'Hello' }] })
    const page = document.createElement('main')
    page.innerHTML = `<section data-eotm-edit="page:${doc.id}" data-eotm-item="s1"><div class="card" data-eotm-holds="c1"><a class="btn">Go</a></div><div class="card" data-eotm-holds="c2"></div></section>`
      + `<section data-eotm-edit="page:${doc.id}" data-eotm-item="s2"></section>`
    document.body.append(page)
    await unfold(host, 'Classes')
    await tick(400)
    const site = byText(host, 'details.eotm-fold', 'Whole site')

    // Section headings: none drawn with it here, so built from ".section h2".
    await act(async () => byText(site, 'button.eotm-class-name', 'Section headings').click())
    let card = host.querySelector('.eotm-class-card')
    expect(card.querySelector('.eotm-class-sample').innerHTML).toBe('<div class="section"><h2>Section headings</h2></div>')
    expect(byText(card, 'button', 'New class from this')).toBeUndefined()
    await act(async () => byText(card, 'button', '✕').click())

    // Buttons: the one on the page; Add one offers only where buttons are.
    await act(async () => byText(site, 'button.eotm-class-name', 'Buttons').click())
    card = host.querySelector('.eotm-class-card')
    expect(card.querySelector('.eotm-class-sample').innerHTML).toBe('<a class="btn">Go</a>')
    await act(async () => byText(card, 'button', '+ Add one').click())
    await tick(20)
    const [, into] = card.querySelectorAll('select')
    expect([...into.options].map((o) => o.value)).toEqual(['s1', 'c1'])
    expect(into.value).toBe('s1')
    expect(into.options[1].parentElement.label).toBe('Offerings › Cards')
    const only = card.querySelector('.eotm-check input')
    await act(async () => only.click())
    expect([...into.options].map((o) => o.value)).toEqual(['s1', 's2', 'c1', 'c2'])
    await act(async () => { into.value = 'c2'; into.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => card.querySelector('.eotm-class-add .is-primary').click())
    const els = await settle(store, doc.id, (d) => d.blocks[0].cards[1]._elements, (v) => v?.length)
    expect(els[0]).toMatchObject({ kind: 'button', class: 'btn' })
  })

  it('a class made from another carries both classes and nests under it', async () => {
    const custom = { classes: [{ name: 'outline', label: 'Outline buttons', base: 'btn' }] }
    const made = mergeCustom(shipped, custom)
    const { classNameOf } = await import('../schema/elements.js')
    expect(classNameOf(made, 'outline')).toBe('btn c-outline')
    const { checkCustom } = await import('../schema/custom.js')
    expect(checkCustom(shipped, { classes: [{ name: 'x', label: 'X', base: 'sectionHeading' }] }).join()).toContain('not a class it can be made from')
    expect(checkCustom(shipped, custom)).toEqual([])
    const { sampleFromSelector } = await import('../src/ClassTree.jsx')
    const { classesOf, lineage } = await import('../schema/classes.js')
    const list = classesOf(made)
    expect(lineage(list, list.find((c) => c.name === 'outline')).map((c) => c.name)).toEqual(['btn', 'outline'])
    expect(sampleFromSelector(lineage(list, list.find((c) => c.name === 'outline')), 'Outline')).toBe('<a class="btn c-outline">Outline</a>')
  })
})

describe('Elements from Arrange', () => {
  it('adds a text to a Free section, placed and kept, and copies one of the site’s parts as an element', async () => {
    const { store, doc } = await mount({ title: 'Home', sections: [{ _id: 's1', _type: 'contentSection', layout: 'centered', title: 'Hello', _layout: { mode: 'free', height: 40, parts: { title: { x: 10, y: 5, w: 50 } } } }] })
    const page = document.createElement('main')
    page.innerHTML = `<section data-eotm-edit="page:${doc.id}" data-eotm-item="s1" data-eotm-frame="free"><h2 data-eotm-part="title" data-eotm-placed style="--x:10;--y:5;--w:50">Hello</h2></section>`
    document.body.append(page)
    const section = page.querySelector('section')
    rect(section, { left: 0, top: 0, width: 1000, height: 400 })
    rect(section.querySelector('h2'), { left: 100, top: 50, width: 500, height: 60 })
    await act(async () => document.body.querySelector('.eotm-editbox input').click())
    await act(async () => section.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })))
    await tick(20)
    await act(async () => document.querySelector('.eotm-arrange-panel [aria-label="Controls"]').click())
    await act(async () => byText(document.body, '.eotm-arrange-panel button', 'Text').click())
    const added = await settle(store, doc.id, (d) => d.sections[0], (s) => s._elements?.length === 1)
    const el = added._elements[0]
    expect(el).toMatchObject({ kind: 'text', text: 'New text', tag: 'p' })
    expect(added._layout.parts[el._id]).toMatchObject({ x: 30, w: 40 })

    // Select the heading and duplicate it: it becomes an element with its words.
    await act(async () => section.querySelector('h2').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 200, clientY: 60 })))
    await act(async () => window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })))
    await tick(20)
    await act(async () => document.querySelector('.eotm-arrange-panel [aria-label="Controls"]').click())
    await act(async () => byText(document.body, '.eotm-arrange-panel button', 'Duplicate').click())
    const copied = await settle(store, doc.id, (d) => d.sections[0], (s) => s._elements?.length === 2)
    expect(copied._elements[1]).toMatchObject({ kind: 'text', text: 'Hello', tag: 'h2' })
    expect(copied._layout.parts[copied._elements[1]._id]).toMatchObject({ x: 13, y: 8, w: 50 })
  })
})
