import type { SampleSource } from './types.ts'

const NAMES = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B']
const SKIP = 0.9
const XFADE = 1.2
const MIN_ATTACK = 0.004
const RELEASE = 1

export const spriteMidi = (name: string) => {
  const m = name.match(/^([A-G])(s|#)?(-?\d)$/)
  if (!m) throw new Error(`sprite note "${name}" should look like "Cs4" or "A2"`)
  return NAMES.indexOf(`${m[1]}${m[2] ? 's' : ''}`) + (Number(m[3]) + 1) * 12
}

export interface SamplerNote {
  midi: number
  at: number
  length: number
  velocity: number
  attack?: number
}

const notesOf = new WeakMap<SampleSource, { midi: number; offset: number; duration: number }[]>()

const spriteNotes = (source: SampleSource) => {
  let notes = notesOf.get(source)
  if (!notes) {
    notes = Object.entries(source.sprite).map(([name, [offset, duration]]) => ({ midi: spriteMidi(name), offset, duration }))
    notesOf.set(source, notes)
  }
  return notes
}

export const playSampler = (source: SampleSource, out: Float32Array[], rate: number, note: SamplerNote) => {
  const notes = spriteNotes(source)
  if (!notes.length) return
  let near = notes[0]
  for (const n of notes) if (Math.abs(n.midi - note.midi) < Math.abs(near.midi - note.midi)) near = n
  const ratio = 2 ** ((note.midi - near.midi) / 12)
  const attack = note.attack ?? source.attack ?? 0
  const release = source.release ?? RELEASE
  const peak = note.at + Math.min(Math.max(attack, MIN_ATTACK), note.length)
  const end = Math.max(peak, note.at + note.length)
  const stopAt = end + release + 0.1
  const envelope = (t: number) => {
    if (t < note.at) return 0
    if (t < peak) return (note.velocity * (t - note.at)) / (peak - note.at)
    if (t <= end) return note.velocity
    return note.velocity * Math.exp(-(t - end) / (release / 4))
  }
  const first = near.duration / ratio
  const segments = [{ at: note.at, offset: near.offset, length: first, fadeIn: false }]
  const loop = (near.duration - SKIP) / ratio
  const looping = source.sustain && loop > 0
  const fade = looping ? Math.min(XFADE, loop / 2) : XFADE
  if (looping) for (let t = note.at + first - fade; t < stopAt; t += loop - fade) segments.push({ at: t, offset: near.offset + SKIP, length: loop, fadeIn: true })
  const step = (ratio * source.rate) / rate
  const [left, right = left] = source.samples
  for (const seg of segments) {
    const segEnd = seg.at + seg.length
    const stop = Math.min(segEnd, stopAt)
    const from = Math.max(0, Math.ceil(seg.at * rate))
    const to = Math.min(out[0].length, Math.ceil(stop * rate))
    const fadesOut = segEnd < stopAt
    for (let i = from; i < to; i++) {
      const t = i / rate
      const pos = seg.offset * source.rate + (t - seg.at) * rate * step
      const k = Math.floor(pos)
      if (k + 1 >= left.length) break
      const f = pos - k
      let gain = envelope(t)
      if (seg.fadeIn && t < seg.at + fade) gain *= (t - seg.at) / fade
      if (fadesOut && t > segEnd - fade) gain *= Math.max(0, (segEnd - t) / fade)
      out[0][i] += gain * (left[k] + (left[k + 1] - left[k]) * f)
      out[1][i] += gain * (right[k] + (right[k + 1] - right[k]) * f)
    }
  }
}
