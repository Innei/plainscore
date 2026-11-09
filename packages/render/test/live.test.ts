import { checkScore, render } from 'plainscore'
import { describe, expect, it } from 'vitest'
import { impulse } from '../src/dsp/impulse.ts'
import { liveGraph } from '../src/live.ts'

type Call = [string, number, number]

class Param {
  value: number
  calls: Call[] = []
  constructor(value = 1) {
    this.value = value
  }
  setValueAtTime(v: number, t: number) {
    this.calls.push(['set', v, t])
    return this
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push(['ramp', v, t])
    return this
  }
  cancelScheduledValues(t: number) {
    this.calls.push(['cancel', 0, t])
    return this
  }
}

class Node {
  outputs: Node[] = []
  kind: string
  constructor(kind: string, fields: Record<string, unknown> = {}) {
    this.kind = kind
    Object.assign(this, fields)
  }
  connect(to: Node) {
    this.outputs.push(to)
    return to
  }
  disconnect() {
    this.outputs = []
  }
}

const fakeContext = () => ({
  sampleRate: 48000,
  currentTime: 0,
  createGain: () => new Node('gain', { gain: new Param(1) }),
  createStereoPanner: () => new Node('pan', { pan: new Param(0) }),
  createConvolver: () => new Node('convolver', { buffer: null, normalize: true }),
  createBiquadFilter: () => new Node('biquad', { type: 'lowpass', frequency: new Param(350), Q: new Param(1), gain: new Param(0) }),
  createDynamicsCompressor: () => new Node('compressor', { threshold: new Param(-24), knee: new Param(30), ratio: new Param(12), attack: new Param(0.003), release: new Param(0.25) }),
  createBuffer: (channels: number, length: number, rate: number) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length))
    return { numberOfChannels: channels, length, sampleRate: rate, getChannelData: (c: number) => data[c] }
  },
})

const text = `score 0.3
instruments
  piano  piano
  harp   harp
piece t  T
  tempo  q = 120
  key    C major
  chords c
    C  C3 | E4 G4 C5
  part tune  piano mf
    | C4 w |
  part wash  harp p
    1 C4 w
  mix
    piano  -6 dB  pan -0.5  send -9 dB
    harp   send off
    tune   +2 dB
  space  decay 1.5s  wet -10 dB
  master  -14 LUFS  ceiling -1 dBTP
    lowcut  35 Hz
    air     +2 dB at 9000 Hz
  form
    A  c
      tune, wash
`

const graph = () => {
  const ctx = fakeContext()
  const r = render(checkScore(text, 't.score'), 't')
  return { ctx, r, live: liveGraph(ctx as unknown as BaseAudioContext, r) }
}

const param = (node: unknown, name: string) => (node as Record<string, Param>)[name]

describe('liveGraph', () => {
  it('gives every mix target a fader, a panner and a send into one convolver', () => {
    const { live } = graph()
    expect(Object.keys(live.inputs)).toEqual(['piano', 'harp', 'tune'])
    const piano = live.inputs.piano as unknown as Node
    expect(param(piano, 'gain').value).toBeCloseTo(10 ** (-6 / 20), 6)
    const panner = piano.outputs[0]
    expect(param(panner, 'pan').value).toBe(-0.5)
    const [dry, send] = panner.outputs
    expect(dry).toBe(live.nodes.sum as unknown as Node)
    expect(param(send, 'gain').value).toBeCloseTo(10 ** (-9 / 20), 6)
    expect(send.outputs[0]).toBe(live.nodes.convolver as unknown as Node)
    expect(param((live.inputs.harp as unknown as Node).outputs[0].outputs[1], 'gain').value).toBe(0)
    expect(param(live.inputs.tune, 'gain').value).toBeCloseTo(10 ** (-4 / 20), 6)
  })

  it('builds the same impulse as the offline renderer, unnormalised', () => {
    const { live } = graph()
    const conv = live.nodes.convolver as unknown as { buffer: { getChannelData: (c: number) => Float32Array }; normalize: boolean }
    const [l, r] = impulse({ decay: 1.5, predelay: 0.02, damp: 6500 }, 48000)
    expect(conv.normalize).toBe(false)
    expect(conv.buffer.getChannelData(0)).toEqual(l)
    expect(conv.buffer.getChannelData(1)).toEqual(r)
    expect(param(live.nodes.wet, 'gain').value).toBeCloseTo(10 ** (-10 / 20), 6)
  })

  it('sets the master EQ and a limiter at the ceiling', () => {
    const { live } = graph()
    const [low, presence, air] = live.nodes.eq as unknown as Record<string, unknown>[]
    expect([low.type, param(low, 'frequency').value, param(low, 'Q').value]).toEqual(['highpass', 35, expect.closeTo(-3.0103, 3)])
    expect([presence.type, param(presence, 'gain').value]).toEqual(['peaking', 0])
    expect([air.type, param(air, 'frequency').value, param(air, 'gain').value]).toEqual(['highshelf', 9000, 2])
    expect(param(live.nodes.limiter, 'threshold').value).toBe(-1)
  })

  it('updates gains, sends and EQ in place', () => {
    const { live, r } = graph()
    live.update({ mix: { ...r.mix, instruments: { ...r.mix.instruments, piano: { gain: 0, pan: 0.25, send: null } } }, master: { ...r.master, lowcut: null } })
    expect(param(live.inputs.piano, 'gain').value).toBe(1)
    const panner = (live.inputs.piano as unknown as Node).outputs[0]
    expect(param(panner, 'pan').value).toBe(0.25)
    expect(param(panner.outputs[1], 'gain').value).toBe(0)
    expect((live.nodes.eq as unknown as Record<string, unknown>[])[0].type).toBe('allpass')
  })

  it('schedules section compensation as 0.4 s ramps centred on each edge', () => {
    const { live } = graph()
    live.compensate(
      [
        { start: 0, gain: 0 },
        { start: 10, gain: -3 },
      ],
      5,
    )
    expect(param(live.nodes.compensation, 'gain').calls).toEqual([
      ['cancel', 0, 5],
      ['set', 1, 5],
      ['set', 1, 14.8],
      ['ramp', expect.closeTo(10 ** (-3 / 20), 6), 15.2],
    ])
  })
})
