import { type AdLibRule, type ScoreEvent, adlibAt, expand, wrap } from './expand.ts'
import type { Instrument, ScoreFile } from './parse.ts'
import { BAR, type Pedal } from './words.ts'

export const DEFAULT_SEED = 20261024

export const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export interface RenderOptions {
  variant?: string | null
  seed?: number | null
  passes?: number
}

export interface Rendering {
  title: string
  by: string
  after: string
  piece: { id: string; title: string; index: number; count: number }
  variant: string | null
  tempo: number
  tonic: number
  mode: string
  keys: { bar: number; tonic: number }[]
  bars: number
  sections: { bar: number; mark: string; label: string; tonic: number }[]
  instruments: Instrument[]
  events: ScoreEvent[]
  pedals: Pedal[]
  adlibs: AdLibRule[]
}

export const render = (score: ScoreFile, id = score.pieces[0]?.id ?? '', options: RenderOptions = {}): Rendering => {
  const piece = expand(score, id, options.variant ?? null)
  const loop = piece.loop
  const passes = loop ? Math.max(1, Math.floor(options.passes ?? 1)) : 1
  const span = loop ? loop.to - loop.from : 0
  const bars = piece.bars + (passes - 1) * span
  const random = options.seed === undefined || options.seed === null ? null : seeded(options.seed)
  const steps = new Map<number, ScoreEvent[]>()
  for (const e of piece.events) steps.set(e.step, [...(steps.get(e.step) ?? []), e])
  const events: ScoreEvent[] = []
  for (let step = 0; step < bars * BAR; step++) {
    const at = wrap(piece, step)
    for (const e of steps.get(at) ?? []) events.push({ ...e, step })
    if (!random) continue
    for (const rule of piece.adlibs) {
      const e = adlibAt(rule, at, random)
      if (e) events.push({ ...e, step })
    }
  }
  const repeats = (pass: number) => (pass * span + piece.bars - loop!.to) * BAR
  const pedals = [...piece.pedals]
  const sections = piece.sections.map(({ bar, mark, label, tonic }) => ({ bar, mark, label, tonic }))
  for (let pass = 1; pass < passes; pass++) {
    const shift = repeats(pass)
    pedals.push(...piece.pedals.filter((p) => p.at >= loop!.from * BAR).map((p) => ({ ...p, at: p.at + shift })))
    sections.push(...sections.filter((s) => s.bar >= loop!.from && s.bar < loop!.to).map((s) => ({ ...s, bar: s.bar + shift / BAR })))
  }
  return {
    title: score.title,
    by: score.by,
    after: score.after,
    piece: { id: piece.id, title: piece.title, index: score.pieces.findIndex((p) => p.id === piece.id), count: score.pieces.length },
    variant: piece.variant,
    tempo: piece.tempo,
    tonic: piece.tonic,
    mode: piece.mode,
    keys: sections.filter((s, i) => !i || s.tonic !== sections[i - 1].tonic).map((s) => ({ bar: s.bar, tonic: s.tonic })),
    bars,
    sections,
    instruments: score.instruments,
    events,
    pedals,
    adlibs: piece.adlibs,
  }
}
