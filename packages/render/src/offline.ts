import { BAR, DEFAULT_SEED, type Master, type Mix, type Rendering, type ScoreFile, type Space, checkScore, render } from 'plainscore'
import { measure, sectionLoudness, truePeak } from './loudness.ts'
import { balance, finish, masterEq } from './master.ts'
import { mixdown } from './mixdown.ts'
import { type Report, SEAM_DB, formatReport, seamCheck, soundingSpans } from './report.ts'
import { bankCredit } from './sources/soundfont.ts'
import { type Sounds, isSoundfont } from './sources/types.ts'
import { type Stem, renderStems, soundKey, timeline } from './stems.ts'

export { formatReport }

export const RATE = 48000
export const TAIL_FLOOR = -75
export const TAIL_PAD = 0.8

export interface Overrides {
  mix?: Mix
  space?: Space
  master?: Master
  loudness?: Record<string, number | null>
}

export interface OfflineOptions {
  piece?: string
  variant?: string | null
  seed?: number
  passes?: number
  rate?: number
  loop?: boolean
  seamDb?: number
  stems?: boolean
  muted?: string[]
  overrides?: Overrides
}

export const settingsOf = (r: Rendering, overrides: Overrides = {}) => ({
  mix: overrides.mix ?? r.mix,
  space: overrides.space ?? r.space,
  master: overrides.master ?? r.master,
  targets: r.sections.map((s) => (overrides.loudness && s.mark in overrides.loudness ? overrides.loudness[s.mark] : s.loudness)),
})

export const sectionSpans = (r: Rendering, length: number) => {
  const at = timeline(r)
  return r.sections.map((s, i) => ({ start: at(s.bar * BAR), end: i + 1 < r.sections.length ? at(r.sections[i + 1].bar * BAR) : length }))
}

export const credits = async (r: Rendering, sounds: Sounds) => {
  const used = [...new Set(r.events.map((e) => soundKey(e.inst, e.articulation)))]
  const keys = Object.keys(sounds).filter((k) => used.includes(k) || used.some((u) => u.startsWith(`${k} `)))
  return Promise.all(
    keys.map(async (sound) => {
      const s = sounds[sound]
      return { sound, credit: s.credit ?? (isSoundfont(s) ? await bankCredit(s.soundfont) : '') }
    }),
  )
}

const trim = (channels: Float32Array[], gainDb: number, rate: number) => {
  const floor = 10 ** ((TAIL_FLOOR - gainDb) / 20)
  let last = 0
  for (const x of channels) for (let i = x.length - 1; i > last; i--) if (Math.abs(x[i]) > floor) (last = i), (i = 0)
  const end = last + Math.round(TAIL_PAD * rate)
  return channels.map((x) => {
    const out = new Float32Array(end)
    out.set(x.subarray(0, Math.min(end, x.length)))
    return out
  })
}

const fadeOut = (channels: Float32Array[], seconds: number, rate: number) => {
  const n = Math.min(channels[0].length, Math.round(seconds * rate))
  if (!n) return channels
  const start = channels[0].length - n
  for (const x of channels) for (let i = 0; i < n; i++) x[start + i] *= 1 - (i + 1) / n
  return channels
}

const fold = (channels: Float32Array[], length: number) =>
  channels.map((x) => {
    const out = x.slice(0, length)
    for (let i = length; i < x.length; i++) out[(i - length) % length] += x[i]
    return out
  })

export const masterStems = (stems: Stem[], r: Rendering, rate: number, options: OfflineOptions & { credits?: Report['credits'] } = {}) => {
  const { mix, space, master, targets } = settingsOf(r, options.overrides)
  const dry = mixdown(stems, mix, space, rate, new Set(options.muted))
  const eq = masterEq(dry, master, rate)
  const songSeconds = timeline(r)(r.bars * BAR)
  const spans = sectionSpans(r, eq[0].length / rate)
  const balanced = balance(eq, spans.map((s, i) => ({ ...s, target: targets[i] })), master, rate)
  let shaped: Float32Array[]
  if (options.loop) shaped = fold(balanced.audio, Math.round(songSeconds * rate))
  else {
    const gain = master.loudness - measure(balanced.audio, rate).integrated
    shaped = fadeOut(trim(balanced.audio, gain, rate), master.fade, rate)
  }
  const done = finish(shaped, master, rate)
  const m = measure(done.audio, rate)
  const length = done.audio[0].length / rate
  const sections = r.sections.map((s, i) => {
    const end = Math.min(spans[i].end, length)
    const measured = sectionLoudness(m, spans[i].start, end)
    const finite = Number.isFinite(measured) ? Math.round(measured * 100) / 100 : null
    return {
      mark: s.mark,
      label: s.label,
      start: spans[i].start,
      end,
      target: targets[i],
      compensation: Math.round(balanced.compensation[i] * 100) / 100,
      measured: finite,
      diff: finite === null || targets[i] === null ? null : Math.round((finite - targets[i]!) * 100) / 100,
    }
  })
  const edges = r.sections.slice(1).map((s, i) => ({ from: r.sections[i].mark, to: s.mark, time: spans[i + 1].start }))
  const spansSounding = soundingSpans(r.events.filter((e) => !options.muted?.includes(e.inst)), timeline(r))
  const report: Report = {
    title: r.title,
    piece: r.piece.title,
    variant: r.variant,
    seconds: length,
    target: master.loudness,
    ceiling: master.ceiling,
    integrated: m.integrated,
    range: m.range,
    truePeak: truePeak(done.audio),
    gain: done.gain,
    limiter: { maxReduction: done.maxReduction, overOneDb: done.overOneDb },
    sections,
    seams: seamCheck(done.audio, rate, edges, spansSounding, options.seamDb ?? SEAM_DB),
    credits: options.credits ?? [],
  }
  return { audio: done.audio, report }
}

export const renderOffline = async (score: ScoreFile | string, sounds: Sounds, options: OfflineOptions = {}) => {
  const parsed = typeof score === 'string' ? checkScore(score, 'score') : score
  const rate = options.rate ?? RATE
  const r = render(parsed, options.piece ?? parsed.pieces[0].id, { variant: options.variant, seed: options.seed ?? DEFAULT_SEED, passes: options.passes, perform: true })
  const { stems } = await renderStems(r, sounds, rate)
  const { audio, report } = masterStems(stems, r, rate, { ...options, credits: await credits(r, sounds) })
  return { audio, report, rendering: r, ...(options.stems ? { stems } : {}) }
}
