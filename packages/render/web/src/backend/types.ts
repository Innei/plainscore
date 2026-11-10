import type { Curve, Edits, MixerState, Report } from '../lib/types.ts'

export interface Capabilities {
  formats: string[]
  save: 'write' | 'file-handle' | 'download'
  autoMeasure: boolean
  reopen: boolean
}

export type BackendEvent = { type: 'changed' } | { type: 'ready' } | { type: 'failed'; error: string }

export interface Measured {
  report: Report
  curve: Curve
}

export interface MixerBackend {
  capabilities: Capabilities
  state(): Promise<MixerState>
  measure(edits: Edits): Promise<Measured>
  save(edits: Edits, version: number): Promise<MixerState>
  exportAudio(edits: Edits, formats: string[]): Promise<Measured & { files: string[] }>
  stemAudio(index: number, ctx: BaseAudioContext): Promise<AudioBuffer>
  onEvent(listener: (event: BackendEvent) => void): () => void
}
