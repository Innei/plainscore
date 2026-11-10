import { describe, expect, it } from 'vitest'
import { HI, LO, areaPath, curvePath, lufsAt, stepPath, stepTarget, yOf } from './geometry.ts'

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

describe('lufsAt', () => {
  it('inverts yOf at half steps', () => {
    for (const v of [-10, -13.5, -18, -22]) expect(lufsAt(yOf(v, 360), 360)).toBe(v)
  })

  it('snaps to the nearest half', () => {
    expect(lufsAt(yOf(-13.2, 360), 360)).toBe(-13)
    expect(lufsAt(yOf(-13.3, 360), 360)).toBe(-13.5)
  })

  it('stays inside the visible range', () => {
    expect(lufsAt(-50, 360)).toBe(-8)
    expect(lufsAt(900, 360)).toBe(-24)
  })
})

describe('stepTarget', () => {
  it('moves by half a LUFS in the direction asked, also outside the visible range', () => {
    expect(stepTarget(-27, -1)).toBe(-27.5)
    expect(stepTarget(-27, 1)).toBe(-26.5)
    expect(stepTarget(-13, 1)).toBe(-12.5)
  })

  it('stops at the range the target input accepts', () => {
    expect(stepTarget(0, 1)).toBe(0)
    expect(stepTarget(-40, -1)).toBe(-40)
  })
})
