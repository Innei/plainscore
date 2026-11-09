export interface SoundfontSource {
  soundfont: ArrayBuffer
  preset?: number
  bank?: number
  credit?: string
}

export interface SampleSource {
  samples: Float32Array[]
  rate: number
  sprite: Record<string, [offset: number, duration: number]>
  attack?: number
  release?: number
  sustain?: boolean
  credit?: string
}

export type SoundSource = SoundfontSource | SampleSource
export type Sounds = Record<string, SoundSource>

export const isSoundfont = (s: SoundSource): s is SoundfontSource => 'soundfont' in s
