import { describe, expect, it } from 'vitest'
import { applyControl, controlOf, toggleControl } from './controls.ts'
import { edits as baseEdits } from './fixture.ts'

describe('controlOf', () => {
  it('describes the slider for a space value', () => {
    const c = controlOf({ kind: 'space', key: 'decay' }, baseEdits())!
    expect(c).toMatchObject({ label: 'Decay', min: 0.4, max: 6, step: 0.1, value: 2.6 })
    expect(c.show(2.6)).toBe('2.6 s')
  })

  it('shows predelay in milliseconds', () => {
    expect(controlOf({ kind: 'space', key: 'predelay' }, baseEdits())!.value).toBe(20)
  })

  it('says a fade of zero rings out', () => {
    expect(controlOf({ kind: 'master', key: 'fade' }, baseEdits())!.show(0)).toBe('ring out')
  })

  it('reports lowcut as switched off when the score has none', () => {
    expect(controlOf({ kind: 'master', key: 'lowcut' }, baseEdits())).toMatchObject({ on: false, disabled: true })
  })

  it('disables the air frequency while air is off', () => {
    const e = baseEdits()
    e.master.air = null
    expect(controlOf({ kind: 'master', key: 'airFreq' }, e)).toMatchObject({ disabled: true, value: 9000 })
  })

  it('has no slider for a mix row or a section target', () => {
    expect(controlOf({ kind: 'mix', target: 'harp', param: 'gain' }, baseEdits())).toBe(null)
    expect(controlOf({ kind: 'loudness', mark: 'A' }, baseEdits())).toBe(null)
  })
})

describe('applyControl', () => {
  it('writes predelay back in seconds', () => {
    expect(applyControl({ kind: 'space', key: 'predelay' }, baseEdits(), 30).space.predelay).toBe(0.03)
  })

  it('creates air at the default frequency when its gain leaves zero', () => {
    const e = baseEdits()
    e.master.air = null
    expect(applyControl({ kind: 'master', key: 'airGain' }, e, 2).master.air).toEqual({ gain: 2, freq: 9000 })
  })

  it('removes air when its gain returns to zero', () => {
    expect(applyControl({ kind: 'master', key: 'airGain' }, baseEdits(), 0).master.air).toBe(null)
  })

  it('leaves the other edits alone', () => {
    const next = applyControl({ kind: 'master', key: 'ceiling' }, baseEdits(), -2)
    expect(next.master).toMatchObject({ ceiling: -2, loudness: -14 })
    expect(next.space).toEqual(baseEdits().space)
  })
})

describe('toggleControl', () => {
  it('switches lowcut on at 35 Hz and off again', () => {
    const on = toggleControl({ kind: 'master', key: 'lowcut' }, baseEdits(), true)
    expect(on.master.lowcut).toBe(35)
    expect(toggleControl({ kind: 'master', key: 'lowcut' }, on, false).master.lowcut).toBe(null)
  })
})
