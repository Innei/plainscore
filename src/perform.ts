import type { ScoreEvent } from './expand.ts'
import type { Perform } from './parse.ts'
import { BAR } from './words.ts'

export interface Performable {
  bars: number
  clock: number[]
  events: ScoreEvent[]
  sections: { bar: number }[]
  perform: Perform | null
}

const PUSH_UNTIL = 0.8
const PUSH = 0.6
const VELOCITY_NOISE = 0.06

// Pressing on through the phrase and broadening into its end is the shape a pianist's tempo takes; it is never a random wobble.
const rubato = (x: number) => (x < PUSH_UNTIL ? PUSH * Math.sin((Math.PI * x) / PUSH_UNTIL) : -(((x - PUSH_UNTIL) / (1 - PUSH_UNTIL)) ** 2))

const metric = (pos: number, accents: number) => {
  const at = pos % BAR
  if (Math.abs(at - Math.round(at)) > 1e-6) return -accents
  if (at === 0) return accents
  if (at === 4) return accents / 2
  return at % 2 ? -accents / 2 : 0
}

export const perform = (r: Performable, random: () => number): { clock: number[]; events: ScoreEvent[] } => {
  const p = r.perform
  if (!p) return { clock: r.clock, events: r.events }
  const starts = [...new Set(r.sections.map((s) => s.bar))].sort((a, b) => a - b)
  const phrase = (pos: number) => {
    const bar = pos / BAR
    const i = starts.findLastIndex((s) => s <= bar)
    const from = (starts[i] ?? 0) * BAR
    const until = (starts[i + 1] ?? r.bars) * BAR
    const span = p.phrase * BAR
    const start = from + Math.floor((pos - from) / span) * span
    return (pos - start) / (Math.min(start + span, until) - start)
  }
  const clock = r.clock.map((d, s) => d / (1 + p.rubato * rubato(phrase(s + 0.5))))
  const chords = new Map<string, ScoreEvent[]>()
  for (const e of r.events) {
    if (e.lead || e.rolled) continue
    const key = `${e.inst} ${(e.step + e.offset).toFixed(6)}`
    chords.set(key, [...(chords.get(key) ?? []), e])
  }
  const spread = new Map<ScoreEvent, number>()
  for (const group of chords.values()) [...group].sort((a, b) => a.midi - b.midi).forEach((e, i) => spread.set(e, i * p.spread))
  const events = r.events.map((e) => {
    const pos = e.step + e.offset
    const x = phrase(pos)
    const shape = (1 + metric(pos, p.accents)) * (1 + p.swell * (Math.sin(Math.PI * x) - 0.5))
    const velocity = e.velocity * shape * (1 + (random() - 0.5) * VELOCITY_NOISE)
    const seconds = (e.lead ? -p.lead : 0) + (spread.get(e) ?? 0) + (random() - 0.5) * p.jitter * (e.lead ? 0.5 : 1)
    const offset = Math.max(-e.step, e.offset + seconds / clock[Math.min(e.step, clock.length - 1)])
    return { ...e, velocity, offset }
  })
  return { clock, events }
}
