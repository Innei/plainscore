import { describe, expect, it } from 'vitest'
import { axisLength, clock, panLabel, pieceTitle, sectionLabel, signed } from './format.ts'
import { playPosition, sectionAt } from './position.ts'

const sections = [{ start: 0, end: 4 }, { start: 4, end: 8 }, { start: 8, end: 12 }]

describe('sectionAt', () => {
  it('finds the section a time falls in', () => {
    expect(sectionAt(sections, 0)).toBe(0)
    expect(sectionAt(sections, 4)).toBe(1)
    expect(sectionAt(sections, 11.9)).toBe(2)
    expect(sectionAt(sections, 30)).toBe(2)
  })
})

describe('playPosition', () => {
  it('runs on and stops at the end of the piece', () => {
    expect(playPosition({ elapsed: 5, loop: null, length: 12 })).toBe(5)
    expect(playPosition({ elapsed: 15, loop: null, length: 12 })).toBe(12)
  })

  it('wraps inside the looped section', () => {
    expect(playPosition({ elapsed: 6, loop: { start: 4, end: 8 }, length: 12 })).toBe(6)
    expect(playPosition({ elapsed: 9, loop: { start: 4, end: 8 }, length: 12 })).toBe(5)
  })
})

describe('format', () => {
  it('formats clock, signed dB and pan', () => {
    expect(clock(72.4)).toBe('1:12.4')
    expect(clock(5)).toBe('0:05.0')
    expect(signed(2)).toBe('+2.0')
    expect(signed(-1.25)).toBe('-1.3')
    expect(signed(0)).toBe('0.0')
    expect(panLabel(0)).toBe('C')
    expect(panLabel(-0.35)).toBe('L35')
    expect(panLabel(1)).toBe('R100')
  })
})

describe('pieceTitle', () => {
  it('drops a piece title that only differs from the score title by spacing', () => {
    expect(pieceTitle({ title: '間  Ma', piece: { title: '間 Ma' }, variant: null })).toBe('間  Ma')
    expect(pieceTitle({ title: 'Little', piece: { title: 'Theme' }, variant: 'short' })).toBe('Little · Theme · short')
  })
})

describe('axisLength', () => {
  it('covers the stems, the master and the last section', () => {
    expect(axisLength(248.5, 249.3, 248.9)).toBe(249.3)
    expect(axisLength(0, 0, 12)).toBe(12)
  })
})

describe('sectionLabel', () => {
  it('drops a label that only repeats the mark', () => {
    expect(sectionLabel({ mark: 'A3', label: 'A3' })).toBe(null)
    expect(sectionLabel({ mark: 'A3', label: 'the turn' })).toBe('the turn')
  })
})
