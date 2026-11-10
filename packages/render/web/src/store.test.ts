import { describe, expect, it } from 'vitest'
import { edits as baseEdits, state as baseState } from './lib/fixture.ts'
import { initial, reduce } from './store.ts'

const loaded = () => reduce(initial, { type: 'loaded', state: baseState() })

describe('mixer store', () => {
  it('starts from the written edits and the measured report', () => {
    const m = loaded()
    expect(m.edits).toEqual(baseEdits())
    expect(m.view!.comp).toEqual([2, 2, -1])
    expect(m.stale).toBe(false)
    expect(m.curve!.values).toHaveLength(10)
  })

  it('marks an edit stale and estimates the new compensation', () => {
    const e = baseEdits()
    e.loudness.A = -15
    const m = reduce(loaded(), { type: 'edit', edits: e })
    expect(m.stale).toBe(true)
    expect(m.view!.comp).toEqual([3, 3, -1])
  })

  it('is up to date again once the edits return to what was measured', () => {
    const e = baseEdits()
    e.loudness.A = -15
    const m = reduce(reduce(loaded(), { type: 'edit', edits: e }), { type: 'edit', edits: baseEdits() })
    expect(m.stale).toBe(false)
    expect(m.view!.comp).toEqual([2, 2, -1])
  })

  it('moves the master gain with the master loudness until measured', () => {
    const e = baseEdits()
    e.master.loudness = -12
    const m = reduce(loaded(), { type: 'edit', edits: e })
    expect(m.view!.gain).toBe(8)
  })

  it('takes a measurement and clears stale', () => {
    const e = baseEdits()
    e.loudness.A = -15
    const s = baseState()
    const report = { ...s.report, gain: 7, sections: s.report.sections.map((x) => ({ ...x, compensation: x.compensation + 1 })) }
    const m = reduce(reduce(loaded(), { type: 'edit', edits: e }), { type: 'measured', report, curve: { step: 1, window: 3, values: [-15] }, edits: e })
    expect(m.stale).toBe(false)
    expect(m.view).toEqual({ report, comp: [3, 3, 0], gain: 7 })
    expect(m.curve!.values).toEqual([-15])
    expect(m.edits!.loudness.A).toBe(-15)
  })

  it('keeps newer edits stale when a measurement of older ones comes back', () => {
    const older = baseEdits()
    older.loudness.A = -15
    const newer = baseEdits()
    newer.loudness.A = -16
    const s = baseState()
    let m = reduce(reduce(loaded(), { type: 'edit', edits: older }), { type: 'edit', edits: newer })
    m = reduce(m, { type: 'measured', report: s.report, curve: { step: 1, window: 3, values: [-15] }, edits: older })
    expect(m.stale).toBe(true)
    expect(m.edits).toEqual(newer)
    m = reduce(m, { type: 'edit', edits: older })
    expect(m.stale).toBe(false)
  })

  it('resets the edits to the new state after a write', () => {
    const e = baseEdits()
    e.loudness.A = -15
    let m = reduce(loaded(), { type: 'edit', edits: e })
    const next = { ...baseState(), version: 2, edits: e }
    m = reduce(reduce(m, { type: 'writeFailed', error: 'x' }), { type: 'written', state: next })
    expect(m.state!.version).toBe(2)
    expect(m.edits).toEqual(e)
    expect(m.writeError).toBe(null)
    expect('tab' in m).toBe(false)
  })

  it('keeps edits when a write fails', () => {
    const e = baseEdits()
    e.loudness.A = -15
    const m = reduce(reduce(loaded(), { type: 'edit', edits: e }), { type: 'writeFailed', error: 'little.score changed on disk' })
    expect(m.edits!.loudness.A).toBe(-15)
    expect(m.writeError).toContain('changed on disk')
  })
})
