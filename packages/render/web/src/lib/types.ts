import type { Master, Mix, MixRowValue, MixSetting, Space } from 'plainscore'
import type { Report } from '../../../src/report.ts'

export type { Master, Mix, MixRowValue, MixSetting, Report, Space }

export interface Edits {
  mix: Record<string, MixRowValue>
  space: Space
  master: Master
  loudness: Record<string, number | null>
}

export interface Section {
  mark: string
  label: string
  start: number
  end: number
  tonic: string
  keyChange: boolean
  parts: string[]
}

export interface StemInfo {
  index: number
  target: string
  kind: 'instrument' | 'part'
  insts: string[]
}

export interface Curve {
  step: number
  window: number
  values: number[]
}

export interface Lane {
  target: string
  spans: [number, number][]
}

export interface MixerState {
  file: string
  version: number
  title: string
  piece: { id: string; title: string }
  variant: string | null
  tempo: number
  bars: number
  sections: Section[]
  stems: StemInfo[]
  edits: Edits
  mix: Mix
  partInst: Record<string, string>
  report: Report
  curve: Curve
  lanes: Lane[]
  text: string
}

export interface View {
  report: Report
  comp: number[]
  gain: number
}
