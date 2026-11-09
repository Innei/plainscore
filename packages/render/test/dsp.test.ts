import { describe, expect, it } from 'vitest'
import { biquad, filter } from '../src/dsp/biquad.ts'
import { convolve } from '../src/dsp/convolve.ts'
import { impulse, mulberry32 } from '../src/dsp/impulse.ts'
import { panGains } from '../src/dsp/pan.ts'
import { decodeWav, encodeWav } from '../src/dsp/wav.ts'

const rate = 48000
const sine = (freq: number, seconds: number, amp = 0.5) => Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / rate))
const rms = (x: Float32Array, from = 0) => Math.sqrt(x.subarray(from).reduce((s, v) => s + v * v, 0) / (x.length - from))
const db = (a: number, b: number) => 20 * Math.log10(a / b)

describe('biquad', () => {
  it('a 35 Hz lowcut takes 30 Hz down and leaves 1 kHz alone', () => {
    const hp = biquad('highpass', 35, Math.SQRT1_2, 0, rate)
    const low = sine(30, 2)
    const mid = sine(1000, 1)
    expect(db(rms(filter(hp, low), rate), rms(low, rate))).toBeLessThan(-2)
    expect(Math.abs(db(rms(filter(hp, mid), rate / 2), rms(mid, rate / 2)))).toBeLessThan(0.1)
  })

  it('a +2 dB high shelf at 9 kHz lifts 15 kHz by about 2 dB', () => {
    const shelf = biquad('highshelf', 9000, Math.SQRT1_2, 2, rate)
    const x = sine(15000, 1)
    expect(db(rms(filter(shelf, x), rate / 2), rms(x, rate / 2))).toBeCloseTo(2, 0)
  })

  it('a 3 kHz bell of +3 dB peaks at 3 kHz', () => {
    const bell = biquad('peaking', 3000, 1, 3, rate)
    const x = sine(3000, 1)
    expect(db(rms(filter(bell, x), rate / 2), rms(x, rate / 2))).toBeCloseTo(3, 1)
  })
})

describe('convolve', () => {
  it('an impulse returns the response', () => {
    const ir = Float32Array.from([0.5, -0.25, 0.125])
    const x = new Float32Array(10)
    x[3] = 1
    const y = convolve(x, ir)
    ;[0, 0, 0, 0.5, -0.25, 0.125, 0, 0, 0, 0].forEach((v, i) => expect(y[i]).toBeCloseTo(v, 9))
  })

  it('matches direct convolution on noise, across many segments', () => {
    const rng = mulberry32(7)
    const x = Float32Array.from({ length: 20000 }, () => rng() * 2 - 1)
    const ir = Float32Array.from({ length: 3000 }, () => rng() * 2 - 1)
    const fast = convolve(x, ir, 1024)
    expect(fast.length).toBe(x.length + ir.length - 1)
    for (const n of [0, 1, 999, 1024, 5000, 19999, 22998]) {
      let direct = 0
      for (let k = 0; k < ir.length; k++) if (n - k >= 0 && n - k < x.length) direct += x[n - k] * ir[k]
      expect(fast[n]).toBeCloseTo(direct, 3)
    }
  })
})

describe('impulse', () => {
  const space = { decay: 2.6, predelay: 0.02, damp: 6500, wet: -10 }

  it('is the same every time, unit energy, silent through the predelay', () => {
    const [l, r] = impulse(space, rate)
    const [l2] = impulse(space, rate)
    expect(l).toEqual(l2)
    expect(l.length).toBe(Math.round(0.02 * rate) + Math.ceil(2.6 * rate))
    expect(l.reduce((s, v) => s + v * v, 0)).toBeCloseTo(1, 5)
    expect(l.subarray(0, 960).every((v) => v === 0)).toBe(true)
    expect(l[2000]).not.toBe(r[2000])
  })

  it('decays 60 dB over the decay time', () => {
    const [l] = impulse(space, rate)
    const pre = 960
    const early = rms(l.subarray(pre, pre + 4800))
    const late = rms(l.subarray(l.length - 4800))
    expect(db(late, early)).toBeLessThan(-50)
  })
})

describe('pan', () => {
  it('is equal power', () => {
    for (const p of [-1, -0.35, 0, 0.5, 1]) {
      const [l, r] = panGains(p)
      expect(l * l + r * r).toBeCloseTo(1, 10)
    }
    expect(panGains(-1)).toEqual([1, 0])
    expect(panGains(0)[0]).toBeCloseTo(Math.SQRT1_2, 10)
  })
})

describe('wav', () => {
  it('round-trips 24-bit stereo within one step', () => {
    const left = sine(440, 0.1, 0.9)
    const right = sine(660, 0.1, -0.5)
    const bytes = encodeWav([left, right], rate, 24)
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('RIFF')
    const back = decodeWav(bytes)
    expect(back.rate).toBe(rate)
    expect(back.channels.length).toBe(2)
    for (let i = 0; i < left.length; i += 37) {
      expect(Math.abs(back.channels[0][i] - left[i])).toBeLessThan(2 / 2 ** 23)
      expect(Math.abs(back.channels[1][i] - right[i])).toBeLessThan(2 / 2 ** 23)
    }
  })

  it('reads 16-bit mono and 32-bit float', () => {
    const x = sine(440, 0.05, 0.5)
    expect(Math.abs(decodeWav(encodeWav([x], 44100, 16)).channels[0][100] - x[100])).toBeLessThan(2 / 2 ** 15)
    expect(decodeWav(encodeWav([x], 44100, 32)).channels[0][100]).toBe(x[100])
  })
})
