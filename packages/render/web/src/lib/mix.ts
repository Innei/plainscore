import type { Edits, Mix, MixerState, MixSetting } from './types.ts'

const BLANK: MixSetting = { gain: 0, pan: 0, send: 0 }

export const resolveMix = (state: Pick<MixerState, 'mix' | 'partInst'>, edits: Edits): Mix => {
  const instruments: Record<string, MixSetting> = {}
  for (const name of Object.keys(state.mix.instruments)) {
    const row = edits.mix[name]
    instruments[name] = row
      ? { gain: row.gain, pan: row.pan ?? 0, send: row.send === undefined ? 0 : row.send, ...(row.attack === undefined ? {} : { attack: row.attack }) }
      : { ...BLANK }
  }
  const parts: Record<string, MixSetting> = {}
  for (const name of Object.keys(state.mix.parts)) {
    const base = instruments[state.partInst[name]] ?? BLANK
    const row = edits.mix[name] ?? { gain: 0 }
    parts[name] = { gain: base.gain + row.gain, pan: row.pan ?? base.pan, send: row.send === undefined ? base.send : row.send }
  }
  return { instruments, parts }
}

export const settingOf = (state: Pick<MixerState, 'mix' | 'partInst'>, edits: Edits, target: string, kind: 'instrument' | 'part') => {
  const mix = resolveMix(state, edits)
  return (kind === 'part' ? mix.parts[target] : mix.instruments[target]) ?? { ...BLANK }
}

export const writeStrip = (
  state: Pick<MixerState, 'mix' | 'partInst'>,
  edits: Edits,
  target: string,
  kind: 'instrument' | 'part',
  resolved: MixSetting,
): Edits => {
  const row = { ...(edits.mix[target] ?? { gain: 0 }) }
  const base = kind === 'part' ? (resolveMix(state, edits).instruments[state.partInst[target]] ?? BLANK) : BLANK
  row.gain = Math.round((resolved.gain - base.gain) * 10) / 10
  if (resolved.pan !== base.pan || row.pan !== undefined) row.pan = Math.round(resolved.pan * 100) / 100
  if (resolved.send !== base.send || row.send !== undefined) row.send = resolved.send === null ? null : Math.round(resolved.send * 10) / 10
  return { ...edits, mix: { ...edits.mix, [target]: row } }
}
