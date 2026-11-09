import { describe, expect, it } from 'vitest'
import { kStages, measure, sectionLoudness, truePeak } from '../src/loudness.ts'

const rate = 48000
const tone = (freq: number, seconds: number, amp: number, phase = 0) =>
  Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / rate + phase))
const dbfs = (db: number) => 10 ** (db / 20)

describe('integrated loudness', () => {
  it('reads a stereo 997 Hz sine at -23 dBFS as -23 LUFS', () => {
    const x = tone(997, 20, dbfs(-23))
    expect(measure([x, x], rate).integrated).toBeCloseTo(-23, 1)
  })

  it('reads a mono-in-both 1 kHz sine at -33 dBFS as -33 LUFS', () => {
    const x = tone(1000, 20, dbfs(-33))
    expect(measure([x, x], rate).integrated).toBeCloseTo(-33, 1)
  })

  it('gates out silence', () => {
    const x = tone(997, 20, dbfs(-23))
    const padded = new Float32Array(rate * 60)
    padded.set(x, rate * 20)
    expect(Math.abs(measure([padded, padded], rate).integrated + 23)).toBeLessThan(0.1)
  })

  it('applies the relative gate: a -36 LUFS stretch next to -23 is dropped', () => {
    const loud = tone(997, 20, dbfs(-23))
    const quiet = tone(997, 20, dbfs(-36))
    const x = new Float32Array(loud.length * 2)
    x.set(loud)
    x.set(quiet, loud.length)
    expect(measure([x, x], rate).integrated).toBeCloseTo(-23, 1)
  })

  it('measures time ranges on their own', () => {
    const x = new Float32Array(rate * 20)
    x.set(tone(997, 10, dbfs(-30)))
    x.set(tone(997, 10, dbfs(-20)), rate * 10)
    const m = measure([x, x], rate)
    expect(sectionLoudness(m, 0, 10)).toBeCloseTo(-30, 1)
    expect(sectionLoudness(m, 10, 20)).toBeCloseTo(-20, 1)
    expect(sectionLoudness(m, 3, 3.2)).toBe(Number.NEGATIVE_INFINITY)
    expect(sectionLoudness(m, 0, 20)).toBeCloseTo(-22.6, 0)
  })
})

describe('loudness range', () => {
  it('is near 0 for a steady tone and near 10 for two levels 10 dB apart', () => {
    const steady = tone(997, 30, dbfs(-23))
    expect(measure([steady, steady], rate).range).toBeLessThan(0.5)
    const x = new Float32Array(rate * 60)
    x.set(tone(997, 30, dbfs(-20)))
    x.set(tone(997, 30, dbfs(-30)), rate * 30)
    expect(measure([x, x], rate).range).toBeCloseTo(10, 0)
  })
})

describe('true peak', () => {
  it('finds the peak between samples of a 12 kHz sine', () => {
    const x = tone(12000, 1, 0.5, Math.PI / 4)
    const samplePeak = Math.max(...x.map(Math.abs))
    expect(20 * Math.log10(samplePeak / 0.5)).toBeCloseTo(-3, 0)
    expect(truePeak([x])).toBeGreaterThan(20 * Math.log10(0.5) - 0.6)
    expect(truePeak([x])).toBeLessThan(20 * Math.log10(0.5) + 0.3)
  })

  it('agrees with the sample peak for a low tone', () => {
    const x = tone(100, 1, 0.8)
    expect(truePeak([x, new Float32Array(x.length)])).toBeCloseTo(20 * Math.log10(0.8), 1)
  })
})

describe('K-weighting', () => {
  it('matches the BS.1770 coefficients at 48 kHz', () => {
    const [shelf, high] = kStages(48000)
    expect(shelf.b0).toBeCloseTo(1.53512485958697, 6)
    expect(shelf.b1).toBeCloseTo(-2.69169618940638, 6)
    expect(shelf.b2).toBeCloseTo(1.19839281085285, 6)
    expect(shelf.a1).toBeCloseTo(-1.69065929318241, 6)
    expect(shelf.a2).toBeCloseTo(0.73248077421585, 6)
    expect(high.a1).toBeCloseTo(-1.99004745483398, 6)
    expect(high.a2).toBeCloseTo(0.99007225036621, 6)
  })
})
