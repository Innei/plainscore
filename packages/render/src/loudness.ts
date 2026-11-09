import { type Coeffs, filter } from './dsp/biquad.ts'

export interface Measurement {
  rate: number
  segment: number
  segments: Float64Array
  integrated: number
  range: number
}

const toLufs = (power: number) => (power > 0 ? -0.691 + 10 * Math.log10(power) : Number.NEGATIVE_INFINITY)
const toPower = (lufs: number) => 10 ** ((lufs + 0.691) / 10)
const ABSOLUTE = toPower(-70)

export const kStages = (rate: number): Coeffs[] => {
  const shelfK = Math.tan((Math.PI * 1681.974450955533) / rate)
  const shelfQ = 0.7071752369554196
  const vh = 10 ** (3.999843853973347 / 20)
  const vb = vh ** 0.4996667741545416
  const s0 = 1 + shelfK / shelfQ + shelfK * shelfK
  const passK = Math.tan((Math.PI * 38.13547087613982) / rate)
  const passQ = 0.5003270373238773
  const p0 = 1 + passK / passQ + passK * passK
  return [
    {
      b0: (vh + (vb * shelfK) / shelfQ + shelfK * shelfK) / s0,
      b1: (2 * (shelfK * shelfK - vh)) / s0,
      b2: (vh - (vb * shelfK) / shelfQ + shelfK * shelfK) / s0,
      a1: (2 * (shelfK * shelfK - 1)) / s0,
      a2: (1 - shelfK / shelfQ + shelfK * shelfK) / s0,
    },
    { b0: 1, b1: -2, b2: 1, a1: (2 * (passK * passK - 1)) / p0, a2: (1 - passK / passQ + passK * passK) / p0 },
  ]
}

export const kWeight = (x: Float32Array, rate: number) => {
  const [shelf, high] = kStages(rate)
  return filter(high, filter(shelf, x))
}

const segmentPowers = (channels: Float32Array[], rate: number) => {
  const segment = Math.round(rate / 10)
  const count = Math.floor(channels[0].length / segment)
  const segments = new Float64Array(count)
  for (const channel of channels) {
    const k = kWeight(channel, rate)
    for (let s = 0; s < count; s++) {
      let sum = 0
      for (let i = s * segment, end = i + segment; i < end; i++) sum += k[i] * k[i]
      segments[s] += sum
    }
  }
  return { segment, segments }
}

const windows = (segments: Float64Array, segment: number, size: number, from: number, to: number) => {
  const powers: number[] = []
  for (let s = from; s + size <= to; s++) {
    let sum = 0
    for (let i = s; i < s + size; i++) sum += segments[i]
    powers.push(sum / (size * segment))
  }
  return powers
}

const gated = (powers: number[], relative: number) => {
  const loud = powers.filter((p) => p > ABSOLUTE)
  if (!loud.length) return []
  const mean = loud.reduce((a, b) => a + b, 0) / loud.length
  const gate = toPower(toLufs(mean) + relative)
  return loud.filter((p) => p > gate)
}

const integratedOf = (powers: number[]) => {
  const kept = gated(powers, -10)
  return kept.length ? toLufs(kept.reduce((a, b) => a + b, 0) / kept.length) : Number.NEGATIVE_INFINITY
}

const rangeOf = (segments: Float64Array, segment: number) => {
  const kept = gated(windows(segments, segment, 30, 0, segments.length), -20)
    .map(toLufs)
    .sort((a, b) => a - b)
  if (kept.length < 2) return 0
  const at = (q: number) => kept[Math.round((kept.length - 1) * q)]
  return at(0.95) - at(0.1)
}

export const measure = (channels: Float32Array[], rate: number): Measurement => {
  const { segment, segments } = segmentPowers(channels, rate)
  return {
    rate,
    segment,
    segments,
    integrated: integratedOf(windows(segments, segment, 4, 0, segments.length)),
    range: rangeOf(segments, segment),
  }
}

export const sectionLoudness = (m: Measurement, from: number, to: number) => {
  const step = m.segment / m.rate
  const first = Math.max(0, Math.ceil(from / step - 1e-6))
  const last = Math.min(m.segments.length, Math.floor(to / step + 1e-6))
  return integratedOf(windows(m.segments, m.segment, 4, first, last))
}

const HALF = 8
const PHASES = [0.25, 0.5, 0.75].map((f) => {
  const taps = Array.from({ length: 2 * HALF }, (_, i) => {
    const t = f - (i - HALF + 1)
    const sinc = Math.sin(Math.PI * t) / (Math.PI * t)
    const w = 0.42 + 0.5 * Math.cos((Math.PI * t) / HALF) + 0.08 * Math.cos((2 * Math.PI * t) / HALF)
    return sinc * w
  })
  const sum = taps.reduce((a, b) => a + b, 0)
  return Float64Array.from(taps, (v) => v / sum)
})

export const interPeaks = (x: Float32Array, out = new Float32Array(x.length)) => {
  const n = x.length
  for (let j = 0; j < n; j++) {
    let peak = Math.abs(x[j])
    for (const taps of PHASES) {
      let y = 0
      for (let i = 0; i < taps.length; i++) {
        const m = j + i - HALF + 1
        if (m >= 0 && m < n) y += taps[i] * x[m]
      }
      if (Math.abs(y) > peak) peak = Math.abs(y)
    }
    out[j] = peak
  }
  return out
}

export const truePeak = (channels: Float32Array[]) => {
  let peak = 0
  for (const channel of channels) for (const v of interPeaks(channel)) if (v > peak) peak = v
  return 20 * Math.log10(peak || 1e-12)
}
