import { describe, expect, it } from 'vitest'
import { edits, state } from './fixture.ts'
import { resolveMix, writeStrip } from './mix.ts'

describe('resolveMix', () => {
  it('adds a part row to its instrument and keeps unwritten sends at 0 dB', () => {
    const s = state()
    const e = edits()
    e.mix.piano = { gain: -2, pan: -0.3 }
    const mix = resolveMix(s, e)
    expect(mix.instruments.piano).toEqual({ gain: -2, pan: -0.3, send: 0 })
    expect(mix.instruments.harp).toEqual({ gain: -3, pan: 0, send: null })
    expect(mix.parts.tune).toEqual({ gain: -1, pan: -0.3, send: 0 })
  })
})

describe('writeStrip', () => {
  it('writes a part row relative to its instrument and leaves the input edits alone', () => {
    const s = state()
    const e = edits()
    const next = writeStrip(s, e, 'tune', 'part', { gain: 3, pan: 0, send: 0 })
    expect(next.mix.tune).toEqual({ gain: 3 })
    expect(e.mix.tune).toEqual({ gain: 1 })
  })

  it('writes pan and send only when they move off the base', () => {
    const s = state()
    const next = writeStrip(s, edits(), 'piano', 'instrument', { gain: -1.04, pan: 0.25, send: 0 })
    expect(next.mix.piano).toEqual({ gain: -1, pan: 0.25 })
  })

  it('keeps send off', () => {
    const s = state()
    const next = writeStrip(s, edits(), 'harp', 'instrument', { gain: -4, pan: 0, send: null })
    expect(next.mix.harp).toEqual({ gain: -4, send: null })
  })
})
