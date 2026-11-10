import { describe, expect, it } from 'vitest'
import { HI, LO, areaPath, curvePath, stepPath, yOf } from './geometry.ts'

describe('yOf', () => {
  it('maps the loudness range onto the height and clamps outside it', () => {
    expect(yOf(HI, 320)).toBe(0)
    expect(yOf(LO, 320)).toBe(320)
    expect(yOf(-16, 320)).toBe(160)
    expect(yOf(-70, 320)).toBe(320)
    expect(yOf(-2, 320)).toBe(0)
  })
})

describe('curvePath', () => {
  it('centres each value in its window', () => {
    expect(curvePath({ step: 1, window: 3, values: [-16, -8] }, 10, 1000, 320)).toBe('M150,160L250,0')
  })

  it('is empty without values', () => {
    expect(curvePath({ step: 1, window: 3, values: [] }, 10, 1000, 320)).toBe('')
  })

  it('closes the area down to the floor', () => {
    expect(areaPath({ step: 1, window: 3, values: [-16, -8] }, 10, 1000, 320)).toBe('M150,160L250,0L250,320L150,320Z')
  })
})

describe('stepPath', () => {
  it('draws one horizontal step per section with a target', () => {
    const sections = [{ start: 0, end: 5 }, { start: 5, end: 8 }, { start: 8, end: 10 }]
    expect(stepPath(sections, [-16, null, -8], 10, 1000, 320)).toBe('M0,160H500M800,0H1000')
  })
})
