// Image pairs: the same piece photographed under each of a `photos` field's
// `indexes` (StoryShaped's Light and Dark). A field keeps its photos in one
// list, and the nth photo of one index pairs with the nth of the other
// (SCHEMA.md, field kinds), so every change here keeps the other pairs
// together. Pure functions over plain data; the Images view (Images.jsx) reads
// and writes documents with them.

// Where a paired `photos` field sits in a document: [{ field }] steps, with
// `id` when the step is a row or section of a list or blocks field.
// Returns [{ path, field, where }], `where` naming the section for people.
export function pairedFields(schema, typeName, data) {
  const out = []
  const walk = (fields, value, path, where) => {
    for (const f of fields ?? []) {
      const v = value?.[f.name]
      if (f.kind === 'photos' && f.indexes?.length === 2) out.push({ path: [...path, { field: f.name }], field: f, where })
      else if (f.kind === 'group') walk(f.fields, v, [...path, { field: f.name }], where)
      else if (f.kind === 'list' || f.kind === 'blocks') {
        for (const item of Array.isArray(v) ? v : []) {
          if (!item?._id) continue
          const sub = f.kind === 'blocks' ? schema.blocks?.[item._type]?.fields : f.fields
          const label = item.heading || item.title || item.label || schema.blocks?.[item._type]?.label || where
          walk(sub, item, [...path, { field: f.name, id: item._id }], label)
        }
      }
    }
  }
  walk(schema.types[typeName]?.fields, data, [], null)
  return out
}

// Does a type hold paired photos anywhere, directly or in a section it allows?
export function holdsPairs(schema, typeName) {
  const seen = new Set()
  const has = (fields) => (fields ?? []).some((f) => {
    if (f.kind === 'photos' && f.indexes?.length === 2) return true
    if (f.kind === 'group' || f.kind === 'list') return has(f.fields)
    if (f.kind === 'blocks') return (f.of ?? []).some((b) => !seen.has(b) && (seen.add(b), has(schema.blocks?.[b]?.fields)))
    return false
  })
  return has(schema.types[typeName]?.fields)
}

export function getAt(data, path) {
  let v = data
  for (const step of path) {
    v = v?.[step.field]
    if (step.id) v = Array.isArray(v) ? v.find((x) => x?._id === step.id) : undefined
  }
  return v
}

// A copy of `data` with the value at `path` replaced by fn(old).
export function updateAt(data, path, fn) {
  if (!path.length) return fn(data)
  const [step, ...rest] = path
  const cur = data?.[step.field]
  if (!step.id) return { ...data, [step.field]: updateAt(cur, rest, fn) }
  if (!Array.isArray(cur) || !cur.some((x) => x?._id === step.id)) throw new Error('That section is no longer on the page.')
  return { ...data, [step.field]: cur.map((x) => (x?._id === step.id ? updateAt(x, rest, fn) : x)) }
}

// Positions in the list of the photos under one index, in order.
const positions = (photos, ix) => photos.flatMap((p, i) => (p?.index === ix ? [i] : []))

// The pairs of one field: [{ slots: { [ix]: { photo, at } | null } }], then a
// row per photo given no index yet ({ untagged: { photo, at } }).
export function pairsOf(photos, indexes) {
  const list = Array.isArray(photos) ? photos : []
  const by = Object.fromEntries(indexes.map((ix) => [ix, positions(list, ix)]))
  const n = Math.max(0, ...indexes.map((ix) => by[ix].length))
  const rows = []
  for (let k = 0; k < n; k++) {
    rows.push({ slots: Object.fromEntries(indexes.map((ix) => {
      const at = by[ix][k]
      return [ix, at == null ? null : { photo: list[at], at }]
    })) })
  }
  list.forEach((p, at) => { if (!indexes.includes(p?.index)) rows.push({ untagged: { photo: p, at } }) })
  return rows
}

const other = (indexes, ix) => indexes.find((x) => x !== ix)

// Put `photo` under `ix` in pair k. A photo already there is replaced, keeping
// what the owner wrote about it (alt text, turn, fade). An empty slot is filled
// by adding the photo as the next one under `ix`; pair k first trades places
// with the first pair still missing that index, so it is pair k that gains it.
export function setSlot(photos, indexes, k, ix, photo, { maxItems } = {}) {
  const list = [...(photos ?? [])]
  const mine = positions(list, ix)
  if (mine[k] != null) {
    const old = list[mine[k]]
    list[mine[k]] = { ...old, ...photo, alt: old.alt ?? photo.alt ?? '', index: ix }
    return list
  }
  if (maxItems && list.length >= maxItems) throw new Error(`This holds at most ${maxItems} photos. Remove one first.`)
  const theirs = positions(list, other(indexes, ix))
  const p = mine.length // the pair the next photo under `ix` joins
  if (k !== p && theirs[k] != null && theirs[p] != null) {
    const a = theirs[k]
    const b = theirs[p]
    ;[list[a], list[b]] = [list[b], list[a]]
  }
  list.push({ ...photo, index: ix })
  return list
}

// Take the photo under `ix` out of pair k. The other photo of that pair moves
// behind the rest of its index, so every later pair stays together.
export function removeSlot(photos, indexes, k, ix) {
  const list = [...(photos ?? [])]
  const at = positions(list, ix)[k]
  if (at == null) return list
  const partnerAt = positions(list, other(indexes, ix))[k]
  const partner = partnerAt == null ? null : list[partnerAt]
  const out = list.filter((_, i) => i !== at && i !== partnerAt)
  if (partner) out.push(partner)
  return out
}

// Take a whole pair out.
export function removePair(photos, indexes, k) {
  const list = photos ?? []
  const drop = new Set(indexes.map((ix) => positions(list, ix)[k]).filter((i) => i != null))
  return list.filter((_, i) => !drop.has(i))
}

// Change what is written about one photo, by its place in the list.
export function patchPhoto(photos, at, patch) {
  return (photos ?? []).map((p, i) => (i === at ? { ...p, ...patch } : p))
}

// Give a photo with no index one: it joins the first pair missing that index.
export function tagPhoto(photos, indexes, at, ix) {
  const list = [...(photos ?? [])]
  const [photo] = list.splice(at, 1)
  const k = positions(list, ix).length
  return setSlot(list, indexes, k, ix, { ...photo, index: ix })
}

// How many pairs lack a photo under some index.
export const incomplete = (rows) => rows.filter((r) => r.untagged || Object.values(r.slots).some((s) => !s)).length
