import { ARTICULATION_PROGRAMS, BAR, FAMILY_RULES, type Rendering, type ScoreEvent } from 'plainscore'
import { playSampler } from './sources/sampler.ts'
import { type SynthMessage, playSoundfont } from './sources/soundfont.ts'
import { type SoundSource, type Sounds, isSoundfont } from './sources/types.ts'

export const TAIL = 6

export interface Stem {
  target: string
  kind: 'instrument' | 'part'
  insts: string[]
  channels: Float32Array[]
  events: ScoreEvent[]
}

export const soundKey = (inst: string, articulation: string | null) => (articulation && articulation !== 'arco' ? `${inst} ${articulation}` : inst)

export const stemTarget = (r: Pick<Rendering, 'mix'>, e: Pick<ScoreEvent, 'part' | 'inst'>) => (e.part in r.mix.parts ? e.part : e.inst)

const resolveSound = (sounds: Sounds, inst: string, articulation: string | null): { source: SoundSource; program?: number } => {
  const key = soundKey(inst, articulation)
  if (sounds[key]) return { source: sounds[key] }
  const plain = sounds[inst]
  if (plain && key !== inst && isSoundfont(plain) && articulation && articulation in ARTICULATION_PROGRAMS)
    return { source: { ...plain, preset: ARTICULATION_PROGRAMS[articulation] } }
  throw new Error(`no sound for "${key}"; add it to the sounds`)
}

export const timeline = (r: Pick<Rendering, 'clock'>) => {
  const starts = new Float64Array(r.clock.length + 1)
  r.clock.forEach((d, s) => (starts[s + 1] = starts[s] + d))
  const last = r.clock.at(-1) ?? 0
  return (pos: number) => {
    const whole = Math.max(0, Math.min(Math.floor(pos), r.clock.length))
    return starts[whole] + (pos - whole) * (r.clock[whole] ?? last)
  }
}

export const renderStems = async (r: Rendering, sounds: Sounds, rate: number) => {
  const at = timeline(r)
  const seconds = at(r.bars * BAR) + TAIL
  const frames = Math.ceil(seconds * rate)
  const familyOf = (inst: string) => FAMILY_RULES[r.instruments.find((i) => i.name === inst)!.family]
  const groups = new Map<string, Stem & { voices: Map<string, ScoreEvent[]> }>()
  const order = [...r.instruments.map((i) => i.name), ...Object.keys(r.mix.parts)]
  for (const target of order) {
    const kind = target in r.mix.parts ? 'part' : 'instrument'
    groups.set(target, { target, kind, insts: [], channels: [], events: [], voices: new Map() })
  }
  for (const e of r.events) {
    const stem = groups.get(stemTarget(r, e))!
    const key = `${e.inst}|${e.articulation ?? ''}`
    stem.voices.set(key, [...(stem.voices.get(key) ?? []), e])
    stem.events.push(e)
    if (!stem.insts.includes(e.inst)) stem.insts.push(e.inst)
  }
  const stems: Stem[] = []
  for (const { voices, ...stem } of groups.values()) {
    if (!stem.events.length) continue
    const channels = [new Float32Array(frames), new Float32Array(frames)]
    for (const events of voices.values()) {
      const { inst, articulation } = events[0]
      const { source, program } = resolveSound(sounds, inst, articulation)
      const family = familyOf(inst)
      if (isSoundfont(source)) {
        const messages: SynthMessage[] = events.flatMap((e) => {
          const on = at(e.step + e.offset)
          const velocity = Math.min(127, Math.max(1, Math.round(e.velocity * 200)))
          return [
            { time: on, order: 3, kind: 'on', midi: e.midi, value: velocity },
            { time: at(e.step + e.offset + Math.min(e.held ?? e.length, e.length)), order: 0, kind: 'off', midi: e.midi, value: 0 },
          ]
        })
        if (family.pedal)
          for (const p of r.pedals.filter((p) => p.inst === inst)) {
            messages.push({ time: at(p.at), order: 1, kind: 'pedal', midi: 64, value: 0 })
            if (p.down) messages.push({ time: at(p.at + 1 / 8), order: 2, kind: 'pedal', midi: 64, value: 127 })
          }
        await playSoundfont(source, program ?? (articulation && ARTICULATION_PROGRAMS[articulation]) ?? family.program, messages, channels, rate)
      } else {
        for (const e of events)
          playSampler(source, channels, rate, { midi: e.midi, at: at(e.step + e.offset), length: at(e.step + e.offset + e.length) - at(e.step + e.offset), velocity: e.velocity, attack: e.attack })
      }
    }
    stems.push({ ...stem, channels })
  }
  return { stems, seconds }
}
