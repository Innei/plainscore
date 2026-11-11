import { describe, expect, it } from 'vitest'
import { bakeInstrument, headroom, manifestOf } from '../scripts/bake-samples.ts'

const rate = 1000
const constant = (value: number, seconds: number) => new Float32Array(Math.round(seconds * rate)).fill(value)
const db = (gain: number) => 20 * Math.log10(gain)

describe('baking the resume samples', () => {
  it('scales piano by its trim only', () => {
    const [left] = bakeInstrument([constant(0.1, 1), constant(0.1, 1)], rate, { C4: [0, 1] }, 'piano')
    expect(left[0]).toBeCloseTo(0.062, 6)
  })

  it('brings each cello sprite toward -32.5 dB on its own', () => {
    const quiet = 10 ** (-34.5 / 20)
    const loud = 10 ** (-31.5 / 20)
    const channels = [new Float32Array([...constant(quiet, 1), ...constant(loud, 1)]), new Float32Array([...constant(quiet, 1), ...constant(loud, 1)])]
    const [left] = bakeInstrument(channels, rate, { C2: [0, 1], C3: [1, 1] }, 'cello')
    expect(db(left[0] / quiet / 1.6)).toBeCloseTo(2, 4)
    expect(db(left[1500] / loud / 1.6)).toBeCloseTo(-1, 4)
  })

  it('clamps the calibration gain', () => {
    const tiny = 10 ** (-60 / 20)
    const [left] = bakeInstrument([constant(tiny, 1), constant(tiny, 1)], rate, { G3: [0, 1] }, 'violins')
    expect(db(left[0] / tiny / 2)).toBeCloseTo(4, 4)
  })

  it('pulls every set down by one gain when a peak passes 0.89', () => {
    const sets = { piano: [constant(0.5, 1)], harp: [constant(1.78, 1)] }
    const gain = headroom(Object.values(sets))
    expect(gain).toBeCloseTo(0.5, 6)
  })

  it('names each MP3 by its content so a re-bake gets new URLs', () => {
    const a = manifestOf({ piano: new Uint8Array([1]), pizz: new Uint8Array([2]) })
    const b = manifestOf({ piano: new Uint8Array([1]), pizz: new Uint8Array([3]) })
    expect(a.manifest.piano.samples).toMatch(/^\.\/piano-[0-9a-f]{8}\.mp3$/)
    expect(a.manifest.piano.samples).toBe(b.manifest.piano.samples)
    expect(a.manifest['violins pizz.'].samples).not.toBe(b.manifest['violins pizz.'].samples)
    expect(a.manifest['violins pizz.']).toMatchObject({ sprite: './sprites.json#pizz', release: 0.8 })
    expect(a.files).toEqual({ [a.manifest.piano.samples.slice(2)]: new Uint8Array([1]), [a.manifest['violins pizz.'].samples.slice(2)]: new Uint8Array([2]) })
  })

  it('leaves the level alone when every peak is under 0.89', () => {
    expect(headroom([[constant(0.585, 1)]])).toBe(1)
  })
})
