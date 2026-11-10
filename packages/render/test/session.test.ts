import { describe, expect, it } from 'vitest'
import { createSession, inspectScore } from '../src/session.ts'
import type { Sounds } from '../src/sources/types.ts'

const rate = 48000
const sine = Float32Array.from({ length: rate * 3 }, (_, i) => 0.4 * Math.sin((2 * Math.PI * 261.6255653 * i) / rate))
const sounds: Sounds = { piano: { samples: [sine], rate, sprite: { C4: [0, 3] }, release: 0.4 }, harp: { samples: [sine], rate, sprite: { C4: [0, 3] }, release: 0.4 } }

const SCORE = `score 0.3
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

  mix  — balance
    piano  0 dB  — keys
    harp   -3 dB
    tune   +1 dB

  form
    A  c  loudness -16
      tune, pad
    B  c in D
      tune, pad
`

const open = () => createSession({ text: SCORE, name: 'little.score', piece: 't', variant: null, sounds })

describe('session', () => {
  it('describes sections, stems, edits, the curve and the text', async () => {
    const s = (await open()).describe()
    expect(s.sections.map((x) => x.mark)).toEqual(['A', 'B'])
    expect(s.stems.map((x) => [x.target, x.kind])).toEqual([['harp', 'instrument'], ['tune', 'part']])
    expect(s.edits.mix.tune).toEqual({ gain: 1 })
    expect(s.curve.window).toBe(3)
    expect(s.text).toBe(SCORE)
    expect(s.version).toBe(1)
    expect(s.piece.id).toBe('t')
  })

  it('measures with edited settings', async () => {
    const session = await open()
    const edits = session.describe().edits
    const quiet = session.measure({ ...edits, master: { ...edits.master, loudness: -20 } })
    expect(quiet.report.target).toBe(-20)
    expect(quiet.report.integrated).toBeLessThan(session.describe().report.integrated - 3)
  })

  it('rewrites only the line an edit touches', async () => {
    const session = await open()
    const edits = session.describe().edits
    const text = session.rewrite({ ...edits, loudness: { ...edits.loudness, A: -15 } })
    const changed = text.split('\n').filter((line, i) => line !== SCORE.split('\n')[i])
    expect(changed).toEqual(['    A  c  loudness -15'])
  })

  it('applies new text, bumps the version and keeps the stems when asked', async () => {
    const session = await open()
    const stems = session.stems
    const edits = session.describe().edits
    await session.apply(session.rewrite({ ...edits, loudness: { ...edits.loudness, A: -15 } }), true)
    expect(session.version).toBe(2)
    expect(session.stems).toBe(stems)
    expect(session.describe().edits.loudness.A).toBe(-15)
  })

  it('masters stereo audio for export', async () => {
    const { audio, report } = (await open()).master((await open()).describe().edits)
    expect(audio).toHaveLength(2)
    expect(audio[0].length).toBeGreaterThan(rate)
    expect(report.sections).toHaveLength(2)
  })

  it('reports progress per stem while rendering', async () => {
    const seen: string[] = []
    await createSession({ text: SCORE, name: 'little.score', piece: 't', variant: null, sounds, onProgress: (p) => seen.push(p.stage) })
    expect(seen[0]).toBe('rendering')
    expect(seen.at(-1)).toBe('measuring')
  })
})

describe('inspectScore', () => {
  it('lists pieces with their variants', () => {
    expect(inspectScore(SCORE, 'little.score').pieces).toEqual([{ id: 't', title: 'Little', variants: [] }])
  })

  it('throws the parser message for a score that does not read', () => {
    expect(() => inspectScore('score 0.3\nnonsense here\n', 'bad.score')).toThrow(/bad\.score line 2/)
  })
})
