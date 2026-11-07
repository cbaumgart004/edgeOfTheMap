import { describe, it, expect } from 'vitest'
import { createMedia, createMemoryMediaRepo, cleanFolder, nameFromFile, usesIn } from '../core/media.js'

const make = (used = []) => createMedia({ repo: createMemoryMediaRepo(), uses: async (src) => used.filter((u) => u.src === src) })

describe('media library', () => {
  it('cleans folder paths and names files after the file', () => {
    expect(cleanFolder(' Retreats / 2026/ ')).toBe('Retreats/2026')
    expect(() => cleanFolder('a/../b')).toThrow()
    expect(nameFromFile('IMG_2041.HEIC')).toBe('IMG_2041')
  })

  it('adds, lists with ancestor folders and totals bytes; an src kept twice is one file', async () => {
    const m = make()
    const a = await m.add({ src: 'https://x/uploads/a.jpg', name: 'A', folder: 'Retreats/2026', bytes: 100 })
    const again = await m.add({ src: 'https://x/uploads/a.jpg', name: 'Other' })
    expect(again.id).toBe(a.id)
    const { items, folders, bytes } = await m.list()
    expect(items).toHaveLength(1)
    expect(folders).toEqual(['Retreats', 'Retreats/2026'])
    expect(bytes).toBe(100)
  })

  it('renames and moves a file without touching its address', async () => {
    const m = make()
    const a = await m.add({ src: 's1', name: 'A' })
    const b = await m.update(a.id, { name: 'Sunrise', folder: 'Hikes' })
    expect(b).toMatchObject({ src: 's1', name: 'Sunrise', folder: 'Hikes' })
  })

  it('refuses to delete a file a page uses, naming the page', async () => {
    const m = make([{ src: 's1', id: 'd', type: 'page', slug: 'home', title: 'Home' }])
    const a = await m.add({ src: 's1', name: 'A' })
    await expect(m.remove(a.id)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('Home') })
    const b = await m.add({ src: 's2', name: 'B' })
    await m.remove(b.id)
    expect((await m.list()).items.map((i) => i.src)).toEqual(['s1'])
  })

  it('renames a folder with its subfolders and files; refuses into itself, onto another, or deleting a full one', async () => {
    const m = make()
    await m.addFolder('Retreats/Empty')
    const a = await m.add({ src: 's1', name: 'A', folder: 'Retreats/2026' })
    await expect(m.renameFolder('Retreats', 'Retreats/Inner')).rejects.toMatchObject({ status: 400 })
    await m.addFolder('Other')
    await expect(m.renameFolder('Retreats', 'Other')).rejects.toMatchObject({ status: 409 })
    await m.renameFolder('Retreats', 'Gatherings')
    const { items, folders } = await m.list()
    expect(items.find((i) => i.id === a.id).folder).toBe('Gatherings/2026')
    expect(folders).toEqual(['Gatherings', 'Gatherings/2026', 'Gatherings/Empty', 'Other'])
    await expect(m.removeFolder('Gatherings')).rejects.toMatchObject({ status: 409 })
    await m.removeFolder('Gatherings/Empty')
    expect((await m.list()).folders).not.toContain('Gatherings/Empty')
  })

  it('finds uses in draft or live data', () => {
    const docs = [{ id: 1, type: 'page', slug: 'a', data: { hero: { src: 'x.jpg' } } }, { id: 2, type: 'page', slug: 'b', data: {}, publishedData: { p: 'x.jpg' } }, { id: 3, type: 'page', slug: 'c', data: {} }]
    expect(usesIn(docs, 'x.jpg').map((u) => u.slug)).toEqual(['a', 'b'])
  })
})
