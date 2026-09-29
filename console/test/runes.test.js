import { describe, it, expect } from 'vitest'
import { AETTIR } from '../src/runes.js'

describe('Elder Futhark glossary', () => {
  it('holds 24 distinct runes in three ættir of eight, all from the Runic block', () => {
    expect(AETTIR.map((a) => a.runes.length)).toEqual([8, 8, 8])
    const glyphs = AETTIR.flatMap((a) => a.runes.map((r) => r.glyph))
    expect(new Set(glyphs).size).toBe(24)
    for (const g of glyphs) expect(g.codePointAt(0)).toBeGreaterThanOrEqual(0x16a0)
    expect(glyphs.join('')).toBe('ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛈᛇᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ') // Kylver order
  })
})

describe('campfire scene', async () => {
  const { campfire } = await import('../src/campfire.js')
  it('gives each pane its own gradient ids and the same sky on every load', () => {
    const left = campfire(1)
    const right = campfire(13)
    const ids = (html) => [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])
    expect(ids(left).some((i) => ids(right).includes(i))).toBe(false)
    expect(campfire(1)).toBe(left)
    for (const ref of left.matchAll(/url\(#([^)]+)\)/g)) expect(ids(left)).toContain(ref[1])
  })
})
