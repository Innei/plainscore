import { FAMILIES as FAMILY_TABLE } from './families.ts'
import { type Chord, type Cue, DYNAMICS, type LineNote, MODES, SHIFTS, cue, duration, dynamic, header, line, note, prose, tonic } from './words.ts'

export const VERSION = '0.1'
export const FAMILIES = Object.keys(FAMILY_TABLE)
export const ARTICULATIONS = ['pizz.', 'arco'] as const
export type Articulation = (typeof ARTICULATIONS)[number]

export interface Instrument {
  name: string
  family: string
}

export interface AdLib {
  chance: number
  notes: number[]
  octave: number
  dynamic: [number, number]
  length: number
  jitter: number
  avoid: string | null
}

export interface Part {
  name: string
  inst?: string
  articulation?: Articulation
  dynamic?: number
  overlap?: number
  ring?: number
  once: boolean
  lead: boolean
  inner: boolean
  doubles?: { source: string; shift: number }
  adlib?: AdLib
  cues: Cue[]
  notes: LineNote[]
  span: number
}

export interface Entry {
  dynamic?: number
  shade?: [number, number]
  shift: number
  bars?: [number, number]
  beats?: number[]
}

export interface Row {
  mark: string
  label: string
  chords: string
  key: number
  breath: boolean
  cut: boolean
  entries: Map<string, Entry>
}

export interface Variant {
  name: string
  drop: string[]
  swaps: [string, string][]
  extras: Map<string, Entry>
}

export interface Progression {
  barsPerChord: number
  chords: Chord[]
}

export interface PieceSource {
  id: string
  title: string
  tempo: number
  tonic: number
  mode: string
  progressions: Map<string, Progression>
  parts: Part[]
  rows: Row[]
  loop: { from: string | null } | null
  variants: Variant[]
  mix: Map<string, { gain: number; attack?: number }>
}

export interface ScoreFile {
  file: string
  title: string
  by: string
  after: string
  instruments: Instrument[]
  pieces: PieceSource[]
  lines: WeakMap<object, number>
}

const COUNTS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 }
const WITHIN: Record<string, number> = { eighth: 1, sixteenth: 0.5, quarter: 2 }

const transpose = (from: number, to: number) => {
  const up = (to - from + 12) % 12
  return up > 6 ? up - 12 : up
}

export const entry = (words: string[]): Entry => {
  const out: Entry = { shift: 0 }
  while (words.length) {
    const word = words.shift()!
    const shade = word.match(/^(\d+)%(?:-(\d+)%)?$/)
    if (word in DYNAMICS) out.dynamic = DYNAMICS[word]
    else if (word in SHIFTS) out.shift += SHIFTS[word]
    else if (shade) out.shade = [Number(shade[1]) / 100, Number(shade[2] ?? shade[1]) / 100]
    else if (word === 'bars') {
      const range = words.shift()?.match(/^(\d+)-(\d+)$/)
      if (!range) throw new Error('write a bar range as "bars 3-4"')
      out.bars = [Number(range[1]) - 1, Number(range[2]) - 1]
    } else if (word === 'on') {
      const beats = words.join(' ').match(/^([1-4](?: and [1-4])*)$/)
      if (!beats) throw new Error('write it as "on 1 and 3"')
      out.beats = beats[1].split(' and ').map((b) => (Number(b) - 1) * 2)
      words.length = 0
    } else throw new Error(`unknown option "${word}"`)
  }
  return out
}

const adLib = (rows: string[][]): AdLib => {
  const field = (key: string, shape: RegExp, example: string) => {
    const row = rows.find((words) => words[0] === key)
    const value = row && prose(row.slice(1)).join(' ').match(shape)
    if (!value) throw new Error(`an ad lib. part needs "${key}  ${example}"`)
    return value
  }
  const chance = field('chance', /^(\d+)%$/, '22%')
  const notes = field('notes', /^([A-G][#b]?) (\w+), (\S+) to (\S+), 8va (\d+)% of the time$/, 'D lydian, D6 to C#7, 8va 30% of the time')
  if (!MODES[notes[2]]) throw new Error(`unknown mode "${notes[2]}"`)
  const [, lo, hi] = field('dynamic', /^(\w+)-(\w+)$/, 'pppp-pp')
  const [, within] = field('timing', /^anywhere within the (eighth|sixteenth|quarter)$/, 'anywhere within the eighth')
  const avoid = rows.find((words) => words[0] === 'avoid')
  const scale = MODES[notes[2]].map((step) => (step + tonic(notes[1])) % 12)
  const range = Array.from({ length: note(notes[4]) - note(notes[3]) + 1 }, (_, i) => note(notes[3]) + i)
  return {
    chance: Number(chance[1]) / 100,
    notes: range.filter((n) => scale.includes(n % 12)),
    octave: Number(notes[5]) / 100,
    dynamic: [dynamic(lo), dynamic(hi)],
    length: duration(field('length', /^(\S+)$/, 'h.')[1]),
    jitter: WITHIN[within],
    avoid: avoid ? (prose(avoid.slice(1))[0] ?? null) : null,
  }
}

const partHeader = (words: string[], isInst: (word: string) => boolean): Part & { adlibRows?: string[][] } => {
  const [name, ...rest] = prose(words)
  if (!name) throw new Error('name the part, as "part flow  piano"')
  if (isInst(name)) throw new Error(`"${name}" is an instrument; give the part its own name`)
  const part: Part & { adlibRows?: string[][] } = { name, once: false, lead: false, inner: false, cues: [], notes: [], span: 0 }
  while (rest.length) {
    const word = rest.shift()!
    if (isInst(word) && !part.inst) {
      part.inst = word
      if ((ARTICULATIONS as readonly string[]).includes(rest[0])) part.articulation = rest.shift() as Articulation
    } else if ((ARTICULATIONS as readonly string[]).includes(word)) throw new Error(`write "${word}" right after the instrument, as "violins ${word}"`)
    else if (word in DYNAMICS) part.dynamic = DYNAMICS[word]
    else if (word === 'overlap' || word === 'ring') part[word] = duration(rest.shift() ?? '')
    else if (word === 'once' || word === 'lead' || word === 'inner') part[word] = true
    else if (word === 'doubles') {
      const source = rest.shift()
      if (!source) throw new Error('write it as "doubles theme"')
      part.doubles = { source, shift: rest[0] in SHIFTS ? SHIFTS[rest.shift()!] : 0 }
    } else if (word === 'ad' && rest[0] === 'lib.') {
      rest.shift()
      part.adlibRows = []
    } else if (word === 'attack' || word === 'dB' || /^[+-]\d/.test(word)) throw new Error(`"${word}" is mixing; put it in the piece's mix block`)
    else if (word.endsWith(':')) throw new Error('scene rules are gone; edit the part in a variant, as "read  melody on 1 and 3"')
    else throw new Error(`unknown word "${word}" in the part header; put notes to the reader after "—"`)
  }
  return part
}

const variantRow = (words: string[]): Variant => {
  const [name, ...rest] = prose(words)
  const out: Variant = { name, drop: [], swaps: [], extras: new Map() }
  for (const item of rest.join(' ').split(',').map((x) => x.trim()).filter(Boolean)) {
    const edit = item.split(/\s+/)
    if (edit[0] === 'drop' && edit.length === 2) out.drop.push(edit[1])
    else if (edit[1] === 'for' && edit.length === 3) out.swaps.push([edit[0], edit[2]])
    else if (edit.length > 1) out.extras.set(edit[0], entry(edit.slice(1)))
    else throw new Error(`"${item}" is not an edit; write "drop P", "Q for P" or "P <options>"`)
  }
  return out
}

const mixRow = (words: string[]) => {
  const [target, ...rest] = prose(words)
  const out: { gain: number; attack?: number } = { gain: 1 }
  while (rest.length) {
    const word = rest.shift()!
    const percent = word.match(/^(\d+(?:\.\d+)?)%$/)
    if (/^[+-]\d+(\.\d+)?$/.test(word) && rest[0] === 'dB') {
      rest.shift()
      out.gain *= 10 ** (Number(word) / 20)
    } else if (percent) out.gain *= Number(percent[1]) / 100
    else if (word === 'attack') {
      const ms = rest.shift()?.match(/^(\d+(?:\.\d+)?)ms$/)
      if (!ms) throw new Error('write the attack in ms, as "attack 200ms"')
      out.attack = Number(ms[1]) / 1000
    } else throw new Error(`unknown word "${word}" in the mix; use "+3 dB", "75%" or "attack 200ms"`)
  }
  return { target, ...out }
}

export const parseScore = (text: string, file = 'score'): ScoreFile => {
  const score: ScoreFile = { file, title: '', by: '', after: '', instruments: [], pieces: [], lines: new WeakMap() }
  const { lines } = score
  const isInst = (word: string) => score.instruments.some((i) => i.name === word)
  const adlibs = new Map<Part, { rows: string[][]; line: number }>()
  const rowText = new Map<Row, string[]>()
  let version = ''
  let block = ''
  let piece: PieceSource | null = null
  const fail = (at: number | undefined, message: string): never => {
    throw new Error(`${file} line ${at ?? '?'}: ${message}`)
  }
  text.split('\n').forEach((source, i) => {
    const raw = source.trim()
    const indent = source.search(/\S/)
    if (indent < 0 || raw.startsWith('#')) return
    const words = raw.split(/\s+/)
    const n = i + 1
    try {
      if (!version) {
        if (indent !== 0 || words[0] !== 'score' || words[1] !== VERSION || words.length > 2) throw new Error(`start the file with "score ${VERSION}"`)
        version = words[1]
        return
      }
      if (indent === 0) {
        const [key, ...rest] = words
        block = key
        if (key === 'title' || key === 'by' || key === 'after') {
          if (piece) throw new Error(`put "${key}" before the first piece`)
          score[key] = raw.slice(key.length).trim()
        } else if (key === 'instruments') {
          if (piece) throw new Error('declare the instruments before the first piece')
        } else if (key === 'piece') {
          if (!rest[0] || !/^[a-z][\w-]*$/i.test(rest[0])) throw new Error('write it as "piece <id>  <title>", with an id like "theme"')
          if (score.pieces.some((p) => p.id === rest[0])) throw new Error(`there is already a piece "${rest[0]}"`)
          piece = { id: rest[0], title: rest.slice(1).join(' '), tempo: 0, tonic: -1, mode: 'major', progressions: new Map(), parts: [], rows: [], loop: null, variants: [], mix: new Map() }
          score.pieces.push(piece)
          lines.set(piece, n)
        } else throw new Error(`unknown "${key}"`)
        return
      }
      if (!piece) {
        if (block !== 'instruments' || indent !== 2) throw new Error('unexpected line')
        const [name, family, ...rest] = prose(words)
        if (!family || rest.length) throw new Error('instrument rows look like "<name>  <family>"')
        if (!FAMILIES.includes(family)) throw new Error(`unknown family "${family}"; use one of ${FAMILIES.join(' ')}`)
        if (isInst(name)) throw new Error(`"${name}" is declared twice`)
        score.instruments.push({ name, family })
        return
      }
      const p = piece
      if (indent === 2) {
        const [key, ...rest] = words
        block = key
        if (key === 'meter') header(key, rest, /^4\/4$/, '4/4 (v0.1 only supports 4/4)')
        else if (key === 'tempo') p.tempo = Number(header(key, rest, /^q = (\d+)$/, 'q = 80')[1])
        else if (key === 'key') {
          const [, root, mode] = header(key, rest, /^([A-G][#b]?) (\w+)$/, 'D major')
          if (!MODES[mode]) throw new Error(`unknown mode "${mode}"`)
          p.tonic = tonic(root)
          p.mode = mode
        } else if (key === 'variants' || key === 'mix') {
          if (prose(rest).length) throw new Error(`"${key}" takes no words; list its rows below it`)
        } else if (key === 'chords') {
          const [, name, bars] = header(key, rest, /^(\S+)(?: (one|two|three|four|\d+) bars? each)?$/, 'theme  two bars each')
          if (p.progressions.has(name)) throw new Error(`there is already a chord set "${name}"`)
          p.progressions.set(name, { barsPerChord: bars ? (COUNTS[bars] ?? Number(bars)) : 1, chords: [] })
          block = `chords ${name}`
        } else if (key === 'part') {
          const part = partHeader(rest, isInst)
          if (p.parts.some((x) => x.name === part.name)) throw new Error(`there is already a part "${part.name}"`)
          if (part.adlibRows) adlibs.set(part, { rows: part.adlibRows, line: n })
          delete part.adlibRows
          p.parts.push(part)
          lines.set(part, n)
        } else if (key === 'form') {
          const [, loop, from] = header(key, rest, /^(?:(loop)(?: from (\S+))?)?$/, 'loop from A1')
          p.loop = loop ? { from: from ?? null } : null
          lines.set(p.rows, n)
        } else throw new Error(`unknown "${key}"`)
        return
      }
      if (block.startsWith('chords ')) {
        const [symbol, bass, bar, ...tones] = prose(words)
        const latest = [...p.progressions.values()].flatMap((x) => x.chords).findLast((c) => c.symbol === symbol)
        if (bass === undefined && !latest) throw new Error(`"${symbol}" has no voicing yet; write "<symbol> <bass> | <voicing>"`)
        if (bass !== undefined && bar !== '|') throw new Error('chord rows look like "<symbol> <bass> | <voicing>"')
        p.progressions.get(block.slice(7))!.chords.push(bass === undefined ? latest! : { symbol, bass: note(bass), tones: tones.map(note) })
      } else if (block === 'part') {
        const part = p.parts[p.parts.length - 1]
        const adlib = adlibs.get(part)
        if (adlib) adlib.rows.push(words)
        else if (part.doubles) throw new Error(`${part.name} doubles ${part.doubles.source}; it has no notes of its own`)
        else if (raw.startsWith('|')) {
          if (part.cues.length) throw new Error('bars and cues cannot share a part')
          const bars = line(raw)
          part.notes.push(...bars.notes.map((x) => ({ ...x, at: x.at + part.span })))
          part.span += bars.span
        } else {
          if (part.span) throw new Error('bars and cues cannot share a part')
          const parsed = cue(words, isInst)
          lines.set(parsed, n)
          part.cues.push(parsed)
        }
      } else if (block === 'form' && indent === 4) {
        const dash = words.indexOf('—')
        const [mark, chords, ...key] = prose(words)
        if (!chords) throw new Error('form rows start "<mark> <chords>", as "A1  theme"')
        if (key.length && key[0] !== 'in') throw new Error(`write a key change as "${chords} in E"`)
        if (key.length && p.tonic < 0) throw new Error('give the piece a key before changing it')
        const shift = key.length ? transpose(p.tonic, tonic(header('in', key.slice(1), /^([A-G][#b]?)$/, 'E')[1])) : 0
        const row: Row = { mark, chords, key: shift, breath: false, cut: false, entries: new Map(), label: dash < 0 ? mark : words.slice(dash + 1).join(' ') }
        p.rows.push(row)
        rowText.set(row, [])
        lines.set(row, n)
      } else if (block === 'form' && indent > 4 && p.rows.length) rowText.get(p.rows[p.rows.length - 1])!.push(raw)
      else if (block === 'variants' && indent === 4) {
        const variant = variantRow(words)
        if (p.variants.some((v) => v.name === variant.name)) throw new Error(`there is already a variant "${variant.name}"`)
        p.variants.push(variant)
        lines.set(variant, n)
      } else if (block === 'mix' && indent === 4) {
        const { target, ...mix } = mixRow(words)
        lines.set(mix, n)
        p.mix.set(target, mix)
      } else throw new Error('unexpected line')
    } catch (error) {
      fail(n, (error as Error).message)
    }
  })
  if (!version) fail(undefined, `start the file with "score ${VERSION}"`)
  for (const [part, { rows, line: at }] of adlibs) {
    try {
      part.adlib = adLib(rows)
    } catch (error) {
      fail(at, (error as Error).message)
    }
  }
  for (const p of score.pieces) checkPiece(score, p, rowText, fail)
  return score
}

const checkPiece = (score: ScoreFile, p: PieceSource, rowText: Map<Row, string[]>, fail: (at: number | undefined, message: string) => never) => {
  const { lines } = score
  const at = lines.get(p)
  if (!p.tempo || p.tonic < 0 || !p.rows.length) fail(at, `piece "${p.id}" needs a tempo, a key and a form`)
  const part = (name: string) => p.parts.find((x) => x.name === name)
  const isPart = (name: string) => Boolean(part(name))
  for (const row of p.rows) {
    if (!p.progressions.has(row.chords)) fail(lines.get(row), `no chord set "${row.chords}"`)
    for (const item of rowText.get(row)!.join(' ').split(',').map((x) => x.trim()).filter(Boolean)) {
      const [name, ...opts] = item.split(/\s+/)
      if (name === 'breath' || name === 'cut') {
        row[name] = true
        continue
      }
      if (!isPart(name)) fail(lines.get(row), `"${name}" is not a part`)
      if (row.entries.has(name)) fail(lines.get(row), `${name} is named twice in ${row.mark}`)
      try {
        row.entries.set(name, entry(opts))
      } catch (error) {
        fail(lines.get(row), (error as Error).message)
      }
    }
  }
  if (p.loop?.from && !p.rows.some((r) => r.mark === p.loop!.from)) fail(lines.get(p.rows), `no section "${p.loop.from}" to loop from`)
  const sources = new Set([...p.parts.flatMap((x) => (x.doubles ? [x.doubles.source] : [])), ...p.variants.flatMap((v) => v.swaps.map(([to]) => to))])
  for (const x of p.parts) {
    const where = lines.get(x)
    if (x.doubles) {
      const source = part(x.doubles.source)
      if (!source) fail(where, `"${x.doubles.source}" is not a part`)
      if (source!.doubles || source!.adlib) fail(where, `${x.name} cannot double ${source!.name}, which is itself a double or ad lib.`)
    }
    if (x.adlib) {
      if (!x.inst) fail(where, `the ad lib. part ${x.name} needs an instrument`)
      const avoid = x.adlib.avoid ? part(x.adlib.avoid) : undefined
      const bars = avoid?.doubles ? part(avoid.doubles.source)?.span : avoid?.span
      if (x.adlib.avoid && !bars) fail(where, `"${x.adlib.avoid}" is not a part written in bars`)
    }
    if (!sources.has(x.name) && !p.rows.some((r) => r.entries.has(x.name))) fail(where, `${x.name} never plays; name it in a form row`)
    if (x.cues.some((c) => c.pedal !== undefined) && !x.inst && score.instruments.filter((i) => i.family === 'piano').length !== 1)
      fail(where, `name the instrument whose pedal ${x.name} works, as "part ${x.name}  piano"`)
  }
  for (const v of p.variants) {
    const where = lines.get(v)
    for (const name of [...v.drop, ...v.swaps.flat(), ...v.extras.keys()]) if (!isPart(name)) fail(where, `"${name}" is not a part`)
    for (const [to, from] of v.swaps) for (const row of p.rows) if (row.entries.has(to) && row.entries.has(from)) fail(where, `${row.mark} already has ${to} as well as ${from}`)
  }
  for (const target of p.mix.keys()) if (!isPart(target) && !score.instruments.some((i) => i.name === target)) fail(lines.get(p.mix.get(target)!), `"${target}" is neither a part nor an instrument`)
}
