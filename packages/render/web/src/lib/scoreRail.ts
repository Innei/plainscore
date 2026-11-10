import { rewriteScore } from 'plainscore'
import type { Edits, Master, Space } from './types.ts'

export type MasterField = 'loudness' | 'ceiling' | 'fade' | 'lowcut' | 'presence' | 'airGain' | 'airFreq'

export type Field =
  | { kind: 'loudness'; mark: string }
  | { kind: 'mix'; target: string; param: 'gain' | 'pan' | 'send' }
  | { kind: 'space'; key: keyof Space }
  | { kind: 'master'; key: MasterField }

export interface Token {
  text: string
  field?: Field
  changed?: boolean
  faint?: boolean
}

export type Block = 'form' | 'mix' | 'space' | 'master'

export interface RailLine {
  key: string
  at: number | null
  block: Block
  head: boolean
  tokens: Token[]
  mark?: string
  target?: string
  changeId: string | null
  changed: boolean
  fresh: boolean
  was: string
  ghost: boolean
}

export interface Rail {
  lines: RailLine[]
  also: { at: number; text: string }[]
  numbers: number[]
  count: number
}

type Spec = [RegExp, Field]

const NUM = String.raw`[+-]?\d+(?:\.\d+)?`
const MASTER_ROWS = ['lowcut', 'presence', 'air'] as const
type MasterRow = (typeof MASTER_ROWS)[number]

const indentOf = (line: string) => line.search(/\S/)
const isComment = (line: string) => line.trim().startsWith('#')
const firstWord = (line: string) => line.trim().split(/\s+/)[0]
const fmt = (n: number) => String(Math.round(n * 100) / 100 || 0)
const signed = (n: number) => (Math.round(n * 100) / 100 > 0 ? `+${fmt(n)}` : fmt(n))

interface Found {
  form: number
  rows: Map<string, number>
  mix: number
  mixRows: Map<string, number>
  space: number
  master: number
  masterRows: Map<string, number>
  shown: Set<number>
}

const scan = (lines: string[], piece: string): Found => {
  const start = lines.findIndex((l) => new RegExp(`^piece\\s+${piece.replace(/[-]/g, '\\-')}(\\s|$)`).test(l))
  const after = lines.findIndex((l, i) => i > start && indentOf(l) === 0 && !isComment(l))
  const stop = start < 0 ? 0 : after < 0 ? lines.length : after
  const find = (key: string) => {
    for (let i = start + 1; i < stop; i++) if (indentOf(lines[i]) === 2 && firstWord(lines[i]) === key) return i
    return -1
  }
  const rowsOf = (header: number, keep: (line: string) => boolean) => {
    const rows = new Map<string, number>()
    for (let i = header + 1; header >= 0 && i < stop; i++) {
      const indent = indentOf(lines[i])
      if (indent >= 0 && indent <= 2 && !isComment(lines[i])) break
      if (!isComment(lines[i]) && keep(lines[i])) rows.set(firstWord(lines[i]), i)
    }
    return rows
  }
  const found = {
    form: find('form'),
    mix: find('mix'),
    space: find('space'),
    master: find('master'),
  }
  const rows = rowsOf(found.form, (l) => indentOf(l) === 4)
  const mixRows = rowsOf(found.mix, (l) => indentOf(l) >= 4)
  const masterRows = rowsOf(found.master, (l) => indentOf(l) >= 4)
  const shown = new Set([found.form, found.mix, found.space, found.master, ...rows.values(), ...mixRows.values(), ...masterRows.values()].filter((i) => i >= 0))
  return { ...found, rows, mixRows, masterRows, shown }
}

const split = (line: string) => {
  const clean = line.replace(/\r$/, '')
  const dash = clean.indexOf(' — ')
  const body = (dash < 0 ? clean : clean.slice(0, dash)).slice(2).trimEnd()
  return { body, note: dash < 0 ? null : clean.slice(dash + 1).trim() }
}

const tokensOf = (line: string, specs: Spec[]): Token[] => {
  const { body, note } = split(line)
  const hits: { from: number; to: number; field: Field }[] = []
  for (const [shape, field] of specs) {
    for (const m of body.matchAll(new RegExp(shape.source, 'g'))) {
      const from = m.index + m[0].length - m[1].length
      const to = m.index + m[0].length
      if (hits.some((h) => from < h.to && to > h.from)) continue
      hits.push({ from, to, field })
      break
    }
  }
  hits.sort((a, b) => a.from - b.from)
  const out: Token[] = []
  let at = 0
  for (const h of hits) {
    if (h.from > at) out.push({ text: body.slice(at, h.from) })
    out.push({ text: body.slice(h.from, h.to), field: h.field })
    at = h.to
  }
  if (at < body.length) out.push({ text: body.slice(at) })
  if (note) out.push({ text: '  ' }, { text: note, faint: true })
  return out
}

const formSpecs = (mark: string): Spec[] => [[new RegExp(String.raw`\sloudness\s+(${NUM})`), { kind: 'loudness', mark }]]

const mixSpecs = (target: string): Spec[] => [
  [new RegExp(String.raw`\ssend\s+(off|${NUM}\s+dB)`), { kind: 'mix', target, param: 'send' }],
  [new RegExp(String.raw`\span\s+(${NUM})`), { kind: 'mix', target, param: 'pan' }],
  [new RegExp(String.raw`\s(${NUM}\s+dB|\d+(?:\.\d+)?%)`), { kind: 'mix', target, param: 'gain' }],
]

const SPACE_SPECS: Spec[] = [
  [new RegExp(String.raw`\sdecay\s+(${NUM}s)`), { kind: 'space', key: 'decay' }],
  [new RegExp(String.raw`\spredelay\s+(${NUM}ms)`), { kind: 'space', key: 'predelay' }],
  [new RegExp(String.raw`\sdamp\s+(${NUM}\s+Hz)`), { kind: 'space', key: 'damp' }],
  [new RegExp(String.raw`\swet\s+(${NUM}\s+dB)`), { kind: 'space', key: 'wet' }],
]

const HEAD_SPECS: Spec[] = [
  [new RegExp(String.raw`^master\s+(${NUM}\s+LUFS)`), { kind: 'master', key: 'loudness' }],
  [new RegExp(String.raw`\sceiling\s+(${NUM}\s+dBTP)`), { kind: 'master', key: 'ceiling' }],
  [new RegExp(String.raw`\sfade\s+(${NUM}s)`), { kind: 'master', key: 'fade' }],
]

const ROW_SPECS: Record<MasterRow, Spec[]> = {
  lowcut: [[new RegExp(String.raw`lowcut\s+(${NUM}\s+Hz)`), { kind: 'master', key: 'lowcut' }]],
  presence: [[new RegExp(String.raw`presence\s+(${NUM}\s+dB)`), { kind: 'master', key: 'presence' }]],
  air: [
    [new RegExp(String.raw`air\s+(${NUM}\s+dB)`), { kind: 'master', key: 'airGain' }],
    [new RegExp(String.raw`\sat\s+(${NUM}\s+Hz)`), { kind: 'master', key: 'airFreq' }],
  ],
}

const ghostToken = (text: string, field: Field): Token => ({ text, field, faint: true })

const GHOST_ROWS: Record<MasterRow, Token[]> = {
  lowcut: [{ text: '  lowcut  ', faint: true }, ghostToken('off', { kind: 'master', key: 'lowcut' })],
  presence: [{ text: '  presence  ', faint: true }, ghostToken('0 dB', { kind: 'master', key: 'presence' })],
  air: [{ text: '  air  ', faint: true }, ghostToken('off', { kind: 'master', key: 'airGain' })],
}

const spaceText = (s: Space) => `  space  decay ${fmt(s.decay)}s  predelay ${fmt(s.predelay * 1000)}ms  damp ${fmt(s.damp)} Hz  wet ${signed(s.wet)} dB`
const headText = (m: Master) => `  master  ${signed(m.loudness)} LUFS  ceiling ${signed(m.ceiling)} dBTP`

const withExtras = (tokens: Token[], extras: Token[]) => {
  if (!extras.length) return tokens
  const noted = tokens.length >= 2 && tokens.at(-1)!.faint && !tokens.at(-1)!.field
  const cut = noted ? tokens.length - 2 : tokens.length
  return [...tokens.slice(0, cut), ...extras, ...tokens.slice(cut)]
}

const has = (tokens: Token[], field: Field) => tokens.some((t) => t.field && JSON.stringify(t.field) === JSON.stringify(field))

const missing = (tokens: Token[], wanted: [string, Field, string][]) =>
  wanted.filter(([, field]) => !has(tokens, field)).flatMap(([label, field, text]): Token[] => [{ text: `  ${label} `, faint: true }, ghostToken(text, field)])

const spaceGhosts = (tokens: Token[], sp: Space) =>
  missing(tokens, [
    ['decay', { kind: 'space', key: 'decay' }, `${fmt(sp.decay)}s`],
    ['predelay', { kind: 'space', key: 'predelay' }, `${fmt(sp.predelay * 1000)}ms`],
    ['damp', { kind: 'space', key: 'damp' }, `${fmt(sp.damp)} Hz`],
    ['wet', { kind: 'space', key: 'wet' }, `${signed(sp.wet)} dB`],
  ])

const headGhosts = (tokens: Token[], m: Master) =>
  missing(tokens, [
    ['', { kind: 'master', key: 'loudness' }, `${signed(m.loudness)} LUFS`],
    ['ceiling', { kind: 'master', key: 'ceiling' }, `${signed(m.ceiling)} dBTP`],
    ['fade', { kind: 'master', key: 'fade' }, 'off'],
  ])

const keyOf = (field: Field) => JSON.stringify(field)
const chipsIn = (tokens: Token[]) => tokens.filter((t) => t.field && !t.faint)

const compare = (tokens: Token[], before: Token[] | null) => {
  if (!before) return { tokens, was: '' }
  const old = new Map(chipsIn(before).map((t) => [keyOf(t.field!), t.text]))
  const now = new Map(chipsIn(tokens).map((t) => [keyOf(t.field!), t.text]))
  const was = [...old].filter(([key, text]) => now.get(key) !== text).map(([, text]) => text)
  return {
    tokens: tokens.map((t) => (t.field && (t.faint ? old.has(keyOf(t.field)) : old.get(keyOf(t.field)) !== t.text) ? { ...t, changed: true } : t)),
    was: was.join(', '),
  }
}

export const scoreRail = (text: string, piece: string, edits: Edits): Rail => {
  const eol = /\r?\n/
  const before = text.split(eol)
  const after = rewriteScore(text, piece, edits).split(eol)
  const was = scan(before, piece)
  const now = scan(after, piece)
  const lines: RailLine[] = []

  const push = (line: Omit<RailLine, 'changed' | 'fresh' | 'was' | 'ghost' | 'tokens'> & { tokens: Token[]; old: number | undefined; oldSpecs?: Spec[] }) => {
    const { old, oldSpecs, ...rest } = line
    const present = old !== undefined && old >= 0
    const changed = !present || before[old].replace(/\r$/, '') !== after[rest.at! - 1].replace(/\r$/, '')
    const diff = changed && present ? compare(rest.tokens, tokensOf(before[old], oldSpecs ?? [])) : { tokens: rest.tokens, was: '' }
    lines.push({ ...rest, tokens: !present ? rest.tokens.map((t) => (t.field && !t.faint ? { ...t, changed: true } : t)) : diff.tokens, changed, fresh: !present, was: diff.was, ghost: false })
  }

  const ghost = (key: string, block: Block, tokens: Token[], changeId: string, old: { at: number; specs: Spec[] } | null) => {
    const previous = old ? chipsIn(tokensOf(before[old.at], old.specs)).map((t) => t.text) : []
    lines.push({ key, at: null, block, head: false, tokens, changeId, changed: old !== null, fresh: false, was: previous.join(', '), ghost: true })
  }

  if (now.form >= 0) {
    push({ key: 'form', at: now.form + 1, block: 'form', head: true, tokens: tokensOf(after[now.form], []), changeId: null, old: was.form })
    for (const [mark, i] of now.rows) {
      const specs = formSpecs(mark)
      const tokens = tokensOf(after[i], specs)
      const targeted = tokens.some((t) => t.field)
      const withGhost = targeted ? tokens : withExtras(tokens, [{ text: '  ' }, ghostToken('+ loudness', { kind: 'loudness', mark })])
      push({ key: `form:${mark}`, at: i + 1, block: 'form', head: false, tokens: withGhost, mark, changeId: `loudness:${mark}`, old: was.rows.get(mark), oldSpecs: specs })
      const line = lines.at(-1)!
      if (line.changed && !line.fresh && targeted && !line.was) line.was = 'no target'
    }
  }

  if (now.mix >= 0) {
    push({ key: 'mix', at: now.mix + 1, block: 'mix', head: true, tokens: tokensOf(after[now.mix], []), changeId: null, old: was.mix })
    for (const [target, i] of now.mixRows) {
      const specs = mixSpecs(target)
      push({ key: `mix:${target}`, at: i + 1, block: 'mix', head: false, tokens: tokensOf(after[i], specs), target, changeId: `mix:${target}`, old: was.mixRows.get(target), oldSpecs: specs })
    }
  }

  if (now.space >= 0) {
    const tokens = tokensOf(after[now.space], SPACE_SPECS)
    push({ key: 'space', at: now.space + 1, block: 'space', head: true, tokens: withExtras(tokens, spaceGhosts(tokens, edits.space)), changeId: 'space', old: was.space, oldSpecs: SPACE_SPECS })
  } else ghost('space', 'space', tokensOf(spaceText(edits.space), SPACE_SPECS).map((t) => ({ ...t, faint: true })), 'space', null)

  if (now.master >= 0) {
    const tokens = tokensOf(after[now.master], HEAD_SPECS)
    push({ key: 'master:head', at: now.master + 1, block: 'master', head: true, tokens: withExtras(tokens, headGhosts(tokens, edits.master)), changeId: 'master:head', old: was.master, oldSpecs: HEAD_SPECS })
  } else {
    const tokens = tokensOf(headText(edits.master), HEAD_SPECS).map((t) => ({ ...t, faint: true }))
    ghost('master:head', 'master', [...tokens, ...headGhosts(tokens, edits.master)], 'master:head', null)
  }

  for (const row of MASTER_ROWS) {
    const i = now.masterRows.get(row)
    const old = was.masterRows.get(row)
    if (i !== undefined) push({ key: `master:${row}`, at: i + 1, block: 'master', head: false, tokens: tokensOf(after[i], ROW_SPECS[row]), changeId: `master:${row}`, old, oldSpecs: ROW_SPECS[row] })
    else ghost(`master:${row}`, 'master', GHOST_ROWS[row], `master:${row}`, old === undefined ? null : { at: old, specs: ROW_SPECS[row] })
  }

  const also: Rail['also'] = []
  const outside = before.filter((_, i) => !was.shown.has(i)).map((l) => l.replace(/\r$/, ''))
  let j = 0
  after.forEach((raw, i) => {
    if (now.shown.has(i)) return
    const line = raw.replace(/\r$/, '')
    if (j < outside.length && outside[j] === line) return void j++
    if (j < outside.length && /^score\s/.test(line) && /^score\s/.test(outside[j])) {
      also.push({ at: i + 1, text: line.trim() })
      return void j++
    }
    if (line.trim()) also.push({ at: i + 1, text: line.trim() })
  })

  const changed = lines.filter((l) => l.changed)
  const numbers = [...also.map((a) => a.at), ...changed.flatMap((l) => (l.at === null ? [] : [l.at]))].sort((a, b) => a - b)
  return { lines, also, numbers, count: changed.length + also.length }
}
