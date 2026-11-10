import { changeCards } from './lib/changes.ts'
import { estimate } from './lib/estimate.ts'
import type { Curve, Edits, MixerState, Report, View } from './lib/types.ts'

export interface Banner {
  text: string
  reload?: boolean
}

export interface Model {
  state: MixerState | null
  edits: Edits | null
  measured: Edits | null
  view: View | null
  curve: Curve | null
  stale: boolean
  selected: number
  status: string | null
  banner: Banner | null
  writeError: string | null
}

export type Action =
  | { type: 'loaded'; state: MixerState }
  | { type: 'edit'; edits: Edits }
  | { type: 'measured'; report: Report; curve: Curve; edits: Edits }
  | { type: 'written'; state: MixerState }
  | { type: 'writeFailed'; error: string }
  | { type: 'select'; index: number }
  | { type: 'status'; status: string | null }
  | { type: 'banner'; banner: Banner | null }

export const initial: Model = {
  state: null,
  edits: null,
  measured: null,
  view: null,
  curve: null,
  stale: false,
  selected: 0,
  status: 'loading…',
  banner: null,
  writeError: null,
}

const viewOf = (report: Report): View => ({ report, comp: report.sections.map((s) => s.compensation), gain: report.gain })

const settle = (m: Model, edits: Edits): Model => {
  if (!m.state || !m.view) return m
  if (!changeCards({ ...m.state, edits: m.measured ?? m.state.edits }, edits).length) return { ...m, edits, view: viewOf(m.view.report), stale: false }
  const gain = m.view.report.gain + (edits.master.loudness - m.view.report.target)
  const view = { ...m.view, gain }
  return { ...m, edits, view: { ...view, comp: estimate(m.state, edits, view) }, stale: true }
}

export const reduce = (m: Model, a: Action): Model => {
  switch (a.type) {
    case 'loaded':
      return { ...m, state: a.state, edits: structuredClone(a.state.edits), measured: structuredClone(a.state.edits), view: viewOf(a.state.report), curve: a.state.curve, stale: false, selected: Math.min(m.selected, a.state.sections.length - 1) }
    case 'edit':
      return { ...settle(m, a.edits), writeError: null }
    case 'measured':
      return settle({ ...m, view: viewOf(a.report), curve: a.curve, measured: structuredClone(a.edits) }, m.edits ?? a.edits)
    case 'written':
      return { ...reduce(m, { type: 'loaded', state: a.state }), writeError: null }
    case 'writeFailed':
      return { ...m, writeError: a.error }
    case 'select':
      return { ...m, selected: a.index }
    case 'status':
      return { ...m, status: a.status }
    case 'banner':
      return { ...m, banner: a.banner }
  }
}
