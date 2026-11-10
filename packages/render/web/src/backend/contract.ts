import { describe, expect, it } from 'vitest'
import type { Sounds } from '../../../src/sources/types.ts'
import type { MixerBackend } from './types.ts'

const rate = 48000
const sine = Float32Array.from({ length: rate * 3 }, (_, i) => 0.4 * Math.sin((2 * Math.PI * 261.6255653 * i) / rate))

export const SOUNDS: Sounds = { piano: { samples: [sine], rate, sprite: { C4: [0, 3] }, release: 0.4 }, harp: { samples: [sine], rate, sprite: { C4: [0, 3] }, release: 0.4 } }

export const SCORE = `score 0.3
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

export const backendContract = (name: string, make: () => Promise<{ backend: MixerBackend; close: () => Promise<void> | void }>) => {
  const withBackend = async (run: (backend: MixerBackend) => Promise<void>) => {
    const { backend, close } = await make()
    try {
      await run(backend)
    } finally {
      await close()
    }
  }

  describe(`${name} as a MixerBackend`, () => {
    it('describes the score it holds', () =>
      withBackend(async (backend) => {
        const state = await backend.state()
        expect(state.version).toBe(1)
        expect(state.sections.map((s) => s.mark)).toEqual(['A', 'B'])
        expect(state.stems.map((s) => s.target)).toEqual(['harp', 'tune'])
        expect(state.text).toBe(SCORE)
        expect(state.file.endsWith('little.score')).toBe(true)
      }))

    it('measures edited settings without changing the score', () =>
      withBackend(async (backend) => {
        const state = await backend.state()
        const { report, curve } = await backend.measure({ ...state.edits, master: { ...state.edits.master, loudness: -20 } })
        expect(report.target).toBe(-20)
        expect(curve.values.length).toBeGreaterThan(0)
        expect((await backend.state()).text).toBe(SCORE)
      }))

    it('saves an edit and returns the next version of the score', () =>
      withBackend(async (backend) => {
        const state = await backend.state()
        const next = await backend.save({ ...state.edits, loudness: { ...state.edits.loudness, A: -15 } }, state.version)
        expect(next.version).toBe(2)
        expect(next.edits.loudness.A).toBe(-15)
        expect(next.text).toContain('    A  c  loudness -15')
      }))

    it('exports the formats it says it can', () =>
      withBackend(async (backend) => {
        const state = await backend.state()
        const format = backend.capabilities.formats[0]
        const { files, report } = await backend.exportAudio(state.edits, [format])
        expect(files).toHaveLength(1)
        expect(files[0].endsWith(`.${format}`)).toBe(true)
        expect(report.sections).toHaveLength(2)
      }))
  })
}
