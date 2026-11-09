import { DEFAULT_MASTER, DEFAULT_SPACE, type Master, type Space, masterHead, masterRow, spaceRow } from './mixing.ts'
import { type ScoreFile, VERSION, mixRow, parseScore } from './parse.ts'
import { prose } from './words.ts'

export interface MixRowValue {
  gain: number
  pan?: number
  send?: number | null
  attack?: number
}

export interface ScoreEdits {
  mix?: Record<string, MixRowValue>
  space?: Space
  master?: Master
  loudness?: Record<string, number | null>
}

const fmt = (n: number) => String(Math.round(n * 100) / 100 || 0)
const signed = (n: number) => (Math.round(n * 100) / 100 > 0 ? `+${fmt(n)}` : fmt(n))
const near = (a: number | null | undefined, b: number | null | undefined) =>
  a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.005)

const sameRow = (a: MixRowValue, b: MixRowValue) => near(a.gain, b.gain) && near(a.pan, b.pan) && near(a.send, b.send) && near(a.attack, b.attack)
const plainRow = (row: MixRowValue) => near(row.gain, 0) && !row.pan && !row.send && row.attack === undefined
const sameSpace = (a: Space, b: Space) => (Object.keys(a) as (keyof Space)[]).every((k) => near(a[k], b[k]))

export const readEdits = (score: ScoreFile, piece: string): ScoreEdits => {
  const p = score.pieces.find((x) => x.id === piece)
  if (!p) throw new Error(`no piece "${piece}"`)
  const mix: Record<string, MixRowValue> = {}
  for (const [target, row] of p.mix) {
    mix[target] = { gain: row.db, ...(row.pan === undefined ? {} : { pan: row.pan }), ...(row.send === undefined ? {} : { send: row.send }), ...(row.attack === undefined ? {} : { attack: row.attack }) }
  }
  return {
    mix,
    space: { ...(p.space ?? DEFAULT_SPACE) },
    master: { ...(p.master ?? DEFAULT_MASTER), air: p.master?.air ? { ...p.master.air } : null },
    loudness: Object.fromEntries(p.rows.map((r) => [r.mark, r.loudness])),
  }
}

export const formatMixFields = (row: MixRowValue) =>
  [
    `${signed(row.gain)} dB`,
    ...(row.pan === undefined ? [] : [`pan ${fmt(row.pan)}`]),
    ...(row.send === undefined ? [] : [row.send === null ? 'send off' : `send ${signed(row.send)} dB`]),
    ...(row.attack === undefined ? [] : [`attack ${fmt(row.attack * 1000)}ms`]),
  ].join('  ')

const note = (line: string) => {
  const at = line.indexOf(' — ')
  return at < 0 ? '' : `  ${line.slice(at + 1)}`
}

const indentOf = (line: string) => line.search(/\S/)
const isComment = (line: string) => line.trim().startsWith('#')
const isRow = (line: string) => indentOf(line) >= 4 && !isComment(line)

const blockEnd = (lines: string[], header: number, to: number) => {
  let end = header + 1
  for (let i = header + 1; i < to; i++) {
    if (indentOf(lines[i]) >= 0 && indentOf(lines[i]) <= 2 && !isComment(lines[i])) break
    if (isRow(lines[i])) end = i + 1
  }
  return end
}

const masterLine = (m: Master) => `  master  ${signed(m.loudness)} LUFS  ceiling ${signed(m.ceiling)} dBTP${m.fade ? `  fade ${fmt(m.fade)}s` : ''}`
const spaceLine = (s: Space) =>
  `  space  decay ${fmt(s.decay)}s  predelay ${fmt(s.predelay * 1000)}ms  damp ${fmt(s.damp)} Hz  wet ${signed(s.wet)} dB`

type MasterKey = 'lowcut' | 'presence' | 'air'
const masterValue = (m: Master, key: MasterKey) => (key === 'air' ? (m.air ? `${m.air.gain}@${m.air.freq}` : null) : m[key])
const masterIsDefault = (m: Master, key: MasterKey) => (key === 'presence' ? near(m.presence, 0) : m[key] === null)
const masterText = (m: Master, key: MasterKey) =>
  key === 'lowcut' ? `${fmt(m.lowcut!)} Hz` : key === 'presence' ? `${signed(m.presence)} dB` : `${signed(m.air!.gain)} dB at ${fmt(m.air!.freq)} Hz`

const rewriteMix = (lines: string[], header: number, end: number, want: Record<string, MixRowValue>) => {
  const rows = lines.slice(header + 1, end)
  const column = Math.max(0, ...rows.filter(isRow).map((l) => l.trim().match(/^\S+\s+/)?.[0].length ?? 0))
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of rows) {
    if (!isRow(line)) {
      out.push(line)
      continue
    }
    const words = line.trim().split(/\s+/)
    const { target, db, pan, send, attack } = mixRow(words, VERSION)
    const desired = want[target]
    seen.add(target)
    if (!desired) continue
    if (sameRow({ gain: db, pan, send, attack }, desired)) out.push(line)
    else out.push(`    ${target.padEnd(Math.max(column, target.length + 2))}${formatMixFields(desired)}${note(line)}`)
  }
  const fresh = Object.entries(want).filter(([target, row]) => !seen.has(target) && !plainRow(row))
  const width = Math.max(column, ...fresh.map(([t]) => t.length + 2))
  const lastRow = out.findLastIndex(isRow)
  out.splice(lastRow + 1, 0, ...fresh.map(([target, row]) => `    ${target.padEnd(width)}${formatMixFields(row)}`))
  return out
}

const rewriteMaster = (lines: string[], header: number, end: number, want: Master) => {
  const had = masterHead(prose(lines[header].trim().split(/\s+/).slice(1)))
  const head = had.loudness === want.loudness && had.ceiling === want.ceiling && had.fade === want.fade ? lines[header] : `${masterLine(want)}${note(lines[header])}`
  const out = [head]
  const seen = new Set<MasterKey>()
  const width = (keys: string[]) => Math.max(...keys.map((k) => k.length + 2))
  const keys: MasterKey[] = ['lowcut', 'presence', 'air']
  const written = keys.filter((k) => !masterIsDefault(want, k))
  for (const line of lines.slice(header + 1, end)) {
    if (!isRow(line)) {
      out.push(line)
      continue
    }
    const key = line.trim().split(/\s+/)[0] as MasterKey
    const parsed = { ...DEFAULT_MASTER }
    masterRow(prose(line.trim().split(/\s+/)), parsed)
    seen.add(key)
    if (masterValue(parsed, key) === masterValue(want, key) || near(masterValue(parsed, key) as number, masterValue(want, key) as number)) out.push(line)
    else if (!masterIsDefault(want, key)) out.push(`    ${key.padEnd(width([...written, key]))}${masterText(want, key)}${note(line)}`)
  }
  const fresh = written.filter((k) => !seen.has(k))
  const lastRow = out.findLastIndex((l, i) => i === 0 || isRow(l))
  out.splice(lastRow + 1, 0, ...fresh.map((k) => `    ${k.padEnd(width(written))}${masterText(want, k)}`))
  return out
}

const rewriteLoudness = (line: string, value: number | null) => {
  const dash = line.indexOf(' — ')
  const body = dash < 0 ? line : line.slice(0, dash)
  const tail = dash < 0 ? '' : line.slice(dash)
  const current = body.match(/\s+loudness\s+([+-]?\d+(?:\.\d+)?)/)
  if (current && value !== null && near(Number(current[1]), value)) return line
  const bare = current ? body.replace(current[0], '') : body
  const gap = bare.match(/\s*$/)![0]
  const kept = bare.trimEnd()
  return value === null ? `${kept}${gap}${tail}` : `${kept}  loudness ${fmt(value)}${tail ? gap || ' ' : gap}${tail}`
}

export const rewriteScore = (text: string, piece: string, edits: ScoreEdits) => {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(eol)
  const start = lines.findIndex((l) => new RegExp(`^piece\\s+${piece.replace(/[-]/g, '\\-')}(\\s|$)`).test(l))
  if (start < 0) throw new Error(`no piece "${piece}"`)
  const after = lines.findIndex((l, i) => i > start && indentOf(l) === 0 && !isComment(l))
  const stop = after < 0 ? lines.length : after
  const find = (key: string) => {
    for (let i = start + 1; i < stop; i++) if (indentOf(lines[i]) === 2 && lines[i].trim().split(/\s+/)[0] === key) return i
    return -1
  }
  const replace: { from: number; to: number; with: string[] }[] = []
  const insert: string[][] = []

  if (edits.mix) {
    const at = find('mix')
    if (at >= 0) replace.push({ from: at + 1, to: blockEnd(lines, at, stop), with: rewriteMix(lines, at, blockEnd(lines, at, stop), edits.mix) })
    else {
      const rows = rewriteMix(['  mix'], 0, 1, edits.mix)
      if (rows.length) insert.push(['  mix', ...rows])
    }
  }
  if (edits.space) {
    const at = find('space')
    if (at >= 0) {
      const had = spaceRow(prose(lines[at].trim().split(/\s+/).slice(1)))
      if (!sameSpace(had, edits.space)) replace.push({ from: at, to: at + 1, with: [`${spaceLine(edits.space)}${note(lines[at])}`] })
    } else if (!sameSpace(edits.space, DEFAULT_SPACE)) insert.push([spaceLine(edits.space)])
  }
  if (edits.master) {
    const at = find('master')
    if (at >= 0) {
      const end = blockEnd(lines, at, stop)
      replace.push({ from: at, to: end, with: rewriteMaster(lines, at, end, edits.master) })
    } else {
      const fresh = rewriteMaster([masterLine(DEFAULT_MASTER)], 0, 1, edits.master)
      if (fresh.length > 1 || fresh[0] !== masterLine(DEFAULT_MASTER)) insert.push(fresh)
    }
  }
  if (edits.loudness) {
    const form = find('form')
    for (let i = form + 1; form >= 0 && i < stop; i++) {
      if (indentOf(lines[i]) <= 2 && indentOf(lines[i]) >= 0 && !isComment(lines[i])) break
      if (indentOf(lines[i]) !== 4 || isComment(lines[i])) continue
      const mark = lines[i].trim().split(/\s+/)[0]
      if (mark in edits.loudness) replace.push({ from: i, to: i + 1, with: [rewriteLoudness(lines[i], edits.loudness[mark])] })
    }
  }

  const form = find('form')
  if (insert.length) replace.push({ from: form < 0 ? stop : form, to: form < 0 ? stop : form, with: insert.flatMap((block) => [...block, '']) })
  for (const r of replace.sort((a, b) => b.from - a.from)) lines.splice(r.from, r.to - r.from, ...r.with)
  let out = lines.join(eol)
  try {
    parseScore(out)
  } catch (error) {
    if (!(error as Error).message.includes(`needs score ${VERSION}`)) throw error
    const from = out.match(/^score (\S+)[ \t]*$/m)?.[1]
    out = out.replace(/^score \S+[ \t]*$/m, `score ${VERSION}`)
    if (from === '0.1') out = out.replace(/^(piece\s.*)$/gm, `$1${eol}  perform off`)
  }
  return out
}
