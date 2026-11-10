import { BAR, DEFAULT_SEED, type Rendering, type ScoreEdits, type ScoreFile, checkScore, readEdits, render, rewriteScore } from 'plainscore'
import { type Overrides, RATE, credits, masterStems, sectionSpans } from './offline.ts'
import type { Report } from './report.ts'
import type { Sounds } from './sources/types.ts'
import { type Stem, TAIL, renderStems, stemTarget, timeline } from './stems.ts'

export type Curve = { step: number; window: number; values: number[] }

export interface SessionProgress {
  stage: 'rendering' | 'measuring'
}

export interface SessionOptions {
  text: string
  name: string
  piece: string
  variant: string | null
  sounds: Sounds
  onProgress?: (progress: SessionProgress) => void
}

const merge = (spans: [number, number][], gap = 0.25) => {
  const sorted = [...spans].sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const [a, b] of sorted) {
    const last = out.at(-1)
    if (last && a <= last[1] + gap) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out.map(([a, b]) => [Math.round(a * 100) / 100, Math.round(b * 100) / 100] as [number, number])
}

export const inspectScore = (text: string, name: string) => ({
  pieces: checkScore(text, name).pieces.map((p) => ({ id: p.id, title: p.title, variants: p.variants.map((v) => v.name) })),
})

const renderOf = (score: ScoreFile, piece: string, variant: string | null) => render(score, piece, { variant, seed: DEFAULT_SEED, perform: true })

export const planScore = (text: string, name: string, piece: string, variant: string | null) => {
  const r = renderOf(checkScore(text, name), piece, variant)
  return { seconds: timeline(r)(r.bars * BAR) + TAIL, stems: new Set(r.events.map((e) => stemTarget(r, e))).size }
}

interface Loaded {
  text: string
  score: ScoreFile
  rendering: Rendering
  stems: Stem[]
  credits: Report['credits']
  report: Report
  curve: Curve
  version: number
}

export const createSession = async (options: SessionOptions) => {
  const { name, piece, variant, sounds } = options

  const load = async (text: string, version: number, keepStems?: Stem[]): Promise<Loaded> => {
    const score = checkScore(text, name)
    const rendering = renderOf(score, piece, variant)
    if (!keepStems) options.onProgress?.({ stage: 'rendering' })
    const stems = keepStems ?? (await renderStems(rendering, sounds, RATE)).stems
    const credit = await credits(rendering, sounds)
    options.onProgress?.({ stage: 'measuring' })
    const { report, curve } = masterStems(stems, rendering, RATE, { credits: credit })
    return { text, score, rendering, stems, credits: credit, report, curve, version }
  }

  let state = await load(options.text, 1)

  const overridesOf = (edits: ScoreEdits): Overrides => {
    const r = renderOf(checkScore(rewriteScore(state.text, piece, edits), name), piece, variant)
    return { mix: r.mix, space: r.space, master: r.master, loudness: Object.fromEntries(r.sections.map((s) => [s.mark, s.loudness])) }
  }

  const describe = () => {
    const r = state.rendering
    const spans = sectionSpans(r, state.stems[0]?.channels[0].length / RATE || 0)
    const at = timeline(r)
    const sounding = r.events.map((e) => ({ part: e.part, target: stemTarget(r, e), start: at(e.step + e.offset), end: at(e.step + e.offset + e.length) }))
    const partInst = Object.fromEntries(
      Object.keys(r.mix.parts).map((p) => [p, [...new Set(r.events.filter((e) => e.part === p).map((e) => e.inst))].join(' ')]),
    )
    return {
      version: state.version,
      title: r.title,
      piece: r.piece,
      variant: r.variant,
      tempo: r.tempo,
      bars: r.bars,
      sections: r.sections.map((s, i) => ({
        mark: s.mark,
        label: s.label,
        start: spans[i].start,
        end: spans[i].end,
        tonic: s.tonic,
        keyChange: s.tonic !== r.tonic,
        parts: [...new Set(sounding.filter((e) => e.start < spans[i].end && e.end > spans[i].start).map((e) => e.part))].sort(),
      })),
      stems: state.stems.map((s, i) => ({ index: i, target: s.target, kind: s.kind, insts: s.insts })),
      edits: readEdits(state.score, piece) as Required<ScoreEdits>,
      mix: r.mix,
      partInst,
      report: state.report,
      curve: state.curve,
      lanes: state.stems.map((st) => ({ target: st.target, spans: merge(sounding.filter((e) => e.target === st.target).map((e) => [e.start, e.end])) })),
      text: state.text,
    }
  }

  return {
    describe,
    get text() {
      return state.text
    },
    get version() {
      return state.version
    },
    get stems() {
      return state.stems
    },
    get rendering() {
      return state.rendering
    },
    measure(edits: ScoreEdits) {
      const { report, curve } = masterStems(state.stems, state.rendering, RATE, { credits: state.credits, overrides: overridesOf(edits) })
      return { report, curve }
    },
    master(edits: ScoreEdits) {
      return masterStems(state.stems, state.rendering, RATE, { credits: state.credits, overrides: overridesOf(edits) })
    },
    rewrite(edits: ScoreEdits) {
      const text = rewriteScore(state.text, piece, edits)
      checkScore(text, name)
      return text
    },
    async apply(text: string, keepStems: boolean) {
      state = await load(text, state.version + 1, keepStems ? state.stems : undefined)
    },
  }
}

export type Session = Awaited<ReturnType<typeof createSession>>
export type SessionState = ReturnType<Session['describe']>
