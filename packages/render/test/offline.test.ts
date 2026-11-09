import { BAR, DEFAULT_SEED, checkScore, render } from 'plainscore'
import { describe, expect, it } from 'vitest'
import { measure, truePeak } from '../src/loudness.ts'
import { formatReport, renderOffline } from '../src/offline.ts'
import type { Sounds } from '../src/sources/types.ts'
import { timeline } from '../src/stems.ts'

const rate = 48000
const sine = Float32Array.from({ length: rate * 4 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 261.6255653 * i) / rate))
const sounds: Sounds = {
  piano: { samples: [sine], rate, sprite: { C4: [0, 4] }, attack: 0.01, release: 0.3, credit: 'test sine' },
  harp: { samples: [sine], rate, sprite: { C4: [0, 4] }, attack: 0.01, release: 0.3 },
}

const PARTS: Record<string, string> = {
  early: '  part early  piano mf\n    | C4 q r q r h | C4 h. r q |\n',
  late: '  part late  piano mf\n    | r q C4 h. | C4 w |\n',
  pad: '  part pad  harp mf\n    | C4 w | C4 w |\n',
  loud: '  part loud  piano f\n    | C5 q C5 q C5 q C5 q | C5 q C5 q C5 q C5 q |\n',
}

const score = (aParts: string, bParts: string, extra = '') => {
  const used = [...new Set(`${aParts}, ${bParts}`.split(/,\s*/))]
  return `score 0.3
title  Two
by     Someone
instruments
  piano  piano
  harp   harp
piece t  T
  tempo  q = 120
  key    C major
  chords c  two bars each
    C  C3 | E4 G4 C5
${used.map((p) => PARTS[p]).join('')}${extra}
  form
    A  c  loudness -16
      ${aParts}
    B  c  loudness -16
      ${bParts}
`
}

describe('renderOffline', () => {
  it('warns about a hole at a seam and names nothing sounding there', async () => {
    const { report } = await renderOffline(score('early', 'late'), sounds, { rate })
    expect(report.seams).toHaveLength(1)
    expect(report.seams[0]).toMatchObject({ from: 'A', to: 'B', sounding: [] })
    expect(report.seams[0].time).toBeCloseTo(4, 0)
    expect(report.seams[0].dip).toBeGreaterThan(8)
  })

  it('stays quiet when something holds across the seam', async () => {
    const { report } = await renderOffline(score('early, pad', 'late, pad'), sounds, { rate })
    expect(report.seams).toEqual([])
  })

  it('reports each section with its target, compensation and measured loudness', async () => {
    const { audio, report } = await renderOffline(score('early', 'loud, pad'), sounds, { rate })
    expect(report.sections.map((s) => [s.mark, s.target])).toEqual([
      ['A', -16],
      ['B', -16],
    ])
    expect(report.sections[0].compensation).toBeGreaterThan(report.sections[1].compensation)
    expect(Math.abs(report.integrated - -14)).toBeLessThan(0.2)
    expect(report.truePeak).toBeLessThanOrEqual(-0.9)
    for (const s of report.sections) expect(Math.abs(s.diff! - 2)).toBeLessThan(0.3)
    expect(report.credits).toEqual([{ sound: 'piano', credit: 'test sine' }, { sound: 'harp', credit: '' }])
    expect(measure(audio, rate).integrated).toBeCloseTo(report.integrated, 6)
    expect(formatReport(report)).toContain('A')
    expect(formatReport({ ...report, title: '間  Ma', piece: '間 Ma', variant: null }).split('\n')[0]).toMatch(/^間 {2}Ma {2}\d/)
  })

  it('plays the piece the way its perform block asks', async () => {
    const played = await renderOffline(score('loud', 'loud'), sounds, { rate })
    const plain = await renderOffline(score('loud', 'loud').replace('  form\n', '  perform off\n\n  form\n'), sounds, { rate })
    expect(played.audio[0]).not.toEqual(plain.audio[0])
  })

  it('ends 0.8 s after the sound falls under -75 dBFS', async () => {
    const { audio } = await renderOffline(score('early, pad', 'late, pad'), sounds, { rate })
    const floor = 10 ** (-75 / 20)
    let last = 0
    for (let i = 0; i < audio[0].length; i++) if (Math.abs(audio[0][i]) > floor || Math.abs(audio[1][i]) > floor) last = i
    expect((audio[0].length - last) / rate).toBeGreaterThan(0.75)
    expect((audio[0].length - last) / rate).toBeLessThan(0.85)
  })

  it('folds the tail onto the start for a seamless loop', async () => {
    const text = score('early, pad', 'late, pad')
    const { audio } = await renderOffline(text, sounds, { rate, loop: true })
    const r = render(checkScore(text, 't.score'), 't', { seed: DEFAULT_SEED, perform: true })
    expect(audio[0].length).toBe(Math.round(timeline(r)(r.bars * BAR) * rate))
    expect(Math.abs(audio[0].length - 8 * rate)).toBeLessThan(0.1 * rate)
    expect(Math.abs(audio[0][100])).toBeGreaterThan(0)
  })

  it('applies a fade and keeps the true peak under the ceiling', async () => {
    const text = score('loud, pad', 'loud, pad', '  master  -14 LUFS  ceiling -2 dBTP  fade 2s\n')
    const { audio, report } = await renderOffline(text, sounds, { rate })
    expect(truePeak(audio)).toBeLessThanOrEqual(-1.9)
    expect(report.truePeak).toBeLessThanOrEqual(-1.9)
    const n = audio[0].length
    expect(Math.abs(audio[0][n - 1])).toBeLessThan(1e-3)
  })

  it('uses overrides instead of what the score says', async () => {
    const plain = await renderOffline(score('early, pad', 'loud, pad'), sounds, { rate })
    const moved = await renderOffline(score('early, pad', 'loud, pad'), sounds, { rate, overrides: { loudness: { A: null, B: null } } })
    expect(moved.report.sections.map((s) => s.target)).toEqual([null, null])
    expect(moved.report.sections.map((s) => s.compensation)).toEqual([0, 0])
    expect(plain.report.sections[0].compensation).not.toBe(0)
  })
})
