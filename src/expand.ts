import { type AdLib, type Articulation, type Entry, type Part, type PieceSource, type Row, type ScoreFile, parseScore } from './parse.ts'
import { BAR, type Chord, type Pedal, type Ref, eighths, pitchName, resolve, resolves } from './words.ts'

export interface ScoreEvent {
  step: number
  offset: number
  inst: string
  articulation: Articulation | null
  part: string
  role: Ref['ref'] | null
  midi: number
  length: number
  written: number
  held?: number
  level: number
  velocity: number
  rolled: boolean
  lead: boolean
  inner: boolean
  gain: number
  attack?: number
}

export interface Voice {
  inst: string
  articulation: Articulation | null
}

export interface ExpandedSection {
  mark: string
  label: string
  bar: number
  bars: number
  tonic: number
  voices: Voice[]
}

export interface AdLibRule extends Omit<AdLib, 'avoid'>, Voice {
  part: string
  gain: number
  free: number[]
}

export interface Expanded {
  id: string
  title: string
  variant: string | null
  tempo: number
  tonic: number
  mode: string
  bars: number
  loop: { from: number; to: number } | null
  sections: ExpandedSection[]
  chords: Chord[]
  events: ScoreEvent[]
  pedals: Pedal[]
  adlibs: AdLibRule[]
}

type Playing = Omit<Part, 'doubles'> & { shift: number; line?: number }

const defined = (entry: Entry) => Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined)) as Partial<Entry>

const rowsFor = (piece: PieceSource, variant: string | null): Row[] => {
  const v = piece.variants.find((x) => x.name === variant)
  if (!v) return piece.rows
  return piece.rows.map((row) => {
    const entries = new Map(row.entries)
    for (const name of v.drop) entries.delete(name)
    for (const [to, from] of v.swaps) {
      const options = entries.get(from)
      if (!options) continue
      entries.delete(from)
      entries.set(to, options)
    }
    for (const [name, extra] of v.extras) {
      const options = entries.get(name)
      if (options) entries.set(name, { ...options, ...defined(extra), shift: options.shift + extra.shift })
    }
    return { ...row, entries }
  })
}

const playing = (score: ScoreFile, piece: PieceSource, part: Part): Playing => {
  const line = score.lines.get(part)
  if (!part.doubles) return { ...part, shift: 0, line }
  const source = piece.parts.find((x) => x.name === part.doubles!.source)!
  return {
    ...source,
    name: part.name,
    inst: part.inst ?? source.inst,
    articulation: part.articulation ?? source.articulation,
    dynamic: part.dynamic ?? source.dynamic,
    overlap: part.overlap ?? source.overlap,
    ring: part.ring ?? source.ring,
    once: part.once || source.once,
    lead: part.lead || source.lead,
    inner: part.inner || source.inner,
    shift: part.doubles.shift,
    line,
  }
}

export const pedalUntil = (pedals: Pedal[], onset: number, loop: Expanded['loop']) => {
  if (!pedals.length) return -Infinity
  const looping = loop && onset >= loop.from * BAR
  const last = pedals.findLast((p) => p.at <= onset) ?? (looping ? pedals.findLast((p) => p.at < loop.to * BAR) : null)
  if (!last?.down) return -Infinity
  const next = pedals.find((p) => p.at > onset)
  if (next) return next.at
  const first = looping ? pedals.find((p) => p.at >= loop.from * BAR) : null
  return first ? loop!.to * BAR + first.at - loop!.from * BAR : Infinity
}

export const wrap = (piece: Pick<Expanded, 'bars' | 'loop'>, step: number) => {
  const end = piece.bars * BAR
  if (step < end) return step
  if (!piece.loop) return -1
  const from = piece.loop.from * BAR
  return from + ((step - from) % (piece.loop.to * BAR - from))
}

export const expand = (score: ScoreFile, id: string, variant: string | null = null): Expanded => {
  const piece = score.pieces.find((p) => p.id === id)
  const fail = (at: number | undefined, message: string): never => {
    throw new Error(`${score.file} line ${at ?? '?'}: ${message}`)
  }
  if (!piece) return fail(undefined, `no piece "${id}"`)
  if (variant !== null && !piece.variants.some((v) => v.name === variant)) fail(score.lines.get(piece), `piece "${id}" has no variant "${variant}"`)
  const eighth = 30 / piece.tempo
  const rows = rowsFor(piece, variant ?? piece.variants[0]?.name ?? null)
  const sections: ExpandedSection[] = []
  const chords: Chord[] = []
  const events: ScoreEvent[] = []
  const pedals: Pedal[] = []
  const cuts: { at: number; all: boolean }[] = []
  const exempt = new Set<string>()
  const pianos = score.instruments.filter((i) => i.family === 'piano')
  const mixOf = (part: string, inst: string) => {
    const [a, b] = [piece.mix.get(part), piece.mix.get(inst)]
    return { gain: (a?.gain ?? 1) * (b?.gain ?? 1), ...((a?.attack ?? b?.attack) === undefined ? {} : { attack: a?.attack ?? b?.attack }) }
  }
  const adlibRows: { part: Playing; row: Row; bar: number; bars: number; opt: Entry }[] = []
  for (const row of rows) {
    const progression = piece.progressions.get(row.chords)!
    const unit = progression.barsPerChord * BAR
    const bar = chords.length
    const bars = progression.chords.length * progression.barsPerChord
    const voices = new Map<string, Voice>()
    const voice = (inst: string, articulation?: Articulation) => voices.set(`${inst} ${articulation ?? ''}`, { inst, articulation: articulation ?? null })
    for (const c of progression.chords)
      for (let k = 0; k < progression.barsPerChord; k++) chords.push({ symbol: c.symbol, bass: c.bass + row.key, tones: c.tones.map((t) => t + row.key) })
    if (row.cut) cuts.push({ at: bar * BAR, all: true })
    if (row.breath) cuts.push({ at: (bar + bars) * BAR - 1, all: false })
    for (const [name, opt] of row.entries) {
      const part = playing(score, piece, piece.parts.find((p) => p.name === name)!)
      if (part.once || part.lead) exempt.add(part.name)
      const playsIn = (k: number) => k >= (opt.bars?.[0] ?? 0) && k <= (opt.bars?.[1] ?? bars - 1)
      const [from, to] = opt.shade ?? [1, 1]
      const shade = (k: number) => from + (bars > 1 ? ((to - from) * k) / (bars - 1) : 0)
      const shift = row.key + opt.shift + part.shift
      const base = { part: part.name, articulation: part.articulation ?? null, lead: part.lead, inner: part.inner }
      if (part.adlib) {
        if (opt.dynamic !== undefined || opt.shade || opt.shift || opt.beats) fail(score.lines.get(row), `${name} is ad lib.; the form can only give it "bars 3-4"`)
        adlibRows.push({ part, row, bar, bars, opt })
        voice(part.inst!, part.articulation)
        continue
      }
      if (part.span) {
        if (part.span > bars * BAR) fail(part.line, `${name} lasts ${part.span / BAR} bars but ${row.mark} has ${bars}`)
        const inst = part.inst ?? fail(part.line, `part ${name} needs an instrument`)
        voice(inst, part.articulation)
        for (const n of part.notes) {
          const k = Math.floor(n.at / BAR)
          if (!playsIn(k) || (opt.beats && !opt.beats.includes(n.at % BAR))) continue
          const level = (opt.dynamic ?? n.dynamic ?? part.dynamic ?? fail(part.line, `${name} needs a dynamic`)) * shade(k)
          const length = part.ring ?? n.length + (part.overlap ?? 0)
          events.push({ ...base, ...mixOf(name, inst), inst, role: null, rolled: false, level, velocity: level, midi: n.midi + shift, length, written: n.length, offset: 0, step: bar * BAR + n.at })
        }
        continue
      }
      const starts = part.once ? [0] : progression.chords.map((_, i) => i * unit)
      for (const start of starts)
        for (const c of part.cues) {
          const where = score.lines.get(c)
          if (part.once && c.at >= bars * BAR) fail(where, `${row.mark} has only ${bars} bars`)
          if (!part.once && c.at >= unit) fail(where, `this count is past the end of a chord in ${row.mark}`)
          const at = start + c.at
          const k = Math.floor(at / BAR)
          if (!playsIn(k) || (opt.beats && !opt.beats.includes(at % BAR))) continue
          if (c.pedal !== undefined) {
            pedals.push({ at: bar * BAR + at + eighths(c.late, eighth), down: c.pedal, inst: part.inst ?? pianos[0]?.name ?? '' })
            continue
          }
          const inst = c.inst ?? part.inst ?? fail(where, `part ${name} needs an instrument`)
          const level = c.dynamic ?? opt.dynamic ?? part.dynamic ?? fail(where, `${name} needs a dynamic in ${row.mark}`)
          const chord = progression.chords[Math.floor(k / progression.barsPerChord)]
          for (const p of c.pitches) if (!resolves(p, chord)) fail(where, `${chord.symbol} has no ${pitchName(p)}`)
          voice(inst, part.articulation)
          const notes = c.pitches.flatMap((p) => resolve(p, chord))
          const late = eighths(c.late, eighth)
          const roll = eighths(c.roll, eighth)
          const rise = (i: number) => (c.rise === undefined || notes.length < 2 ? 0 : ((c.rise - level) * i) / (notes.length - 1))
          notes.forEach(({ midi, role }, i) =>
            events.push({
              ...base,
              ...mixOf(name, inst),
              inst,
              role,
              rolled: roll > 0,
              level: (level + rise(i)) * shade(k),
              velocity: (level + c.accent + rise(i)) * shade(k),
              midi: midi + shift,
              length: c.length,
              written: c.length,
              offset: late + i * roll,
              step: bar * BAR + at,
            }),
          )
        }
    }
    sections.push({ mark: row.mark, label: row.label, bar, bars, tonic: (piece.tonic + row.key + 12) % 12, voices: [...voices.values()] })
  }
  const total = chords.length
  const loopFrom = piece.loop && sections.find((s) => s.mark === (piece.loop!.from ?? sections[0].mark))!.bar
  const loop = piece.loop ? { from: loopFrom!, to: total } : null
  for (const { at } of cuts) pedals.push({ at, down: false, inst: pianos[0]?.name ?? '' })
  pedals.sort((a, b) => a.at - b.at || Number(a.down) - Number(b.down))
  for (const e of events) {
    const own = pedals.filter((p) => p.inst === e.inst)
    if (!own.length) continue
    const onset = e.step + e.offset
    const until = (loop ? pedalUntil(own, onset, loop) : Math.min(pedalUntil(own, onset, null), total * BAR)) - onset
    if (until <= e.length) continue
    e.held = e.length
    e.length = until
  }
  const seam = loop && rows[sections.findIndex((s) => s.bar === loop.from)].cut ? total * BAR : null
  const kept = events.filter((e) => {
    const pos = e.step + e.offset
    for (const { at, all } of cuts) {
      if (!all && exempt.has(e.part)) continue
      if (!all && pos >= at && pos < at + 1) return false
      if (pos < at && pos + e.length > at) e.length = at - pos
    }
    if (seam !== null && pos + e.length > seam) e.length = seam - pos
    return true
  })
  const adlibs = adlibRows.map(({ part, bar, bars, opt }) => {
    const { avoid, ...rule } = part.adlib!
    const busy = new Set(kept.filter((e) => e.part === avoid).map((e) => e.step))
    const free: number[] = []
    for (let k = opt.bars?.[0] ?? 0; k <= (opt.bars?.[1] ?? bars - 1); k++)
      for (let s = (bar + k) * BAR; s < (bar + k + 1) * BAR; s++) if (!busy.has(s)) free.push(s)
    return { ...rule, part: part.name, inst: part.inst!, articulation: part.articulation ?? null, gain: mixOf(part.name, part.inst!).gain, free }
  })
  return {
    id: piece.id,
    title: piece.title,
    variant: variant ?? piece.variants[0]?.name ?? null,
    tempo: piece.tempo,
    tonic: piece.tonic,
    mode: piece.mode,
    bars: total,
    loop,
    sections,
    chords,
    events: kept.sort((a, b) => a.step - b.step),
    pedals,
    adlibs,
  }
}

export const adlibAt = (rule: AdLibRule, step: number, random: () => number): ScoreEvent | null => {
  if (!rule.free.includes(step) || random() >= rule.chance) return null
  const lift = random() < rule.octave ? 12 : 0
  const midi = rule.notes[Math.floor(random() * rule.notes.length)] + lift
  const [lo, hi] = rule.dynamic
  const level = lo + random() * (hi - lo)
  return {
    step,
    offset: random() * rule.jitter,
    inst: rule.inst,
    articulation: rule.articulation,
    part: rule.part,
    role: null,
    midi,
    length: rule.length,
    written: rule.length,
    level,
    velocity: level,
    rolled: false,
    lead: false,
    inner: false,
    gain: rule.gain,
  }
}

export const checkScore = (text: string, file: string) => {
  const score = parseScore(text, file)
  for (const piece of score.pieces) for (const variant of piece.variants.length ? piece.variants.map((v) => v.name) : [null]) expand(score, piece.id, variant)
  return score
}
