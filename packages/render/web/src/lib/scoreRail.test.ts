import { parseScore, readEdits } from 'plainscore'
import { describe, expect, it } from 'vitest'
import { type RailLine, scoreRail } from './scoreRail.ts'
import type { Edits } from './types.ts'

const HEAD = `score 0.3
title  Little
instruments
  piano  piano
  harp   harp
piece t  Little
  tempo  q = 120
  key    C major
  chords c
    C  C3 | E4 G4 C5
  part tune  piano mf
    | C4 q E4 q G4 q C5 q |
  part pad  harp p
    | C4 w |
`

const MIXING = `
  mix  — balance
    piano  0 dB  — keys
    harp   -3 dB
    tune   +1 dB

  space  decay 2.6s  predelay 20ms  damp 6500 Hz  wet -10 dB

  master  -14 LUFS  ceiling -1.2 dBTP  fade 2.5s
    air  +2 dB at 9000 Hz
`

const FORM = `
  form
    A  c  loudness -16  — opening
      tune, pad
    B  c
      tune, pad
`

const FULL = HEAD + MIXING + FORM
const BARE = HEAD + FORM

const editsOf = (text: string) => readEdits(parseScore(text), 't') as Edits
const chips = (line: RailLine) => line.tokens.filter((t) => t.field).map((t) => t.text)
const lineOf = (lines: RailLine[], key: string) => lines.find((l) => l.key === key)!
const numberOf = (text: string, needle: string) => text.split(/\r?\n/).findIndex((l) => l.includes(needle)) + 1

describe('scoreRail', () => {
  it('lists the form rows, mix rows, space and master lines with their line numbers and values', () => {
    const rail = scoreRail(FULL, 't', editsOf(FULL))
    expect(rail.lines.filter((l) => !l.ghost).map((l) => l.key)).toEqual([
      'form', 'form:A', 'form:B', 'mix', 'mix:piano', 'mix:harp', 'mix:tune', 'space', 'master:head', 'master:air',
    ])
    expect(lineOf(rail.lines, 'form:A').at).toBe(numberOf(FULL, 'loudness -16'))
    expect(chips(lineOf(rail.lines, 'form:A'))).toEqual(['-16'])
    expect(chips(lineOf(rail.lines, 'mix:harp'))).toEqual(['-3 dB'])
    expect(chips(lineOf(rail.lines, 'space'))).toEqual(['2.6s', '20ms', '6500 Hz', '-10 dB'])
    expect(chips(lineOf(rail.lines, 'master:head'))).toEqual(['-14 LUFS', '-1.2 dBTP', '2.5s'])
    expect(chips(lineOf(rail.lines, 'master:air'))).toEqual(['+2 dB', '9000 Hz'])
    expect(rail.count).toBe(0)
    expect(rail.numbers).toEqual([])
  })

  it('keeps reader notes out of the values and marks them faint', () => {
    const line = lineOf(scoreRail(FULL, 't', editsOf(FULL)).lines, 'form:A')
    expect(line.tokens.at(-1)).toMatchObject({ text: '— opening', faint: true })
  })

  it('offers a ghost for a section without a target and for unwritten master rows', () => {
    const rail = scoreRail(FULL, 't', editsOf(FULL))
    expect(lineOf(rail.lines, 'form:B').tokens.at(-1)).toMatchObject({ text: '+ loudness', faint: true, field: { kind: 'loudness', mark: 'B' } })
    expect(rail.lines.filter((l) => l.ghost).map((l) => [l.key, l.at, chips(l)])).toEqual([
      ['master:lowcut', null, ['off']],
      ['master:presence', null, ['0 dB']],
    ])
  })

  it('draws ghost space and master lines when the score has none', () => {
    const rail = scoreRail(BARE, 't', editsOf(BARE))
    expect(rail.lines.map((l) => [l.key, l.ghost])).toEqual([
      ['form', false], ['form:A', false], ['form:B', false],
      ['space', true], ['master:head', true], ['master:lowcut', true], ['master:presence', true], ['master:air', true],
    ])
    expect(chips(lineOf(rail.lines, 'space'))).toEqual(['2.4s', '20ms', '6500 Hz', '-12 dB'])
    expect(chips(lineOf(rail.lines, 'master:head'))).toEqual(['-14 LUFS', '-1 dBTP', 'off'])
    expect(rail.count).toBe(0)
  })

  it('marks a row whose target was added', () => {
    const e = editsOf(FULL)
    e.loudness.B = -13
    const rail = scoreRail(FULL, 't', e)
    const line = lineOf(rail.lines, 'form:B')
    expect(line).toMatchObject({ changed: true, fresh: false, changeId: 'loudness:B', was: 'no target' })
    expect(line.tokens.find((t) => t.field)).toMatchObject({ text: '-13', changed: true })
    expect(rail.numbers).toEqual([line.at])
    expect(rail.count).toBe(1)
  })

  it('shows the ghost and the old value when a target is removed', () => {
    const e = editsOf(FULL)
    e.loudness.A = null
    const line = lineOf(scoreRail(FULL, 't', e).lines, 'form:A')
    expect(line).toMatchObject({ changed: true, was: '-16' })
    expect(line.tokens.find((t) => t.field)).toMatchObject({ text: '+ loudness', faint: true })
  })

  it('names the old values of the chips that changed on a line', () => {
    const e = editsOf(FULL)
    e.space = { ...e.space, decay: 3, wet: -8 }
    const line = lineOf(scoreRail(FULL, 't', e).lines, 'space')
    expect(line.was).toBe('2.6s, -10 dB')
    expect(line.tokens.filter((t) => t.changed).map((t) => t.text)).toEqual(['3s', '-8 dB'])
  })

  it('marks a new mix row as new', () => {
    const e = editsOf(FULL)
    e.mix.pad = { gain: -2 }
    const rail = scoreRail(FULL, 't', e)
    expect(lineOf(rail.lines, 'mix:pad')).toMatchObject({ changed: true, fresh: true, changeId: 'mix:pad', target: 'pad' })
    expect(rail.count).toBe(1)
  })

  it('marks a line the rewrite alters even when the values are equal', () => {
    const e = editsOf(FULL)
    e.mix.harp = { gain: -3, pan: 0 }
    const rail = scoreRail(FULL, 't', e)
    expect(lineOf(rail.lines, 'mix:harp')).toMatchObject({ changed: true, changeId: 'mix:harp' })
    expect(rail.count).toBe(1)
  })

  it('reverts master rows one at a time through their own ids', () => {
    const e = editsOf(FULL)
    e.master = { ...e.master, lowcut: 40, air: null }
    const rail = scoreRail(FULL, 't', e)
    expect(lineOf(rail.lines, 'master:lowcut')).toMatchObject({ changed: true, fresh: true, changeId: 'master:lowcut', ghost: false })
    expect(lineOf(rail.lines, 'master:air')).toMatchObject({ changed: true, ghost: true, was: '+2 dB, 9000 Hz', changeId: 'master:air' })
    expect(rail.count).toBe(2)
  })

  it('reads CRLF text without carrying the carriage return into the tokens', () => {
    const text = FULL.replace(/\n/g, '\r\n')
    const e = editsOf(text)
    e.loudness.B = -13
    const rail = scoreRail(text, 't', e)
    expect(rail.lines.flatMap((l) => l.tokens).some((t) => t.text.includes('\r'))).toBe(false)
    expect(rail.count).toBe(1)
  })

  it('lists lines the rewrite changes outside the mixing blocks', () => {
    const old = `${HEAD.replace('score 0.3', 'score 0.2')}\n  mix\n    harp   -3 dB\n\n  form\n    A  c\n      tune, pad\n`
    const e = editsOf(old)
    e.mix.harp = { gain: -3, pan: -0.2 }
    const rail = scoreRail(old, 't', e)
    expect(rail.also).toEqual([{ at: 1, text: 'score 0.3' }])
    expect(rail.count).toBe(2)
    expect(rail.numbers[0]).toBe(1)
  })

  it('reads the named piece when the file holds several', () => {
    const two = `${FULL}piece u  Other\n  tempo  q = 90\n  key    C major\n  chords c\n    C  C3 | E4 G4 C5\n  part tune  piano mf\n    | C4 w |\n  form\n    Z  c  loudness -20\n      tune\n`
    const rail = scoreRail(two, 'u', readEdits(parseScore(two), 'u') as Edits)
    expect(rail.lines.filter((l) => l.block === 'form').map((l) => l.key)).toEqual(['form', 'form:Z'])
  })

  it('tells the values of a mix row apart when one of several changes', () => {
    const text = FULL.replace('harp   -3 dB', 'harp   -3 dB  send off')
    const e = editsOf(text)
    e.mix.harp = { ...e.mix.harp, gain: -4 }
    const line = lineOf(scoreRail(text, 't', e).lines, 'mix:harp')
    expect(line.was).toBe('-3 dB')
    expect(line.tokens.filter((t) => t.changed).map((t) => t.text)).toEqual(['-4 dB'])
  })

  it('offers ghosts for the values a written space or master line leaves out', () => {
    const text = FULL.replace('space  decay 2.6s  predelay 20ms  damp 6500 Hz  wet -10 dB', 'space  decay 3s').replace('master  -14 LUFS  ceiling -1.2 dBTP  fade 2.5s', 'master  -14 LUFS')
    const rail = scoreRail(text, 't', editsOf(text))
    const space = lineOf(rail.lines, 'space')
    expect(space.ghost).toBe(false)
    expect(space.tokens.filter((t) => t.field).map((t) => [t.text, t.faint ?? false])).toEqual([['3s', false], ['20ms', true], ['6500 Hz', true], ['-12 dB', true]])
    expect(lineOf(rail.lines, 'master:head').tokens.filter((t) => t.field).map((t) => t.text)).toEqual(['-14 LUFS', '-1 dBTP', 'off'])
    expect(rail.count).toBe(0)
  })

  it('reads a unit written after more than one space', () => {
    const text = FULL.replace('damp 6500 Hz', 'damp 6500  Hz')
    expect(chips(lineOf(scoreRail(text, 't', editsOf(text)).lines, 'space'))).toContain('6500  Hz')
  })
})
