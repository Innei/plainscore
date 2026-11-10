import type { Edits, MixerState, MixRowValue } from './types.ts'

export type ChangeKind = 'loudness' | 'mix' | 'space' | 'master'

export interface Change {
  id: string
  kind: ChangeKind
  label: string
  mark?: string
  target?: string
}

const near = (a: unknown, b: unknown) => a === b || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.005)

const PLAIN: MixRowValue = { gain: 0 }
const sameRow = (a: MixRowValue = PLAIN, b: MixRowValue = PLAIN) =>
  near(a.gain, b.gain) && near(a.pan ?? 0, b.pan ?? 0) && near(a.send === undefined ? 0 : a.send, b.send === undefined ? 0 : b.send) && near(a.attack, b.attack)

const sameValue = (a: unknown, b: unknown): boolean => {
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...keys].every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return near(a, b)
}

const changedFields = <T extends object>(a: T, b: T) => (Object.keys(a) as (keyof T)[]).filter((k) => !sameValue(a[k], b[k])) as string[]

const mixOrder = (state: Pick<MixerState, 'stems'>, edits: Edits) => {
  const written = state.stems.map((s) => s.target)
  return [...new Set([...written, ...Object.keys(edits.mix)])]
}

export const changeCards = (state: Pick<MixerState, 'sections' | 'stems' | 'edits'>, edits: Edits): Change[] => {
  const was = state.edits
  const cards: Change[] = []
  for (const s of state.sections) {
    if (!near(edits.loudness[s.mark] ?? null, was.loudness[s.mark] ?? null)) cards.push({ id: `loudness:${s.mark}`, kind: 'loudness', label: 'Section loudness', mark: s.mark })
  }
  for (const target of mixOrder({ stems: state.stems }, { ...edits, mix: { ...was.mix, ...edits.mix } })) {
    if (!sameRow(edits.mix[target], was.mix[target])) cards.push({ id: `mix:${target}`, kind: 'mix', label: `Mix · ${target}`, target })
  }
  const space = changedFields(edits.space, was.space)
  if (space.length) cards.push({ id: 'space', kind: 'space', label: `Space · ${space.join(', ')}` })
  const master = changedFields(edits.master, was.master)
  if (master.length) cards.push({ id: 'master', kind: 'master', label: `Master · ${master.join(', ')}` })
  return cards
}

const copyPiece = (from: Edits, into: Edits, id: string): Edits => {
  const next = structuredClone(into)
  const [kind, key] = id.split(':')
  if (kind === 'loudness') next.loudness[key] = from.loudness[key] ?? null
  else if (kind === 'mix') {
    if (from.mix[key]) next.mix[key] = structuredClone(from.mix[key])
    else delete next.mix[key]
  } else if (kind === 'space') next.space = structuredClone(from.space)
  else if (kind === 'master') next.master = structuredClone(from.master)
  return next
}

export const revertChange = (state: Pick<MixerState, 'edits'>, edits: Edits, id: string) => copyPiece(state.edits, edits, id)

export const onlyChange = (state: Pick<MixerState, 'edits'>, edits: Edits, id: string) => copyPiece(edits, state.edits, id)
