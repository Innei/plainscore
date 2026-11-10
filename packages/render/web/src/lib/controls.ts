import { AIR_FREQ } from 'plainscore'
import { fmt, signed } from './format.ts'
import type { Field } from './scoreRail.ts'
import type { Edits, Master, Space } from './types.ts'

export interface Control {
  label: string
  min: number
  max: number
  step: number
  value: number
  show: (v: number) => string
  disabled?: boolean
  on?: boolean
}

const LOWCUT_ON = 35
const db = (v: number) => `${signed(v)} dB`

const spaceControl = (key: keyof Space, s: Space): Control => {
  if (key === 'decay') return { label: 'Decay', min: 0.4, max: 6, step: 0.1, value: s.decay, show: (v) => `${v.toFixed(1)} s` }
  if (key === 'predelay') return { label: 'Predelay', min: 0, max: 120, step: 1, value: Math.round(s.predelay * 1000), show: (v) => `${v} ms` }
  if (key === 'damp') return { label: 'Damp', min: 1500, max: 16000, step: 100, value: s.damp, show: (v) => `${v} Hz` }
  return { label: 'Wet', min: -40, max: 0, step: 0.5, value: s.wet, show: db }
}

const masterControl = (key: string, m: Master): Control => {
  const air = m.air ?? { gain: 0, freq: AIR_FREQ }
  if (key === 'loudness') return { label: 'Loudness', min: -24, max: -8, step: 0.5, value: m.loudness, show: (v) => `${fmt(v)} LUFS` }
  if (key === 'ceiling') return { label: 'Ceiling', min: -3, max: -0.1, step: 0.1, value: m.ceiling, show: (v) => `${fmt(v)} dBTP` }
  if (key === 'fade') return { label: 'Fade', min: 0, max: 10, step: 0.5, value: m.fade, show: (v) => (v ? `${v.toFixed(1)} s` : 'ring out') }
  if (key === 'lowcut') return { label: 'Lowcut', min: 20, max: 150, step: 1, value: m.lowcut ?? LOWCUT_ON, show: (v) => `${v} Hz`, disabled: m.lowcut === null, on: m.lowcut !== null }
  if (key === 'presence') return { label: 'Presence', min: -6, max: 6, step: 0.5, value: m.presence, show: db }
  if (key === 'airGain') return { label: 'Air', min: -6, max: 6, step: 0.5, value: air.gain, show: db }
  return { label: 'Air at', min: 4000, max: 16000, step: 250, value: air.freq, show: (v) => `${v} Hz`, disabled: !m.air }
}

export const controlOf = (field: Field, edits: Edits): Control | null => {
  if (field.kind === 'space') return spaceControl(field.key, edits.space)
  if (field.kind === 'master') return masterControl(field.key, edits.master)
  return null
}

export const applyControl = (field: Field, edits: Edits, value: number): Edits => {
  if (field.kind === 'space') return { ...edits, space: { ...edits.space, [field.key]: field.key === 'predelay' ? value / 1000 : value } }
  if (field.kind !== 'master') return edits
  const m = edits.master
  if (field.key === 'airGain') return { ...edits, master: { ...m, air: value ? { gain: value, freq: m.air?.freq ?? AIR_FREQ } : null } }
  if (field.key === 'airFreq') return m.air ? { ...edits, master: { ...m, air: { ...m.air, freq: value } } } : edits
  return { ...edits, master: { ...m, [field.key]: value } }
}

export const toggleControl = (field: Field, edits: Edits, on: boolean): Edits =>
  field.kind === 'master' && field.key === 'lowcut' ? { ...edits, master: { ...edits.master, lowcut: on ? LOWCUT_ON : null } } : edits
