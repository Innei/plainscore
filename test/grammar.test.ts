import { describe, expect, it } from 'vitest'
import { checkScore, expand, wrap } from '../src/expand.ts'
import { parseScore } from '../src/parse.ts'
import { render } from '../src/render.ts'

const piece = (form: string, extra = '') => `score 0.1
instruments
  piano  piano
  harp   harp
piece t  T
  tempo  q = 60
  key    C major
  chords a
    C   C2 | C4 E4 G4
  chords b
    F   F2 | F3 A3 C4
  part line  piano  mf  lead
    | C5 w |
  part echo  harp  doubles line 8vb
  part pad  piano  p
    1  chord  w
    1  Ped.
${extra}  form ${form}
`
const once = (extra = '', entries = 'pad, line, echo') => piece(`\n    A  a\n      ${entries}\n`, extra)

describe('loop and doubles', () => {
  const looped = expand(
    parseScore(
      piece(`loop from A
    Intro  a
      pad
    A  b
      line, echo mf, pad
`),
      't.score',
    ),
    't',
  )

  it('loops from the named section', () => {
    expect(looped.loop).toEqual({ from: 1, to: 2 })
    expect([0, 8, 15, 16, 23, 24].map((s) => wrap(looped, s))).toEqual([0, 8, 15, 8, 15, 8])
  })

  it('doubles a part on its own instrument, shifted', () => {
    expect(looped.events.filter((e) => e.part === 'echo').map((e) => [e.inst, e.midi, e.level])).toEqual([['harp', 60, 0.5]])
  })

  it('holds the pedal across the loop seam', () => {
    expect(looped.events.filter((e) => e.part === 'pad' && e.step === 8).map((e) => e.length)).toEqual([8, 8, 8])
  })

  it('renders extra passes of the loop', () => {
    const r = render(parseScore(piece('loop from A\n    Intro  a\n      pad\n    A  b\n      line, echo, pad\n'), 't.score'), 't', { passes: 3 })
    expect(r.bars).toBe(4)
    expect(r.sections.map((s) => [s.mark, s.bar])).toEqual([['Intro', 0], ['A', 1], ['A', 2], ['A', 3]])
    expect(r.events.filter((e) => e.part === 'line').map((e) => e.step)).toEqual([8, 16, 24])
  })

  it('ends a piece that plays once', () => {
    const p = expand(parseScore(once(), 't.score'), 't')
    expect([wrap(p, 7), wrap(p, 8)]).toEqual([7, -1])
  })
})

describe('variants', () => {
  const text = once('  part soft  piano  pp\n    1  bass  w\n  variants\n    full\n    quiet  soft for pad, drop echo, line on 3\n')

  it('plays the form as written in the first variant', () => {
    expect(new Set(expand(parseScore(text, 't.score'), 't').events.map((e) => e.part))).toEqual(new Set(['pad', 'line', 'echo']))
  })

  it('edits every row in the others', () => {
    const quiet = expand(parseScore(text, 't.score'), 't', 'quiet')
    expect(new Set(quiet.events.map((e) => e.part))).toEqual(new Set(['soft']))
  })
})

describe('errors name the file and line', () => {
  const cases: [string, string, RegExp][] = [
    ['a missing version', 'title x\n', /^t\.score line 1: start the file with "score 0\.2"/],
    ['an unknown loop target', piece('loop from Z\n    A  a\n      pad, line, echo\n'), /line 18: no section "Z" to loop from/],
    ['mixing in a part header', once('  part loud  piano  +3 dB\n    1  bass  w\n'), /line 18: "\+3" is mixing; put it in the piece's mix block/],
    ['a part that never plays', once('  part idle  piano  p\n    1  bass  w\n'), /line 18: idle never plays; name it in a form row/],
    ['a swap onto a part already in the row', once('  variants\n    one\n    two  line for pad\n'), /line 20: A already has line as well as pad/],
    ['an instrument used as a part name', once('  part harp  harp  p\n    1  bass  w\n'), /line 18: "harp" is an instrument; give the part its own name/],
    ['an unknown family', 'score 0.1\ninstruments\n  kazoo  kazoo\n', /line 3: unknown family "kazoo"/],
    ['a mix target that does not exist', once('  mix\n    nobody  +3 dB\n'), /line 19: "nobody" is neither a part nor an instrument/],
    ['a scene rule from the old format', once('  part m  piano  mf  read: only notes on 1 and 3\n    | C5 w |\n'), /line 18: scene rules are gone/],
    ['a chord tone the voicing lacks', once('  part deep  piano  p\n    1  t4  w\n', 'pad, line, echo, deep'), /line 19: C has no t4/],
  ]
  it.each(cases)('reports %s', (_, text, message) => {
    expect(() => checkScore(text, 't.score')).toThrow(message)
  })
})
