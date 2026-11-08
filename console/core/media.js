// The media library: every photo and clip a site has uploaded, named and kept
// in folders, so a mass upload has somewhere to land and anything uploaded once
// can be used again. One set of rules over two stores, as core/service.js is:
// api/media-pg.js on a site's own project, createMemoryMediaRepo below for the
// console's local mode and the tests.
//
// A file's address (src) never changes: naming it or moving it between folders
// changes only its record, so every page using it keeps working. Folders are
// paths ("Retreats/2026"); a folder exists while it is named in media_folders
// or holds a file. Deleting a file a page still uses is refused, naming the
// pages, because the page would show a broken picture.
//
// Repo contract:
//   listItems() -> [item]; getItem(id); insertItem(item) (an src already kept
//   returns that one); updateItem(id, { name, folder }); removeItem(id)
//   listFolders() -> [path]; insertFolder(path); removeFolder(path)
//   renameFolder(from, to): the folder, its subfolders and every file in them
// uses(src) -> [{ id, type, slug, title }] documents whose draft or live data names src
// usage() -> { live, draft }: every document's live and draft data as text (optional).
//   With it, list() marks each file `use`: 'live' (the site shows it), 'draft'
//   (only in unpublished edits) or 'none' (on no page, so safe to delete).

import { ServiceError } from './service.js'
import { newId } from '../schema/schema.js'

export const MAX_NAME = 120
const MAX_DEPTH = 6

// "Retreats / 2026/" -> "Retreats/2026"; "" is the top of the library.
export function cleanFolder(path) {
  const parts = String(path ?? '').split('/').map((p) => p.trim().replace(/\s+/g, ' ')).filter(Boolean)
  if (parts.length > MAX_DEPTH) throw new ServiceError(400, `Folders go ${MAX_DEPTH} deep at most.`)
  for (const p of parts) {
    if (p.length > 60) throw new ServiceError(400, 'A folder name is 60 characters at most.')
    if (p === '.' || p === '..' || /[\\<>:"|?*\u0000-\u001f]/.test(p)) throw new ServiceError(400, `"${p}" cannot be a folder name.`)
  }
  return parts.join('/')
}

export function cleanName(name) {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ')
  if (!n) throw new ServiceError(400, 'Give the file a name.')
  if (n.length > MAX_NAME) throw new ServiceError(400, `A name is ${MAX_NAME} characters at most.`)
  return n
}

// What a camera or phone calls a file, as a name: "IMG_2041.HEIC" -> "IMG_2041".
export const nameFromFile = (file) => String(file ?? '').replace(/\.[a-z0-9]{2,5}$/i, '').trim() || 'Untitled'

const inFolder = (folder, path) => folder === path || folder.startsWith(`${path}/`)
const ancestors = (path) => path.split('/').map((_, i, all) => all.slice(0, i + 1).join('/'))
const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : null)

export function createMedia({ repo, uses, usage, now = () => new Date().toISOString() }) {
  async function list() {
    const [items, named, text] = await Promise.all([repo.listItems(), repo.listFolders(), usage?.()])
    if (text) for (const i of items) i.use = text.live.includes(i.src) ? 'live' : text.draft.includes(i.src) ? 'draft' : 'none'
    const folders = new Set()
    for (const p of [...named, ...items.map((i) => i.folder)]) if (p) ancestors(p).forEach((a) => folders.add(a))
    const bytes = items.reduce((n, i) => n + (i.bytes ?? 0), 0)
    return {
      items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      folders: [...folders].sort((a, b) => a.localeCompare(b)),
      bytes,
    }
  }

  async function add(input = {}, user) {
    const src = String(input.src ?? '')
    if (!src) throw new ServiceError(400, 'A file needs its address.')
    return repo.insertItem({
      id: newId(), src, key: input.key ? String(input.key) : null,
      name: cleanName(input.name ?? 'Untitled'), folder: cleanFolder(input.folder),
      contentType: String(input.contentType ?? ''), bytes: num(input.bytes), width: num(input.width), height: num(input.height),
      createdAt: now(), createdBy: user?.id ?? null,
    })
  }

  async function update(id, patch = {}) {
    const item = await repo.getItem(id)
    if (!item) throw new ServiceError(404, 'That file is not in the library.')
    const next = {
      name: 'name' in patch ? cleanName(patch.name) : item.name,
      folder: 'folder' in patch ? cleanFolder(patch.folder) : item.folder,
    }
    return repo.updateItem(id, next)
  }

  async function remove(id) {
    const item = await repo.getItem(id)
    if (!item) throw new ServiceError(404, 'That file is not in the library.')
    const used = await uses(item.src)
    if (used.length) {
      const names = used.slice(0, 3).map((d) => d.title || d.slug).join(', ')
      throw new ServiceError(409, `"${item.name}" is used on ${names}${used.length > 3 ? ` and ${used.length - 3} more` : ''}. Take it off ${used.length > 1 ? 'those' : 'that page'} first.`, { uses: used })
    }
    await repo.removeItem(id)
    return item
  }

  async function addFolder(path) {
    const p = cleanFolder(path)
    if (!p) throw new ServiceError(400, 'Name the folder.')
    const { folders } = await list()
    if (folders.includes(p)) throw new ServiceError(409, `There is already a folder "${p}".`)
    await repo.insertFolder(p)
    return p
  }

  async function renameFolder(from, to) {
    const a = cleanFolder(from)
    const b = cleanFolder(to)
    if (!a || !b) throw new ServiceError(400, 'Name the folder.')
    if (a === b) return b
    if (inFolder(b, a)) throw new ServiceError(400, 'A folder cannot go inside itself.')
    const { folders } = await list()
    if (!folders.includes(a)) throw new ServiceError(404, `There is no folder "${a}".`)
    if (folders.includes(b)) throw new ServiceError(409, `There is already a folder "${b}".`)
    await repo.renameFolder(a, b)
    return b
  }

  async function removeFolder(path) {
    const p = cleanFolder(path)
    const { items, folders } = await list()
    const held = items.filter((i) => inFolder(i.folder, p)).length
    if (held) throw new ServiceError(409, `"${p}" still holds ${held} file${held > 1 ? 's' : ''}. Move or delete ${held > 1 ? 'them' : 'it'} first.`)
    for (const f of folders.filter((f) => inFolder(f, p))) await repo.removeFolder(f)
    return p
  }

  return { list, add, update, remove, addFolder, renameFolder, removeFolder }
}

// Memory store for local mode and the tests, persisted through load/persist.
export function createMemoryMediaRepo({ load = () => null, persist = () => {} } = {}) {
  const items = new Map((load()?.items ?? []).map((i) => [i.id, i]))
  const folders = new Set(load()?.folders ?? [])
  const commit = () => persist({ items: [...items.values()], folders: [...folders] })
  const copy = (v) => (v ? structuredClone(v) : null)
  const move = (path, a, b) => (path === a ? b : path.startsWith(`${a}/`) ? b + path.slice(a.length) : path)
  return {
    async listItems() { return [...items.values()].map(copy) },
    async getItem(id) { return copy(items.get(id)) },
    async insertItem(item) {
      const kept = [...items.values()].find((i) => i.src === item.src)
      if (kept) return copy(kept)
      items.set(item.id, copy(item)); commit(); return copy(item)
    },
    async updateItem(id, patch) { const next = { ...items.get(id), ...patch }; items.set(id, next); commit(); return copy(next) },
    async removeItem(id) { items.delete(id); commit() },
    async listFolders() { return [...folders] },
    async insertFolder(path) { folders.add(path); commit() },
    async removeFolder(path) { folders.delete(path); commit() },
    async renameFolder(a, b) {
      for (const f of [...folders]) { folders.delete(f); folders.add(move(f, a, b)) }
      for (const i of items.values()) i.folder = move(i.folder, a, b)
      commit()
    },
  }
}

// usage() from a list of documents (local mode).
export function usageIn(docs) {
  return { live: docs.map((d) => JSON.stringify(d.publishedData ?? null)).join(' '), draft: docs.map((d) => JSON.stringify(d.data ?? null)).join(' ') }
}

// Documents naming `src` in their draft or live data, from a list of them.
export function usesIn(docs, src, titleOf = (d) => d.data?.title) {
  return docs.filter((d) => JSON.stringify(d.data ?? null).includes(src) || JSON.stringify(d.publishedData ?? null).includes(src))
    .map((d) => ({ id: d.id, type: d.type, slug: d.slug, title: titleOf(d) ?? d.slug }))
}
