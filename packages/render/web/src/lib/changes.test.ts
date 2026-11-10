import { describe, expect, it } from 'vitest'
import { changeCards, revertChange } from './changes.ts'
import { edits as baseEdits, state as baseState } from './fixture.ts'

const edited = () => {
  const s = baseState()
  const e = structuredClone(s.edits)
  e.loudness.A = -15
  e.mix.harp = { gain: -5, send: null }
  e.space = { ...e.space, wet: -12 }
  return { s, e }
}

describe('changeCards', () => {
  it('is empty when nothing differs from the written edits', () => {
    const s = baseState()
    expect(changeCards(s, baseEdits())).toEqual([])
  })

  it('lists one card per changed section, mix row, space and master, in that order', () => {
    const { s, e } = edited()
    e.master = { ...e.master, air: null, lowcut: 40 }
    expect(changeCards(s, e).map((c) => [c.id, c.label])).toEqual([
      ['loudness:A', 'Section loudness'],
      ['mix:harp', 'Mix · harp'],
      ['space', 'Space · wet'],
      ['master:lowcut', 'Master · lowcut'],
      ['master:air', 'Master · air'],
    ])
  })

  it('ignores differences below a hundredth', () => {
    const s = baseState()
    const e = baseEdits()
    e.mix.tune = { gain: 1.001 }
    e.space.decay = 2.6001
    expect(changeCards(s, e)).toEqual([])
  })

  it('sees a new mix row for a target the score had no row for', () => {
    const s = baseState()
    const e = baseEdits()
    e.mix.cello = { gain: -2 }
    expect(changeCards(s, e).map((c) => c.id)).toEqual(['mix:cello'])
  })

  it('treats a target cleared to inherit as a change', () => {
    const s = baseState()
    const e = baseEdits()
    e.loudness.C = null
    expect(changeCards(s, e).map((c) => [c.id, c.mark])).toEqual([['loudness:C', 'C']])
  })
})

describe('revertChange', () => {
  it('restores one change and keeps the others', () => {
    const { s, e } = edited()
    const next = revertChange(s, e, 'mix:harp')
    expect(next.mix.harp).toEqual({ gain: -3, send: null })
    expect(next.loudness.A).toBe(-15)
    expect(next.space.wet).toBe(-12)
    expect(e.mix.harp).toEqual({ gain: -5, send: null })
  })

  it('removes a mix row the score never had', () => {
    const s = baseState()
    const e = baseEdits()
    e.mix.cello = { gain: -2 }
    expect('cello' in revertChange(s, e, 'mix:cello').mix).toBe(false)
  })
})

describe('revertChange on master', () => {
  it('reverts one master row and leaves the others changed', () => {
    const s = baseState()
    const e = structuredClone(s.edits)
    e.master = { ...e.master, air: null, lowcut: 40, loudness: -12 }
    const next = revertChange(s, e, 'master:air')
    expect(next.master.air).toEqual(s.edits.master.air)
    expect(next.master.lowcut).toBe(40)
    expect(revertChange(s, next, 'master:head').master).toMatchObject({ loudness: s.edits.master.loudness, lowcut: 40 })
  })
})
