export type Time = { ms: number } | { eighths: number }
export type Ref = { ref: 'bass' | 'fifth' | 't' | 'v' | 'top' | 'chord' | 'upper'; index: number; shift: number }
export type Pitch = number | Ref

export interface Cue {
  at: number
  inst?: string
  pitches: Pitch[]
  length: number
  dynamic?: number
  rise?: number
  accent: number
  roll: Time
  late: Time
  pedal?: boolean
}

export interface Pedal {
  at: number
  down: boolean
  inst: string
}

export interface Chord {
  symbol: string
  bass: number
  tones: number[]
}

export interface LineNote {
  at: number
  midi: number
  length: number
  dynamic?: number
}

export const BAR = 8
export const DYNAMICS: Record<string, number> = { pppp: 0.1, ppp: 0.16, pp: 0.22, p: 0.32, mp: 0.42, mf: 0.5, f: 0.55 }
export const MARKS: Record<string, number> = { '>': 0.08, soft: -0.07, softer: -0.14 }
export const SHIFTS: Record<string, number> = { '5th': 7, '8va': 12, '15ma': 24, '8vb': -12, '15mb': -24 }
export const MODES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
}
const NOTE_VALUES: Record<string, number> = { w: 8, h: 4, q: 2, e: 1, s: 0.5 }
const PITCH_CLASSES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

export const isDuration = (word: string) => /^[whqes]\.?(\+[whqes]\.?)*$/.test(word)

export const duration = (word: string) => {
  if (!isDuration(word)) throw new Error(`"${word}" is not a duration`)
  return word.split('+').reduce((sum, term) => sum + NOTE_VALUES[term[0]] * (term.endsWith('.') ? 1.5 : 1), 0)
}

export const time = (word: string): Time => {
  const ms = word.match(/^(\d+(?:\.\d+)?)ms$/)
  return ms ? { ms: Number(ms[1]) } : { eighths: duration(word) }
}

export const eighths = (t: Time, eighth: number) => ('ms' in t ? t.ms / 1000 / eighth : t.eighths)

const accidental = (sign?: string) => (sign === '#' ? 1 : sign === 'b' ? -1 : 0)

export const tonic = (word: string) => {
  const m = word.match(/^([A-G])(#|b)?$/)
  if (!m) throw new Error(`"${word}" is not a key`)
  return (PITCH_CLASSES[m[1]] + accidental(m[2]) + 12) % 12
}

export const note = (word: string) => {
  const m = word.match(/^([A-G])(#|b)?(-?\d)$/)
  if (!m) throw new Error(`"${word}" is not a pitch`)
  return (Number(m[3]) + 1) * 12 + PITCH_CLASSES[m[1]] + accidental(m[2])
}

const pitch = (word: string): Pitch => {
  if (/^[A-G]/.test(word)) return note(word)
  const m = word.match(/^(bass|fifth|top|chord|upper|t(\d)|v(\d))((?:\+(?:5th|8va|15ma|8vb|15mb))*)$/)
  if (!m) throw new Error(`"${word}" is not a pitch`)
  const shift = m[4].split('+').slice(1).reduce((sum, s) => sum + SHIFTS[s], 0)
  if (m[2] || m[3]) return { ref: m[2] ? 't' : 'v', index: Number(m[2] ?? m[3]) - 1, shift }
  return { ref: m[1] as Ref['ref'], index: 0, shift }
}

export const dynamic = (word: string) => {
  if (!(word in DYNAMICS)) throw new Error(`"${word}" is not a dynamic`)
  return DYNAMICS[word]
}

const count = (word: string) => {
  const m = word.match(/^(?:([1-9]\d*)\.)?([1-9])(&)?$/)
  if (!m || Number(m[2]) > BAR / 2) throw new Error(`"${word}" is not a count in 4/4`)
  return (Number(m[1] ?? 1) - 1) * BAR + (Number(m[2]) - 1) * 2 + (m[3] ? 1 : 0)
}

export const cue = (words: string[], isInst: (word: string) => boolean): Cue => {
  const [first, ...rest] = words
  const out: Cue = { at: count(first), pitches: [], length: 0, accent: 0, roll: { ms: 0 }, late: { ms: 0 } }
  if (rest[0] === 'Ped.' || rest[0] === '*') {
    const [mark, ...more] = rest
    out.pedal = mark === 'Ped.'
    if (more[0] === 'late') out.late = time(more[1] ?? '')
    else if (more.length) throw new Error('a pedal cue is "<count> Ped." or "<count> *", optionally "late X"')
    return out
  }
  if (rest.length && isInst(rest[0])) out.inst = rest.shift()
  while (rest.length && !isDuration(rest[0])) out.pitches.push(pitch(rest.shift()!))
  if (!out.pitches.length || !rest.length) throw new Error('a cue needs a count, pitches and a duration')
  out.length = duration(rest.shift()!)
  while (rest.length) {
    const word = rest.shift()!
    if (word === 'roll' || word === 'late') out[word] = time(rest.shift() ?? '')
    else if (word in MARKS) out.accent += MARKS[word]
    else if (word.includes('-')) [out.dynamic, out.rise] = word.split('-').map(dynamic)
    else out.dynamic = dynamic(word)
  }
  return out
}

export const line = (bars: string) => {
  const notes: LineNote[] = []
  let at = 0
  let level: number | undefined
  for (const bar of bars.split('|').map((b) => b.trim()).filter(Boolean)) {
    const words = bar.split(/\s+/)
    const start = at
    for (let i = 0; i < words.length; i += 2) {
      if (words[i] in DYNAMICS) level = DYNAMICS[words[i++]]
      const length = duration(words[i + 1] ?? '')
      if (words[i] !== 'r') notes.push({ at, midi: note(words[i]), length, ...(level === undefined ? {} : { dynamic: level }) })
      at += length
    }
    if (at - start !== BAR) throw new Error(`bar "${bar}" lasts ${at - start} eighths, not ${BAR}`)
  }
  return { notes, span: at }
}

export const prose = (words: string[]) => {
  const dash = words.indexOf('—')
  return dash < 0 ? words : words.slice(0, dash)
}

export const header = (key: string, words: string[], shape: RegExp, example: string) => {
  const value = prose(words).join(' ').match(shape)
  if (!value) throw new Error(`write it as "${key}  ${example}"`)
  return value
}

export const fifthOf = (chord: Chord) => chord.bass + [7, 8, 9, 5, 4, 3].find((i) => chord.tones.some((t) => (t - chord.bass - i) % 12 === 0))!

export const resolves = (pitch: Pitch, chord: Chord) =>
  typeof pitch === 'number' || (pitch.ref !== 't' && pitch.ref !== 'v') || pitch.index < chord.tones.length

export const resolve = (pitch: Pitch, chord: Chord): { midi: number; role: Ref['ref'] | null }[] => {
  if (typeof pitch === 'number') return [{ midi: pitch, role: null }]
  const { tones } = chord
  const base = {
    bass: [chord.bass],
    fifth: [fifthOf(chord)],
    t: [tones[pitch.index]],
    v: [tones[pitch.index]],
    top: [tones[tones.length - 1]],
    chord: tones,
    upper: tones.slice(1),
  }[pitch.ref]
  return base.map((n) => ({ midi: n + pitch.shift, role: pitch.ref }))
}

export const pitchName = (p: Pitch) => (typeof p === 'number' ? String(p) : p.ref + (p.index + 1))
