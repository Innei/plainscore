export type Clef = 'treble' | 'alto' | 'bass'

export interface Family {
  clef: Clef
  grand: boolean
  program: number
  pedal: boolean
  rings: boolean
}

const plain = (clef: Clef, program: number): Family => ({ clef, grand: false, program, pedal: false, rings: false })

export const FAMILIES: Record<string, Family> = {
  piano: { clef: 'treble', grand: true, program: 0, pedal: true, rings: true },
  harp: { clef: 'treble', grand: false, program: 46, pedal: false, rings: true },
  violins: plain('treble', 48),
  violas: plain('alto', 41),
  cello: plain('bass', 42),
  bass: plain('bass', 43),
  flute: plain('treble', 73),
  oboe: plain('treble', 68),
  clarinet: plain('treble', 71),
  bassoon: plain('bass', 70),
  horn: plain('treble', 60),
  trumpet: plain('treble', 56),
  voice: plain('treble', 52),
  synth: plain('treble', 88),
}

export const ARTICULATION_PROGRAMS: Record<string, number> = { 'pizz.': 45 }
export const RINGING_ARTICULATIONS = new Set(['pizz.'])
