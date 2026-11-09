import type { ScoreEvent } from 'plainscore'

export interface SectionReport {
  mark: string
  label: string
  start: number
  end: number
  target: number | null
  compensation: number
  measured: number | null
  diff: number | null
}

export interface SeamWarning {
  from: string
  to: string
  time: number
  dip: number
  sounding: string[]
}

export interface Report {
  title: string
  piece: string
  variant: string | null
  seconds: number
  target: number
  ceiling: number
  integrated: number
  range: number
  truePeak: number
  gain: number
  limiter: { maxReduction: number; overOneDb: number }
  sections: SectionReport[]
  seams: SeamWarning[]
  credits: { sound: string; credit: string }[]
}

export const SEAM_WINDOW = 0.6
export const SEAM_NEAR = 0.25
export const SEAM_RMS = 0.15
export const SEAM_HOP = 0.05
export const SEAM_DB = 8

const rmsDb = (channels: Float32Array[], rate: number, center: number) => {
  const from = Math.max(0, Math.round((center - SEAM_RMS / 2) * rate))
  const to = Math.min(channels[0].length, Math.round((center + SEAM_RMS / 2) * rate))
  if (to <= from) return Number.NEGATIVE_INFINITY
  let sum = 0
  for (const x of channels) for (let i = from; i < to; i++) sum += x[i] * x[i]
  return 10 * Math.log10(sum / ((to - from) * channels.length) + 1e-20)
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export interface Sounding {
  inst: string
  start: number
  end: number
}

export const soundingSpans = (events: ScoreEvent[], at: (pos: number) => number): Sounding[] =>
  events.map((e) => ({ inst: e.inst, start: at(e.step + e.offset), end: at(e.step + e.offset + e.length) }))

export const seamCheck = (
  channels: Float32Array[],
  rate: number,
  edges: { from: string; to: string; time: number }[],
  spans: Sounding[],
  threshold = SEAM_DB,
): SeamWarning[] => {
  const warnings: SeamWarning[] = []
  for (const edge of edges) {
    const near: [number, number][] = []
    const sides: number[] = []
    for (let t = -SEAM_WINDOW; t <= SEAM_WINDOW + 1e-9; t += SEAM_HOP) {
      const value = rmsDb(channels, rate, edge.time + t)
      if (Math.abs(t) <= SEAM_NEAR + 1e-9) near.push([edge.time + t, value])
      else sides.push(value)
    }
    const [time, low] = near.reduce((a, b) => (b[1] < a[1] ? b : a))
    const dip = median(sides) - low
    if (!(dip >= threshold)) continue
    const sounding = [...new Set(spans.filter((s) => s.start <= time && time < s.end).map((s) => s.inst))]
    warnings.push({ ...edge, time: Math.round(time * 1000) / 1000, dip: Math.round(dip * 10) / 10, sounding })
  }
  return warnings
}

const num = (v: number | null, digits = 1) => (v === null || !Number.isFinite(v) ? '—' : v.toFixed(digits))
const signedNum = (v: number | null) => (v === null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`)
const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`

const squash = (s: string) => s.replace(/\s+/g, '')

export const formatReport = (r: Report) => {
  const piece = r.piece && squash(r.piece) !== squash(r.title) ? r.piece : ''
  const lines = [
    `${r.title}${piece ? ` · ${piece}` : ''}${r.variant ? ` · ${r.variant}` : ''}  ${clock(r.seconds)}`,
    `integrated ${num(r.integrated)} LUFS (target ${num(r.target)})  LRA ${num(r.range)} LU  true peak ${num(r.truePeak)} dBTP (ceiling ${num(r.ceiling)})`,
    `master gain ${signedNum(r.gain)} dB  limiter max ${num(r.limiter.maxReduction)} dB, ${num(r.limiter.overOneDb)} s over 1 dB`,
    '',
    `${'section'.padEnd(12)}${'start'.padStart(8)}${'target'.padStart(9)}${'comp'.padStart(8)}${'measured'.padStart(10)}${'diff'.padStart(7)}`,
    ...r.sections.map(
      (s) =>
        `${s.mark.padEnd(12)}${clock(s.start).padStart(8)}${num(s.target).padStart(9)}${signedNum(s.compensation).padStart(8)}${num(s.measured).padStart(10)}${signedNum(s.diff).padStart(7)}`,
    ),
  ]
  if (r.seams.length) {
    lines.push('', 'seams:')
    for (const w of r.seams) lines.push(`  ${w.from} → ${w.to} at ${clock(w.time)}: ${w.dip} dB dip; sounding: ${w.sounding.join(', ') || 'nothing'}`)
  } else lines.push('', 'seams: no holes')
  if (r.credits.length) {
    lines.push('', 'sounds:')
    for (const c of r.credits) lines.push(`  ${c.sound}: ${c.credit || '(no credit given)'}`)
  }
  return lines.join('\n')
}
