import type { Master } from 'plainscore'
import { biquad, filter } from './dsp/biquad.ts'
import { limit } from './limiter.ts'
import { measure, sectionLoudness } from './loudness.ts'

export const RAMP = 0.4
export const PRESENCE_FREQ = 3000

export interface SectionSpan {
  start: number
  end: number
  target: number | null
}

export const masterEq = (channels: Float32Array[], master: Master, rate: number) => {
  const stages = [
    ...(master.lowcut ? [biquad('highpass', master.lowcut, Math.SQRT1_2, 0, rate)] : []),
    ...(master.presence ? [biquad('peaking', PRESENCE_FREQ, 1, master.presence, rate)] : []),
    ...(master.air?.gain ? [biquad('highshelf', master.air.freq, Math.SQRT1_2, master.air.gain, rate)] : []),
  ]
  if (!stages.length) return channels
  return channels.map((x) => stages.reduce((y, c) => filter(c, y), x))
}

export const compensation = (targets: (number | null)[], measured: number[], gain: number) => {
  const own = targets.map((t, i) => (t !== null && Number.isFinite(measured[i]) ? t - (measured[i] + gain) : null))
  return inherit(own)
}

const inherit = (own: (number | null)[]) => {
  const first = own.find((v) => v !== null)
  if (first === undefined) return own.map(() => 0)
  let last = first as number
  return own.map((v) => (v === null ? last : (last = v)))
}

export const applyCurve = (channels: Float32Array[], edges: { start: number; gain: number }[], rate: number, ramp = RAMP) => {
  if (edges.every((e) => e.gain === edges[0].gain) && edges[0].gain === 0) return channels
  const n = channels[0].length
  const curve = new Float32Array(n)
  const steps = edges.slice(1).map((e, i) => ({ from: (e.start - ramp / 2) * rate, step: e.gain - edges[i].gain }))
  for (let i = 0; i < n; i++) {
    let db = edges[0].gain
    for (const s of steps) {
      if (i <= s.from) break
      db += s.step * Math.min(1, (i - s.from) / (ramp * rate))
    }
    curve[i] = 10 ** (db / 20)
  }
  return channels.map((x) => Float32Array.from(x, (v, i) => v * curve[i]))
}

export const balance = (channels: Float32Array[], sections: SectionSpan[], master: Master, rate: number, rounds = 2) => {
  const targets = sections.map((s) => s.target)
  if (targets.every((t) => t === null)) return { audio: channels, compensation: sections.map(() => 0), rounds: 0 }
  const m = measure(channels, rate)
  let comp = compensation(targets, sections.map((s) => sectionLoudness(m, s.start, s.end)), master.loudness - m.integrated)
  let audio = channels
  let round = 0
  while (round < rounds) {
    audio = applyCurve(channels, sections.map((s, i) => ({ start: s.start, gain: comp[i] })), rate)
    round++
    if (round === rounds) break
    const again = measure(audio, rate)
    const gain = master.loudness - again.integrated
    const residual = sections.map((s, i) => (s.target === null ? null : s.target - (sectionLoudness(again, s.start, s.end) + gain)))
    const live = residual.filter((r): r is number => r !== null && Number.isFinite(r))
    const shared = live.reduce((a, r) => a + r, 0) / live.length
    if (live.every((r) => Math.abs(r - shared) < 0.1)) break
    const own = residual.map((r, i) => (r === null || !Number.isFinite(r) ? null : comp[i] + r - shared))
    comp = inherit(own.map((v, i) => (targets[i] === null ? null : (v ?? comp[i]))))
  }
  return { audio, compensation: comp, rounds: round }
}

export const finish = (channels: Float32Array[], master: Master, rate: number) => {
  const scale = (db: number) => channels.map((x) => Float32Array.from(x, (v) => v * 10 ** (db / 20)))
  let gain = master.loudness - measure(channels, rate).integrated
  let result = limit(scale(gain), master.ceiling, rate)
  gain += master.loudness - measure(result.audio, rate).integrated
  result = limit(scale(gain), master.ceiling, rate)
  return { ...result, gain }
}
