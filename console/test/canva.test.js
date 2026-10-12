import { describe, it, expect } from 'vitest'
import { familyOf, inferRoles } from '../src/canva.js'
import { kindOf } from '../src/fonts.js'
import { fsToPoints, pointsToFs, checkElements } from '../schema/elements.js'

describe('Canva import', () => {
  it('reads a PDF font name as a family', () => {
    expect(familyOf('AAAAAA+BDScript-Regular')).toEqual({ family: 'BD Script', bold: false, italic: false })
    expect(familyOf('BAAAAA+EuphoriaScript-Regular').family).toBe('Euphoria Script')
    expect(familyOf('CAAAAA+Farsan-Regular').family).toBe('Farsan')
    expect(familyOf('Montserrat-BoldItalic')).toEqual({ family: 'Montserrat', bold: true, italic: true })
    expect([kindOf('BD Script'), kindOf('Playfair Display'), kindOf('Farsan'), kindOf('Space Mono')]).toEqual(['script', 'serif', 'sans', 'mono'])
  })

  it('infers each piece: the largest words display, long ones body, a full picture the background', () => {
    const d = inferRoles({
      texts: [{ text: 'You are resilient', size: 152 }, { text: 'Your Integrative Healer;', size: 46.7 }, { text: 'Guiding you to Release mental, emotional and physical pain so you can find Ease', size: 31 }],
      images: [{ area: 1 }, { area: 0.25 }, { area: 0.01 }],
    })
    expect(d.texts.map((t) => [t.role, t.tag])).toEqual([['display', 'h2'], ['heading', 'h3'], ['body', 'p']])
    expect(d.images.map((i) => i.role)).toEqual(['background', 'photo', 'decoration'])
  })

  it('keeps text sizes in points at the design’s width, both ways', () => {
    expect(pointsToFs(46.7, 1230)).toBeCloseTo(94.9, 1) // 3.8% of the width, 100 being 4%
    expect(fsToPoints(94.9, 1230)).toBeCloseTo(46.7, 1)
    expect(fsToPoints(undefined, 1000)).toBe(40)
  })

  it('checks a design: its width, and no design inside a design', () => {
    const errors = []
    const check = () => {}
    checkElements([
      { _id: 'd1', kind: 'design', label: 'Canva import: x', width: 1230, _elements: [{ _id: 't1', kind: 'text', text: 'Hi' }] },
      { _id: 'd2', kind: 'design', width: 0, _elements: [{ _id: 'd3', kind: 'design', width: 10 }] },
    ], '_elements', {}, errors, check)
    expect(errors).toEqual(['_elements[1].width: the page\'s width in points', '_elements[1]: a design holds no design'])
  })
})
