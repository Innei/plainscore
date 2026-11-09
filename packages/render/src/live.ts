import type { Master, Mix, MixSetting, Rendering, Space } from 'plainscore'
import { impulse } from './dsp/impulse.ts'
import { dbToGain } from './dsp/pan.ts'
import { PRESENCE_FREQ, RAMP } from './master.ts'

export const LIMITER = { knee: 0, ratio: 20, attack: 0.003, release: 0.08 }
const BUTTERWORTH_DB = 20 * Math.log10(Math.SQRT1_2)

export interface LiveSettings {
  mix?: Mix
  space?: Space
  master?: Master
  gain?: number
}

interface Strip {
  fader: GainNode
  panner: StereoPannerNode
  send: GainNode
}

const targetsOf = (mix: Mix) => [
  ...Object.keys(mix.instruments).map((name) => ({ name, kind: 'instrument' as const })),
  ...Object.keys(mix.parts).map((name) => ({ name, kind: 'part' as const })),
]

export const liveGraph = (ctx: BaseAudioContext, rendering: Pick<Rendering, 'mix' | 'space' | 'master'>, options: { gain?: number } = {}) => {
  let settings = { mix: rendering.mix, space: rendering.space, master: rendering.master, gain: options.gain ?? 0 }
  const sum = ctx.createGain()
  const convolver = ctx.createConvolver()
  const wet = ctx.createGain()
  const compensation = ctx.createGain()
  const eq = [ctx.createBiquadFilter(), ctx.createBiquadFilter(), ctx.createBiquadFilter()]
  const makeup = ctx.createGain()
  const limiter = ctx.createDynamicsCompressor()
  const output = ctx.createGain()
  convolver.normalize = false
  convolver.connect(wet).connect(sum)
  sum.connect(compensation).connect(eq[0]).connect(eq[1]).connect(eq[2]).connect(makeup).connect(limiter).connect(output)

  const strips = new Map<string, Strip>()
  for (const { name } of targetsOf(settings.mix)) {
    const fader = ctx.createGain()
    const panner = ctx.createStereoPanner()
    const send = ctx.createGain()
    fader.connect(panner)
    panner.connect(sum)
    panner.connect(send).connect(convolver)
    strips.set(name, { fader, panner, send })
  }

  const setting = (name: string): MixSetting => settings.mix.parts[name] ?? settings.mix.instruments[name] ?? { gain: 0, pan: 0, send: 0 }

  const applyMix = () => {
    for (const [name, strip] of strips) {
      const s = setting(name)
      strip.fader.gain.value = dbToGain(s.gain)
      strip.panner.pan.value = s.pan
      strip.send.gain.value = s.send === null ? 0 : dbToGain(s.send)
    }
  }

  let spaceKey = ''
  const applySpace = () => {
    const { decay, predelay, damp } = settings.space
    const key = `${decay}|${predelay}|${damp}|${ctx.sampleRate}`
    if (key !== spaceKey) {
      const [l, r] = impulse(settings.space, ctx.sampleRate)
      const buffer = ctx.createBuffer(2, l.length, ctx.sampleRate)
      buffer.getChannelData(0).set(l)
      buffer.getChannelData(1).set(r)
      convolver.buffer = buffer
      spaceKey = key
    }
    wet.gain.value = dbToGain(settings.space.wet)
  }

  const applyMaster = () => {
    const m = settings.master
    const [low, presence, air] = eq
    low.type = m.lowcut ? 'highpass' : 'allpass'
    low.frequency.value = m.lowcut ?? 20
    low.Q.value = m.lowcut ? BUTTERWORTH_DB : 0.7071
    presence.type = 'peaking'
    presence.frequency.value = PRESENCE_FREQ
    presence.Q.value = 1
    presence.gain.value = m.presence
    air.type = 'highshelf'
    air.frequency.value = m.air?.freq ?? 9000
    air.gain.value = m.air?.gain ?? 0
    makeup.gain.value = dbToGain(settings.gain)
    limiter.threshold.value = m.ceiling
    limiter.knee.value = LIMITER.knee
    limiter.ratio.value = LIMITER.ratio
    limiter.attack.value = LIMITER.attack
    limiter.release.value = LIMITER.release
  }

  applyMix()
  applySpace()
  applyMaster()

  return {
    inputs: Object.fromEntries([...strips].map(([name, s]) => [name, s.fader])) as Record<string, GainNode>,
    output,
    nodes: { sum, convolver, wet, compensation, eq, makeup, limiter },
    update(next: LiveSettings) {
      settings = { ...settings, ...next }
      if (next.mix) applyMix()
      if (next.space) applySpace()
      if (next.master || next.gain !== undefined) applyMaster()
    },
    compensate(edges: { start: number; gain: number }[], startAt: number, offset = 0) {
      const g = compensation.gain
      g.cancelScheduledValues(startAt)
      const current = [...edges].reverse().find((e) => e.start <= offset) ?? edges[0]
      let last = current?.gain ?? 0
      g.setValueAtTime(dbToGain(last), startAt)
      for (const e of edges) {
        if (e.start <= offset) continue
        const at = startAt + e.start - offset
        g.setValueAtTime(dbToGain(last), at - RAMP / 2)
        g.linearRampToValueAtTime(dbToGain(e.gain), at + RAMP / 2)
        last = e.gain
      }
    },
    dispose() {
      for (const s of strips.values()) [s.fader, s.panner, s.send].forEach((n) => n.disconnect())
      ;[sum, convolver, wet, compensation, ...eq, makeup, limiter, output].forEach((n) => n.disconnect())
    },
  }
}

export type LiveGraph = ReturnType<typeof liveGraph>
