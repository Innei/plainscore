import type { Curve, Edits, MixerState, Report } from './lib/types.ts'

export interface DiffLine {
  kind: 'same' | 'add' | 'del'
  line: string
  at: number
}

const call = async <T>(path: string, body?: unknown): Promise<T> => {
  const res = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? res.statusText)
  return json as T
}

export const api = {
  state: () => call<MixerState>('/api/state'),
  measure: (edits: Edits) => call<{ report: Report; curve: Curve }>('/api/measure', { edits }),
  diff: (edits: Edits) => call<{ lines: DiffLine[] }>('/api/diff', { edits }),
  write: (edits: Edits, version: number) => call<MixerState>('/api/write', { edits, version }),
  export: (edits: Edits, formats: string[]) => call<{ files: string[]; report: Report; curve: Curve }>('/api/export', { edits, formats }),
}
