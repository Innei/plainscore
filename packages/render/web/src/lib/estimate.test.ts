import { describe, expect, it } from 'vitest'
import { estimate } from './estimate.ts'
import { edits, state } from './fixture.ts'

const view = () => {
  const s = state()
  return { report: s.report, comp: s.report.sections.map((x) => x.compensation), gain: s.report.gain }
}

describe('estimate', () => {
  it('keeps the measured compensation when targets are unchanged', () => {
    expect(estimate(state(), edits(), view())).toEqual([2, 2, -1])
  })

  it('moves a section by the change in its target and carries it into a section without one', () => {
    const e = edits()
    e.loudness.A = -15
    expect(estimate(state(), e, view())).toEqual([3, 3, -1])
  })

  it('gives sections before the first target that target\'s gain', () => {
    const e = edits()
    e.loudness.A = null
    expect(estimate(state(), e, view())).toEqual([-1, -1, -1])
  })

  it('is flat when no section has a target', () => {
    const e = edits()
    e.loudness = { A: null, B: null, C: null }
    expect(estimate(state(), e, view())).toEqual([0, 0, 0])
  })
})
