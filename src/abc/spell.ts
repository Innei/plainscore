import { DYNAMICS, MODES } from '../words.ts'

export const BAR = 16
export const BEAT = 4
export const NOTE_LENGTHS = [16, 12, 8, 6, 4, 3, 2, 1]
export const REST_LENGTHS = [16, 8, 4, 2, 1]
const LETTERS = 'CDEFGAB'
const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const MODE_NAMES: Record<string, string> = { major: '', minor: 'm', dorian: 'Dor', lydian: 'Lyd', mixolydian: 'Mix' }

export const split = (at: number, span: number, values: number[]) => {
  const out: number[] = []
  while (span > 0) {
    const room = at % BEAT ? BEAT - (at % BEAT) : at === 0 ? BAR : BAR / 2 - (at % (BAR / 2))
    const l = values.find((x) => x <= Math.min(span, room))!
    out.push(l)
    at += l
    span -= l
  }
  return out
}

const tonicLetter = (tonic: number) => LETTERS.indexOf([...LETTERS].find((l) => NATURAL[l] === tonic) ?? [...LETTERS].find((l) => (NATURAL[l] + 1) % 12 === tonic)!)

export const speller = (tonic: number, mode: string) => {
  const scale = MODES[mode].map((step) => (step + tonic) % 12)
  const first = tonicLetter(tonic)
  const degrees = scale.map((pc, i) => {
    const letter = LETTERS[(first + i) % 7]
    return { pc, letter, acc: ((pc - NATURAL[letter] + 18) % 12) - 6 }
  })
  const sig = Object.fromEntries(degrees.map((d) => [d.letter, d.acc])) as Record<string, number>
  const spell = (pc: number) => {
    const degree = degrees.find((d) => d.pc === pc)
    if (degree) return degree
    const natural = [...LETTERS].find((l) => NATURAL[l] === pc)
    if (natural) return { letter: natural, acc: 0 }
    return { letter: [...LETTERS].find((l) => (NATURAL[l] + 1) % 12 === pc)!, acc: 1 }
  }
  return {
    bar: () => new Map<string, number>(),
    note(midi: number, bar: Map<string, number>) {
      const { letter, acc } = spell(midi % 12)
      const octave = Math.floor((midi - acc) / 12) - 1
      const key = `${letter}${octave}`
      const current = bar.get(key) ?? sig[letter]
      bar.set(key, acc)
      const mark = acc === current ? '' : acc === 1 ? '^' : acc === -1 ? '_' : '='
      return mark + (octave >= 5 ? letter.toLowerCase() + "'".repeat(octave - 5) : letter + ','.repeat(4 - octave))
    },
  }
}

export const nearestDynamic = (velocity: number) =>
  Object.entries(DYNAMICS).reduce((best, entry) => (Math.abs(entry[1] - velocity) < Math.abs(best[1] - velocity) ? entry : best))[0]

export const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

export const onGrid = (offset: number) => Math.abs(offset * 2 - Math.round(offset * 2)) < 1e-6

export const keyName = (tonic: number, mode: string) => {
  const letter = LETTERS[tonicLetter(tonic)]
  return letter + (NATURAL[letter] === tonic ? '' : '#') + MODE_NAMES[mode]
}
