import type { Edits, MixerState, View } from './types.ts'

export const estimate = (state: Pick<MixerState, 'sections'>, edits: Edits, view: View) => {
  const r = view.report
  const own = state.sections.map((s, i) => {
    const target = edits.loudness[s.mark]
    const rep = r.sections[i]
    if (target === null || target === undefined || !rep || rep.measured === null) return null
    return target - (rep.measured - rep.compensation - r.gain + view.gain)
  })
  const first = own.find((v) => v !== null)
  if (first === undefined || first === null) return own.map(() => 0)
  let last = first
  return own.map((v) => (v === null ? last : (last = v)))
}
