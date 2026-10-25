import { describe, expect, it } from 'vitest'
import { toAbc } from '../src/abc/index.ts'
import { toMidi } from '../src/midi.ts'
import { parseScore } from '../src/parse.ts'
import { render } from '../src/render.ts'
import { layout } from '../src/staves.ts'

const text = `score 0.1
title  Quartet
by     Someone

instruments
  flute    flute
  violas   violas
  upright  piano
  grand    piano
  cello    cello

piece q  Quartet
  tempo  q = 90
  key    G major

  chords g
    G   G2 | B3 D4 G4

  part tune  upright  mf  lead
    | G5 h  A5 h |
  part comp  upright  p
    1  bass  w
    1  chord  h
    1  Ped.
  part bells  grand  p
    1  top+8va  q
  part air  flute  mp
    1  top+15ma  w
  part inside  violas  mp
    1  t1  w
  part plucked  violas pizz.  mf
    2  t2  e
  part low  cello pizz.  mf
    1  bass  q

  form
    A  g
      tune, comp, bells, air, inside, plucked, low
`

const rendering = render(parseScore(text, 'quartet.score'), 'q')

describe('staves come from the declared instruments', () => {
  const { staves } = layout(rendering)

  it('orders staves by declaration, with the melody first and articulations after their instrument', () => {
    expect(staves.map((s) => [s.id, s.name])).toEqual([
      ['melody', 'Melody'],
      ['flute', 'Flute'],
      ['violas', 'Violas'],
      ['violasPizz', 'Violas pizz.'],
      ['upright', 'Upright'],
      ['grand', 'Grand'],
      ['celloPizz', 'Cello pizz.'],
    ])
  })

  it('takes clefs, programs and pedals from the family table', () => {
    const by = Object.fromEntries(staves.map((s) => [s.id, [s.clef, s.grand, s.program, s.pedal, s.rings]]))
    expect(by.flute).toEqual(['treble', false, 73, false, false])
    expect(by.violas).toEqual(['alto', false, 41, false, false])
    expect(by.violasPizz).toEqual(['alto', false, 45, false, true])
    expect(by.upright).toEqual(['treble', true, 0, true, true])
    expect(by.melody).toEqual(['treble', false, 0, true, false])
  })

  it('declares only the staves that have notes', () => {
    expect(staves.some((s) => s.id === 'cello')).toBe(false)
  })
})

describe('exports for any instrument set', () => {
  const abc = toAbc(rendering)

  it('writes a grand staff per piano, with pedal marks only where that piano has them', () => {
    expect(abc).toContain('%%score (melody) (flute) (violas) (violasPizz) {(uprightR) (uprightL uprightPedal)} {(grandR) (grandL)} (celloPizz)')
    expect(abc).toContain('V:violas clef=alto name="Violas"')
    expect(abc).toContain('V:grandR clef=treble name="Grand"')
    expect(abc).toMatch(/"\^con Ped\."/)
  })

  it('writes the title, a single piece without a movement line, and credits', () => {
    expect(abc.split('\n').slice(0, 4)).toEqual(['X:1', 'T:Quartet', 'C:Music by Someone', 'M:4/4'])
  })

  it('writes one MIDI track per staff, skipping the percussion channel', () => {
    const midi = toMidi(rendering)
    const tracks = [...Buffer.from(midi).toString('latin1').matchAll(/MTrk/g)].length
    expect(tracks).toBe(1 + 7)
    const programs = [...Buffer.from(midi)].flatMap((b, i, all) => ((b & 0xf0) === 0xc0 && all[i - 1] === 0 ? [[b & 0x0f, all[i + 1]]] : []))
    expect(programs).toEqual([[0, 0], [1, 73], [2, 41], [3, 45], [4, 0], [5, 0], [6, 45]])
  })
})
