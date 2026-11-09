import { DEFAULT_MASTER } from 'plainscore'
import { describe, expect, it } from 'vitest'
import { limit } from '../src/limiter.ts'
import { measure, sectionLoudness, truePeak } from '../src/loudness.ts'
import { applyCurve, balance, compensation, finish } from '../src/master.ts'

const rate = 48000
const tone = (freq: number, seconds: number, amp: number) => Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / rate))
const dbfs = (db: number) => 10 ** (db / 20)

describe('limit', () => {
  it('keeps the true peak under the ceiling on a hot signal', () => {
    const x = tone(997, 3, 2.5)
    const y = tone(12000, 3, 1.8)
    const { audio, maxReduction } = limit([x, y], -1, rate)
    expect(truePeak(audio)).toBeLessThanOrEqual(-0.9)
    expect(maxReduction).toBeGreaterThan(8)
  })

  it('leaves a quiet signal untouched', () => {
    const x = tone(440, 1, 0.3)
    const { audio, maxReduction, overOneDb } = limit([x, x], -1, rate)
    expect(audio[0]).toEqual(x)
    expect([maxReduction, overOneDb]).toEqual([0, 0])
  })

  it('handles DC, a full-scale square and one silent channel', () => {
    const dc = new Float32Array(rate).fill(1.5)
    const square = Float32Array.from({ length: rate }, (_, i) => (Math.floor(i / 24) % 2 ? 1 : -1))
    const { audio } = limit([dc, new Float32Array(rate)], -1, rate)
    expect(Math.max(...audio[0].subarray(rate / 2))).toBeLessThanOrEqual(dbfs(-1) + 1e-6)
    expect(audio[1].every((v) => v === 0)).toBe(true)
    expect(truePeak(limit([square, square], -1, rate).audio)).toBeLessThanOrEqual(-0.9)
  })
})

describe('compensation', () => {
  it('inherits forwards, and backwards before the first target', () => {
    expect(compensation([null, -16, null, -12, null], [-20, -20, -20, -20, -20], 0)).toEqual([4, 4, 4, 8, 8])
  })

  it('is zero without targets and skips silent sections', () => {
    expect(compensation([null, null], [-20, -30], 3)).toEqual([0, 0])
    expect(compensation([-16, -16], [Number.NEGATIVE_INFINITY, -20], 0)).toEqual([4, 4])
  })
})

describe('applyCurve', () => {
  it('ramps 0.4 s centred on each edge', () => {
    const ones = new Float32Array(rate * 4).fill(1)
    const [y] = applyCurve([ones], [{ start: 0, gain: 0 }, { start: 2, gain: 20 }], rate)
    expect(y[rate]).toBeCloseTo(1, 6)
    expect(y[Math.round(1.8 * rate) - 1]).toBeCloseTo(1, 3)
    expect(y[2 * rate]).toBeCloseTo(dbfs(10), 3)
    expect(y[Math.round(2.2 * rate) + 1]).toBeCloseTo(10, 3)
  })
})

describe('balance and finish', () => {
  it('brings two sections 10 LU apart together and the whole to the master target', () => {
    const quiet = tone(997, 10, dbfs(-30))
    const loud = tone(997, 10, dbfs(-20))
    const x = new Float32Array(quiet.length * 2)
    x.set(quiet)
    x.set(loud, quiet.length)
    const sections = [
      { start: 0, end: 10, target: -16 },
      { start: 10, end: 20, target: -16 },
    ]
    const master = { ...DEFAULT_MASTER, loudness: -14 }
    const balanced = balance([x, x], sections, master, rate)
    const done = finish(balanced.audio, master, rate)
    const m = measure(done.audio, rate)
    expect(Math.abs(m.integrated + 14)).toBeLessThan(0.2)
    expect(Math.abs(sectionLoudness(m, 0.5, 9.5) - sectionLoudness(m, 10.5, 19.5))).toBeLessThan(0.5)
    expect(balanced.compensation[1] - balanced.compensation[0]).toBeCloseTo(-10, 0)
    expect(truePeak(done.audio)).toBeLessThanOrEqual(-0.9)
  })

  it('does not pile up a shift the master gain takes back', () => {
    const x = tone(997, 10, dbfs(-30))
    const balanced = balance([x, x], [{ start: 0, end: 10, target: -16 }], { ...DEFAULT_MASTER, loudness: -14 }, rate)
    expect(balanced.compensation[0]).toBeCloseTo(-2, 1)
  })

  it('keeps the balance as written when no section has a target', () => {
    const x = tone(997, 10, dbfs(-30))
    const balanced = balance([x, x], [{ start: 0, end: 10, target: null }], DEFAULT_MASTER, rate)
    expect(balanced.compensation).toEqual([0])
    expect(balanced.audio[0]).toBe(x)
  })
})
