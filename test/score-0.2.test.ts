import { describe, expect, it } from 'vitest'
import { toAbc } from '../src/abc/index.ts'
import { checkScore, expand, secondsAt } from '../src/expand.ts'
import { toMidi } from '../src/midi.ts'
import { parseScore } from '../src/parse.ts'
import { render } from '../src/render.ts'

const score = (body: string, form: string, version = '0.2') => `score ${version}
instruments
  piano  piano
piece t  T
  tempo  q = 60
  key    C major
  chords a
    C   C2 | C4 E4 G4
    F   F2 | F3 A3 C4
${body}  form
    A  a
${form}
`
const comp = '  part comp  piano  mp\n    1  bass  w\n'
const tune = '  part tune  piano  mf  lead\n    | C5 w | D5 w |\n'
const take = (text: string) => expand(parseScore(text, 't.score'), 't')

describe('score 0.2 stays out of score 0.1', () => {
  const cases: [string, string, string][] = [
    ['a sixteenth count', '  part comp  piano  mp\n    1e  bass  e\n', '      comp\n'],
    ['a chord length', comp.replace('  part', '  chords b\n    G  G2 | G3 B3 D4  h\n    C  h\n  part'), '      comp\n'],
    ['a tempo change', comp, '      comp, rit. from 2.1 to q = 50\n'],
    ['a hairpin in the form', comp, '      comp mp>p\n'],
    ['a hairpin in bars', '  part tune  piano  lead\n    | mp < C5 h  mf D5 h | E5 w |\n', '      tune\n'],
    ['a perform block', `${comp}  perform\n    rubato 3%\n`, '      comp\n'],
  ]
  it.each(cases)('rejects %s', (_, body, form) => {
    expect(() => checkScore(score(body, form, '0.1'), 't.score')).toThrow(/needs "score 0\.2" on the first line/)
  })
})

describe('sixteenths', () => {
  it('keep the step on the eighth and put the rest in the offset', () => {
    const piece = take(score('  part comp  piano  mp\n    1e  bass  s\n    2a  bass  s\n', '      comp\n'))
    expect(piece.events.slice(0, 2).map((e) => [e.step, e.offset])).toEqual([
      [0, 0.5],
      [3, 0.5],
    ])
  })
})

describe('chord lengths', () => {
  const body = `  chords push
    G      G2 | G3 B3 D4  h
    A/G    G2 | A3 C#4 E4  h
    D      D2 | D3 F#3 A3
${comp.replace('1  bass  w', '1  bass  h\n    3  t1  h')}`
  const piece = take(score(body, '      comp\n').replace('    A  a\n', '    A  push\n'))

  it('repeat cue parts every bar and take tones from the chord sounding then', () => {
    expect(piece.bars).toBe(2)
    expect(piece.events.map((e) => [e.step, e.midi])).toEqual([
      [0, 43],
      [4, 57],
      [8, 38],
      [12, 50],
    ])
    expect(piece.chords.map((c) => c.symbol)).toEqual(['G', 'D'])
  })

  it('must fill whole bars', () => {
    expect(() => checkScore(score('  chords odd\n    G  G2 | G3 B3 D4  h\n', '      comp\n').replace('    A  a\n', '    A  odd\n') + comp, 't.score')).toThrow(/lasts 0\.5 bars/)
  })
})

describe('hairpins', () => {
  it('fade a part across its bars and mark the hairpin', () => {
    const piece = take(score(comp, '      comp mp>p\n'))
    expect(piece.events.map((e) => e.level)).toEqual([expect.closeTo(0.42), expect.closeTo(0.42 + (0.32 - 0.42) * (8 / 15))])
    expect(piece.hairpins).toEqual([{ part: 'comp', at: 0, end: 15, up: false }])
  })

  it('swell to the next dynamic in bars', () => {
    const piece = take(score('  part tune  piano  lead\n    | mp < C5 q  D5 q  E5 q  F5 q | mf G5 w |\n', '      tune\n'))
    expect(piece.events.map((e) => +e.level.toFixed(3))).toEqual([0.42, 0.44, 0.46, 0.48, 0.5])
    expect(piece.hairpins).toEqual([{ part: 'tune', at: 0, end: 8, up: true }])
  })

  it('must end where they point', () => {
    expect(() => checkScore(score('  part tune  piano  lead\n    | mf < C5 h  p D5 h | E5 w |\n', '      tune\n'), 't.score')).toThrow(/must end on a louder dynamic/)
    expect(() => checkScore(score(comp, '      comp p>mf\n'), 't.score')).toThrow(/goes the wrong way/)
  })
})

describe('tempo', () => {
  const piece = take(score(tune, '      tune, rit. from 2.1 to q = 40, fermata 2.3\n'))

  it('ramps from the count to the end of the row', () => {
    expect(piece.clock.slice(0, 8)).toEqual(new Array(8).fill(0.5))
    expect(piece.clock[8]).toBeCloseTo(30 / (60 - 20 * (0.5 / 8)))
    expect(piece.clock[11]).toBeCloseTo(30 / (60 - 20 * (3.5 / 8)))
  })

  it('holds a fermata until the next note', () => {
    expect(piece.clock[12]).toBeCloseTo(2 * (30 / (60 - 20 * (4.5 / 8))))
    expect(piece.clock[15]).toBeCloseTo(2 * (30 / (60 - 20 * (7.5 / 8))))
    expect(piece.marks).toEqual([
      { at: 8, kind: 'rit.' },
      { at: 12, kind: 'fermata' },
    ])
  })

  it('goes back with a tempo', () => {
    const two = take(
      score(tune, '      tune, rit. from 2.1 to q = 40\n').replace('    A  a\n      tune, rit. from 2.1 to q = 40\n', '    A  a\n      tune, rit. from 2.1 to q = 40\n    B  a\n      tune\n    C  a\n      tune, a tempo\n'),
    )
    expect([two.clock[16], two.clock[32]]).toEqual([0.75, 0.5])
    expect(secondsAt(two.clock, 2)).toBe(1)
  })

  it('refuses a rit. that speeds up', () => {
    expect(() => checkScore(score(tune, '      tune, rit. from 2.1 to q = 70\n'), 't.score')).toThrow(/must go slower/)
  })

  it('writes a tempo map to MIDI and signs to ABC', () => {
    const r = render(parseScore(score(tune, '      tune mp>p, rit. from 2.1 to q = 40, fermata 2.3\n'), 't.score'), 't')
    const midi = toMidi(r)
    const tempos = midi.reduce((n, b, i) => n + (b === 0xff && midi[i + 1] === 0x51 ? 1 : 0), 0)
    expect(tempos).toBe(1 + 8)
    const abc = toAbc(r)
    expect(abc).toContain('"^rit."')
    expect(abc).toContain('!fermata!')
    expect(abc).toContain('!>(!')
    expect(abc).toContain('!>)!')
  })
})

describe('perform', () => {
  const text = score(`${tune}${comp.replace('1  bass  w', '1  chord  w')}`, '      tune, comp\n')

  it('is on by default in 0.2 and repeatable', () => {
    const a = render(parseScore(text, 't.score'), 't', { perform: true })
    const b = render(parseScore(text, 't.score'), 't', { perform: true })
    expect(a.events).toEqual(b.events)
    expect(a.clock).not.toEqual(render(parseScore(text, 't.score'), 't').clock)
  })

  it('puts the tune ahead and spreads chords from the bass up', () => {
    const r = render(parseScore(text.replace('  form', '  perform\n    jitter  off\n  form'), 't.score'), 't', { perform: true })
    const first = r.events.filter((e) => e.step === 8)
    const tune = first.find((e) => e.lead)!
    const chord = first.filter((e) => !e.lead).sort((x, y) => x.midi - y.midi)
    expect(tune.offset).toBeLessThan(0)
    expect(chord.map((e) => e.offset)).toEqual([...chord.map((e) => e.offset)].sort((x, y) => x - y))
    expect(chord[0].offset).toBe(0)
  })

  it('can be turned off', () => {
    const r = render(parseScore(text.replace('  form', '  perform off\n  form'), 't.score'), 't', { perform: true })
    expect(r.perform).toBeNull()
    expect(r.events).toEqual(render(parseScore(text, 't.score'), 't').events)
  })
})

describe('a hairpin from a count', () => {
  it('holds the first dynamic until the count, then fades to the end', () => {
    const piece = take(score('  part comp  piano  mp\n    1  bass  h\n    3  bass  h\n', '      comp mp>p from 2.1\n'))
    expect(piece.events.map((e) => +e.level.toFixed(3))).toEqual([0.42, 0.42, 0.42, +(0.42 - 0.1 * (4 / 7)).toFixed(3)])
    expect(piece.hairpins).toEqual([{ part: 'comp', at: 8, end: 15, up: false }])
  })
})
