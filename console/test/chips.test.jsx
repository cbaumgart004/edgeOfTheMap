// @vitest-environment jsdom
// A list of one text each (a listing's tags) edits inline as chips.
import { describe, it, expect, beforeAll } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { FieldList } from '../src/Fields.jsx'

const tags = { name: 'tags', kind: 'list', label: 'Tags', maxItems: 3, itemLabel: 'tag',
  fields: [{ name: 'tag', kind: 'text', label: 'Tag', maxLength: 20, pattern: "[\\p{L}\\p{N} \\-'™©®]+", patternHelp: 'letters and numbers' }] }
const schema = { types: {}, blocks: {} }

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true })

const type = (el, text) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, text)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
const enter = (el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

describe('tags as chips', () => {
  it('adds on Enter, refuses a bad or repeated tag, renames in place, removes with ×, and stops at the limit', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    let value = { tags: [{ _id: 'a', tag: 'vaseline glass' }] }
    const r = createRoot(root)
    const draw = () => r.render(<FieldList fields={[tags]} value={value} ctx={{ schema, store: {}, notify: () => {} }} onChange={(v) => { value = v; draw() }} />)
    await act(async () => draw())
    const names = () => [...root.querySelectorAll('.eotm-chip-name')].map((b) => b.textContent)
    expect(names()).toEqual(['vaseline glass'])
    expect(root.querySelector('.eotm-repeater')).toBeNull()

    const add = () => root.querySelector('.eotm-chip-add')
    await act(async () => { type(add(), 'uranium') })
    await act(async () => { enter(add()) })
    expect(names()).toEqual(['vaseline glass', 'uranium'])
    expect(value.tags[1].tag).toBe('uranium')
    expect(add().value).toBe('')

    await act(async () => { type(add(), 'UV glow!') })
    await act(async () => { enter(add()) })
    expect(root.textContent).toContain('Use letters and numbers.')
    await act(async () => { type(add(), 'Uranium') })
    await act(async () => { enter(add()) })
    expect(root.textContent).toContain('Already there.')
    expect(value.tags).toHaveLength(2)

    await act(async () => root.querySelectorAll('.eotm-chip-name')[1].click())
    const edit = root.querySelector('.eotm-chip-edit')
    edit.value = 'uranium glass'
    await act(async () => { enter(edit) })
    expect(names()).toEqual(['vaseline glass', 'uranium glass'])

    await act(async () => { type(add(), 'glow') })
    await act(async () => { enter(add()) })
    expect(add()).toBeNull() // three of three
    await act(async () => root.querySelector('[aria-label="Remove vaseline glass"]').click())
    expect(names()).toEqual(['uranium glass', 'glow'])
    expect(add()).not.toBeNull()
    await act(async () => r.unmount())
  })
})
