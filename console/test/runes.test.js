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
