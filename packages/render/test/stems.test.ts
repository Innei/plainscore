import { checkScore, render, secondsAt } from 'plainscore'
import { BasicSoundBank } from 'spessasynth_core'
import { describe, expect, it } from 'vitest'
import { playSampler } from '../src/sources/sampler.ts'
import { renderStems, soundKey, timeline } from '../src/stems.ts'

const rate = 48000
const score = (body: string, mix = '') => `score 0.3
instruments
  piano  piano
  harp   harp
piece t  T
  tempo  q = 120
  key    C major
  chords c
    C  C3 | E4 G4 C5
${body}
  mix
    piano  0 dB
${mix}
  form
    A  c
      tune, wash
`
const tune = '  part tune  piano mf lead\n    | C5 h r h |\n  part wash  harp p\n    3 C4 q\n'

const energy = (x: Float32Array, from: number, to: number) => {
  let s = 0
  for (let i = Math.round(from * rate); i < Math.round(to * rate); i++) s += x[i] * x[i]
  return s
}

const zeroCrossings = (x: Float32Array) => {
  let n = 0
  for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 !== x[i] < 0) n++
  return n
}

const sine = (freq: number, seconds: number, fileRate = rate) => Float32Array.from({ length: Math.round(seconds * fileRate) }, (_, i) => 0.5 * Math.sin((2 * Math.PI * freq * i) / fileRate))

describe('soundKey', () => {
  it('keeps arco on the plain instrument', () => {
    expect(soundKey('violins', null)).toBe('violins')
    expect(soundKey('violins', 'arco')).toBe('violins')
    expect(soundKey('violins', 'pizz.')).toBe('violins pizz.')
  })
})

describe('renderStems', () => {
  it('synthesises a soundfont stem that starts at the note', async () => {
    await BasicSoundBank.ready
    const bank = BasicSoundBank.getSampleSoundBankFile()
    const r = render(checkScore(score(tune), 't.score'), 't')
    const { stems, seconds } = await renderStems(r, { piano: { soundfont: bank, preset: 0 }, harp: { soundfont: bank, preset: 0 } }, rate)
    expect(seconds).toBeCloseTo(2 + 6, 6)
    const piano = stems.find((s) => s.target === 'piano')!
    expect(piano.channels[0].length).toBe(Math.ceil(seconds * rate))
    expect(energy(piano.channels[0], 0, 0.9)).toBeGreaterThan(1)
    const harp = stems.find((s) => s.target === 'harp')!
    expect(energy(harp.channels[0], 0, 0.95)).toBe(0)
    expect(energy(harp.channels[0], 1, 1.5)).toBeGreaterThan(0.1)
  })

  it('gives a part with its own mix row its own stem', async () => {
    const bank = BasicSoundBank.getSampleSoundBankFile()
    const r = render(checkScore(score(tune, '    tune  +2 dB\n'), 't.score'), 't')
    const { stems } = await renderStems(r, { piano: { soundfont: bank, preset: 0 }, harp: { soundfont: bank, preset: 0 } }, rate)
    expect(stems.map((s) => [s.target, s.kind, s.insts])).toEqual([
      ['harp', 'instrument', ['harp']],
      ['tune', 'part', ['piano']],
    ])
  })

  it('names the missing sound', async () => {
    const r = render(checkScore(score(tune), 't.score'), 't')
    await expect(renderStems(r, { piano: { soundfont: BasicSoundBank.getSampleSoundBankFile(), preset: 0 } }, rate)).rejects.toThrow('no sound for "harp"; add it to the sounds')
  })
})

describe('timing', () => {
  const slowing = `score 0.3
instruments
  piano  piano
piece t  T
  tempo  q = 120
  key    C major
  chords c
    C  C3 | E4 G4 C5
  part short  piano mf
    | C5 q r h. |
  part tune  piano mf
    | C5 w |
  form
    A  c
      short, rit. from 1.1 to q = 60
    B  c
      tune
`

  it('follows the clock through a tempo change', async () => {
    const r = render(checkScore(slowing, 't.score'), 't')
    const at = timeline(r)
    expect(at(8)).toBeCloseTo(secondsAt(r.clock, 8), 9)
    expect(at(8)).toBeGreaterThan(2.5)
    expect(at(12.5)).toBeCloseTo(secondsAt(r.clock, 12.5), 9)
    const sprite = { samples: [sine(523.25, 3)], rate, sprite: { C5: [0, 3] as [number, number] }, attack: 0, release: 0.1 }
    const { stems, seconds } = await renderStems(r, { piano: sprite }, rate)
    expect(seconds).toBeCloseTo(at(16) + 6, 6)
    const x = stems[0].channels[0]
    expect(energy(x, at(8) - 0.3, at(8) - 0.12)).toBeLessThan(1e-6)
    expect(energy(x, at(8), at(8) + 0.2)).toBeGreaterThan(1)
  })
})

describe('sampler', () => {
  const source = { samples: [sine(440, 3)], rate, sprite: { A4: [0, 3] as [number, number] }, attack: 0, release: 0.4 }

  it('shifts pitch from the nearest sprite note', () => {
    const out = [new Float32Array(rate * 4), new Float32Array(rate * 4)]
    playSampler(source, out, rate, { midi: 81, at: 0, length: 1, velocity: 1 })
    expect(zeroCrossings(out[0].subarray(rate / 10, rate / 10 + rate / 2)) / 2).toBeCloseTo(440, -1.3)
    expect(out[0]).toEqual(out[1])
  })

  it('reads a sprite recorded at another rate', () => {
    const other = { ...source, samples: [sine(440, 3, 44100)], rate: 44100 }
    const out = [new Float32Array(rate * 4), new Float32Array(rate * 4)]
    playSampler(other, out, rate, { midi: 69, at: 0, length: 1, velocity: 1 })
    expect(zeroCrossings(out[0].subarray(rate / 10, rate / 10 + rate / 2)) / 2).toBeCloseTo(220, -1.3)
  })

  it('stops after the release and holds while the note lasts', () => {
    const out = [new Float32Array(rate * 4), new Float32Array(rate * 4)]
    playSampler(source, out, rate, { midi: 69, at: 0.5, length: 1, velocity: 0.8 })
    expect(energy(out[0], 0, 0.49)).toBe(0)
    expect(Math.max(...out[0].subarray(rate, rate + 200).map(Math.abs))).toBeCloseTo(0.4, 1)
    expect(energy(out[0], 2.1, 4)).toBe(0)
  })

  it('loops a sustained note past the end of its sprite', () => {
    const out = [new Float32Array(rate * 8), new Float32Array(rate * 8)]
    playSampler({ ...source, sustain: true }, out, rate, { midi: 69, at: 0, length: 6, velocity: 1 })
    expect(energy(out[0], 5, 5.9)).toBeGreaterThan(energy(out[0], 0.5, 1.4) * 0.5)
  })
})
