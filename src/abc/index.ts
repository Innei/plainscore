import type { ScoreEvent } from '../expand.ts'
import type { Clef } from '../families.ts'
import type { Rendering } from '../render.ts'
import { type Staff, layout } from '../staves.ts'
import { DYNAMICS } from '../words.ts'
import { keyName, onGrid } from './spell.ts'
import { type Sheet, pedalVoice, writeVoice } from './voice.ts'

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

type Hand = 'R' | 'Inner' | 'L' | null

interface Voice {
  id: string
  staff: Staff
  hand: Hand
  clef: Clef
}

const leftHand = (e: ScoreEvent) => e.role === 'bass' || e.role === 'fifth' || (e.role === null && e.midi < 60)

const innerGroups = (events: ScoreEvent[]) => {
  const pitches = new Map<number, number[]>()
  for (const e of events) if (!leftHand(e)) pitches.set(Number(e.inner), [...(pitches.get(Number(e.inner)) ?? []), e.midi])
  if (!pitches.size) return new Set<number>()
  const mean = (g: number) => pitches.get(g)!.reduce((a, b) => a + b, 0) / pitches.get(g)!.length
  const upper = [...pitches.keys()].reduce((a, b) => (mean(b) > mean(a) ? b : a), [...pitches.keys()][0])
  return new Set([...pitches.keys()].filter((g) => g !== upper))
}

const noteName = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`
const dynamicName = (value: number) => Object.entries(DYNAMICS).find(([, v]) => v === value)?.[0] ?? String(value)

export const credits = (r: Pick<Rendering, 'by' | 'after'>) => [...(r.by ? [`Music by ${r.by}`] : []), ...(r.after ? [`After ${r.after}`] : [])]

export const movement = (r: Pick<Rendering, 'piece' | 'variant'>) =>
  r.piece.count > 1 ? `${ROMAN[r.piece.index] ?? r.piece.index + 1}. ${r.piece.title}${r.variant ? ` · ${r.variant}` : ''}` : ''

const remarks = (r: Rendering, staves: Staff[]) => {
  const out = new Map<string, string>()
  for (const staff of staves) if (staff.pedal && !staff.melody && !r.pedals.some((p) => p.inst === staff.inst)) out.set(staff.id, 'con Ped.')
  for (const rule of r.adlibs) {
    const articulation = rule.articulation === 'arco' ? null : rule.articulation
    const staff = staves.find((s) => !s.melody && s.inst === rule.inst && s.articulation === articulation)
    if (!staff) continue
    const range = `${noteName(rule.notes[0])}–${noteName(rule.notes[rule.notes.length - 1])}`
    out.set(staff.id, `ad lib. on ${Math.round(rule.chance * 100)}% of free eighths: ${NAMES[r.tonic]} ${r.mode} ${range}, 8va ${Math.round(rule.octave * 100)}%, ${dynamicName(rule.dynamic[0])}–${dynamicName(rule.dynamic[1])}`)
  }
  return out
}

const onset = (e: ScoreEvent) => e.step * 2 + (onGrid(e.offset) ? e.offset * 2 : 0)

const signs = (r: Rendering, voices: Voice[], voiceOf: (e: ScoreEvent) => string) => {
  const out = new Map(voices.map((v) => [v.id, new Map<number, string[]>()]))
  const add = (id: string, pos: number, text: string) => {
    const list = out.get(id)!
    list.set(pos, [...(list.get(pos) ?? []), text])
  }
  const onsets = new Map(voices.map((v) => [v.id, r.events.filter((e) => voiceOf(e) === v.id).map(onset)]))
  for (const m of r.marks) {
    const pos = Math.round(m.at * 2)
    if (m.kind !== 'fermata') add(voices[0].id, pos, `"^${m.kind}"`)
    else
      for (const v of voices) {
        const held = Math.max(...onsets.get(v.id)!.filter((x) => x <= pos))
        if (v.hand !== 'Inner' && held > pos - 16) add(v.id, Number.isFinite(held) ? held : pos, '!fermata!')
      }
  }
  for (const h of r.hairpins) {
    const notes = r.events.filter((e) => e.part === h.part && e.step + e.offset >= h.at - 1e-6 && e.step + e.offset <= h.end + 1e-6)
    const ids = new Set(notes.map(voiceOf))
    const id = [...ids].find((x) => x.endsWith('R')) ?? [...ids].find((x) => !x.endsWith('Inner'))
    if (!id) continue
    const places = notes.filter((e) => voiceOf(e) === id).map(onset)
    const [start, end] = [Math.min(...places), Math.max(...places)]
    if (start >= end) continue
    add(id, start, h.up ? '!<(!' : '!>(!')
    add(id, end, h.up ? '!<)!' : '!>)!')
  }
  return out
}

export const toAbc = (r: Rendering) => {
  const { staves, staffOf } = layout(r)
  const inner = new Map(staves.filter((s) => s.grand).map((s) => [s.id, innerGroups(r.events.filter((e) => staffOf(e) === s.id))]))
  const voiceOf = (e: ScoreEvent) => {
    const staff = staves.find((s) => s.id === staffOf(e))!
    if (!staff.grand) return staff.id
    if (leftHand(e)) return `${staff.id}L`
    return inner.get(staff.id)!.has(Number(e.inner)) ? `${staff.id}Inner` : `${staff.id}R`
  }
  const present = new Set(r.events.map(voiceOf))
  const grandUsed = (staff: Staff) => present.has(`${staff.id}R`) || present.has(`${staff.id}L`)
  const voices: Voice[] = staves.flatMap((staff) => {
    if (!staff.grand) return present.has(staff.id) ? [{ id: staff.id, staff, hand: null, clef: staff.clef }] : []
    const hands: Voice[] = [
      { id: `${staff.id}R`, staff, hand: 'R', clef: 'treble' },
      { id: `${staff.id}Inner`, staff, hand: 'Inner', clef: 'treble' },
      { id: `${staff.id}L`, staff, hand: 'L', clef: 'bass' },
    ]
    return hands.filter((v) => (v.hand === 'Inner' ? present.has(v.id) : grandUsed(staff)))
  })
  const split = (staff: Staff) => present.has(`${staff.id}Inner`)
  const pedals = new Map(
    staves
      .filter((s) => s.grand && s.pedal && grandUsed(s))
      .map((s) => [s.id, r.pedals.filter((p) => p.inst === s.inst)] as const)
      .filter(([, list]) => list.length),
  )
  const notes = remarks(r, staves)
  const labels = r.sections.length > 1 ? r.sections.map((s) => ({ bar: s.bar, label: s.label === s.mark ? s.mark : `${s.mark} ${s.label}` })) : []
  const sheet: Sheet = { keys: r.keys, mode: r.mode, tonic: r.tonic, bars: r.bars, labels }
  const group = voices
    .map((v) => {
      if (v.hand === 'R') return `{(${v.id}${split(v.staff) ? ` ${v.staff.id}Inner` : ''}) (${v.staff.id}L${pedals.has(v.staff.id) ? ` ${v.staff.id}Pedal` : ''})}`
      return v.hand ? '' : `(${v.id})`
    })
    .filter(Boolean)
    .join(' ')
  const name = (v: Voice) => (v.hand === 'R' || !v.hand ? ` name="${v.staff.name}"` : '')
  const stem = (v: Voice) => (!split(v.staff) ? '' : v.hand === 'R' ? ' stem=up' : v.hand === 'Inner' ? ' stem=down' : '')
  const title = movement(r)
  const header = [
    'X:1',
    `T:${r.title}`,
    ...(title ? [`T:${title}`] : []),
    ...credits(r).map((c) => `C:${c}`),
    'M:4/4',
    'L:1/16',
    `Q:1/4=${r.tempo}`,
    `%%score ${group}`,
    ...voices.map((v) => `V:${v.id} clef=${v.clef}${name(v)}${stem(v)}`),
    ...[...pedals.keys()].map((id) => `V:${id}Pedal clef=bass`),
    `K:${keyName(r.tonic, r.mode)}`,
  ]
  const said = new Map<string, Map<number, string>>()
  const marked = signs(r, voices, voiceOf)
  const written = voices.map((v, i) => {
    if (!said.has(v.staff.id)) said.set(v.staff.id, new Map())
    const style = { inner: v.hand === 'Inner', rings: v.staff.rings, clef: v.clef }
    const remark = v.hand === 'Inner' || v.hand === 'L' ? undefined : notes.get(v.staff.id)
    return writeVoice(sheet, style, r.events.filter((e) => voiceOf(e) === v.id), i === 0, said.get(v.staff.id)!, remark, marked.get(v.id))
  })
  const pedalLines = new Map([...pedals].map(([id, list]) => [id, pedalVoice(list, r.bars)]))
  const body: string[] = []
  for (let bar = 0; bar < r.bars; bar += 4)
    voices.forEach((v, i) => {
      body.push(`[V:${v.id}] ${written[i].slice(bar, bar + 4).join(' | ')} |`)
      const pedal = v.hand === 'L' ? pedalLines.get(v.staff.id) : undefined
      if (pedal) body.push(`[V:${v.staff.id}Pedal] ${pedal.slice(bar, bar + 4).join(' | ')} |`)
    })
  return [...header, ...body].join('\n')
}
