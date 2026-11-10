import { liveGraph } from '../../src/live.ts'
import { playPosition, sectionAt } from './lib/position.ts'
import type { Master, Mix, MixerState, Space } from './lib/types.ts'

export interface Settings {
  mix: Mix
  space: Space
  master: Master
  gain: number
}

export type Player = Awaited<ReturnType<typeof createPlayer>>

export const createPlayer = async (state: MixerState, init: Settings, onChange: () => void) => {
  const ctx = new AudioContext({ sampleRate: 48000 })
  const buffers = await Promise.all(state.stems.map(async (s) => ctx.decodeAudioData(await (await fetch(`/stems/${s.index}.wav`)).arrayBuffer())))
  const live = liveGraph(ctx, init, { gain: init.gain })
  live.output.connect(ctx.destination)
  const meters = new Map(
    state.stems.map((s) => {
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      live.inputs[s.target]?.connect(analyser)
      return [s.target, analyser] as const
    }),
  )
  const scratch = new Float32Array(1024)
  let mix = init.mix
  let sources: AudioBufferSourceNode[] = []
  let playing = false
  let started = 0
  let offset = 0
  let loop = false
  let comp: number[] = state.sections.map(() => 0)
  const mute = new Set<string>()
  const solo = new Set<string>()

  const length = () => buffers[0]?.duration ?? 0
  const loopSpan = () => {
    if (!loop) return null
    const s = state.sections[sectionAt(state.sections, offset)]
    return { start: s.start, end: Math.min(s.end, length()) }
  }

  const applyMute = () => {
    live.update({ mix })
    for (const s of state.stems) {
      const out = mute.has(s.target) || (solo.size > 0 && !solo.has(s.target))
      if (out && live.inputs[s.target]) live.inputs[s.target].gain.value = 0
    }
  }

  const schedule = (at: number) => {
    const span = loopSpan()
    if (span) live.compensate([{ start: 0, gain: comp[sectionAt(state.sections, offset)] ?? 0 }], at, 0)
    else live.compensate(state.sections.map((s, k) => ({ start: s.start, gain: comp[k] ?? 0 })), at, offset)
  }

  const position = () => (playing ? playPosition({ elapsed: ctx.currentTime - started, loop: loopSpan(), length: length() }) : offset)

  const pause = () => {
    if (!playing) return
    offset = position()
    for (const s of sources) s.stop()
    sources = []
    playing = false
    onChange()
  }

  const play = async () => {
    if (!buffers.length || playing) return
    await ctx.resume()
    if (offset >= length() - 0.05) offset = 0
    const at = ctx.currentTime + 0.05
    const span = loopSpan()
    sources = buffers.map((buffer, i) => {
      const src = ctx.createBufferSource()
      src.buffer = buffer
      if (span) {
        src.loop = true
        src.loopStart = span.start
        src.loopEnd = span.end
      }
      src.connect(live.inputs[state.stems[i].target])
      src.start(at, offset)
      return src
    })
    schedule(at)
    started = at - offset
    playing = true
    onChange()
  }

  const restart = () => {
    if (!playing) return
    pause()
    void play()
  }

  return {
    length,
    position,
    isPlaying: () => playing,
    isLooping: () => loop,
    play,
    pause,
    toggle: () => (playing ? pause() : void play()),
    seek(t: number) {
      const was = playing
      pause()
      offset = Math.max(0, Math.min(t, length()))
      if (was) void play()
      onChange()
    },
    setLoop(on: boolean) {
      loop = on
      restart()
      onChange()
    },
    setComp(next: number[]) {
      if (next.length === comp.length && next.every((v, i) => Math.abs(v - comp[i]) < 1e-6)) return
      comp = next
      restart()
    },
    update(next: Settings) {
      mix = next.mix
      live.update(next)
      applyMute()
    },
    audition(kind: 'mute' | 'solo', target: string, on: boolean) {
      const group = kind === 'mute' ? mute : solo
      if (on) group.add(target)
      else group.delete(target)
      applyMute()
      onChange()
    },
    auditioned: (kind: 'mute' | 'solo', target: string) => (kind === 'mute' ? mute : solo).has(target),
    level(target: string) {
      const analyser = meters.get(target)
      if (!analyser || !playing) return 0
      analyser.getFloatTimeDomainData(scratch)
      let sum = 0
      for (const v of scratch) sum += v * v
      const db = 10 * Math.log10(sum / scratch.length + 1e-12)
      return Math.max(0, Math.min(1, (db + 60) / 60))
    },
    async dispose() {
      for (const s of sources) s.stop()
      live.dispose()
      await ctx.close()
    },
  }
}
