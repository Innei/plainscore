import type { Rendering } from './render.ts'
import { type Staff, layout } from './staves.ts'

const PPQ = 480
const REPEDAL = PPQ / 16
const PERCUSSION = 9

const varlen = (n: number) => {
  const bytes = [n & 0x7f]
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80)
  return bytes
}

const text = (type: number, value: string) => {
  const bytes = [...new TextEncoder().encode(value)]
  return [0xff, type, ...varlen(bytes.length), ...bytes]
}

const chunk = (type: string, data: number[]) => {
  const len = data.length
  return [...type].map((c) => c.charCodeAt(0)).concat([(len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff], data)
}

const track = (events: { tick: number; bytes: number[] }[]) => {
  let last = 0
  const data: number[] = []
  for (const { tick, bytes } of events) {
    data.push(...varlen(tick - last), ...bytes)
    last = tick
  }
  return chunk('MTrk', [...data, 0, 0xff, 0x2f, 0])
}

const tick = (eighths: number) => Math.round((eighths * PPQ) / 2)

const tempo = (secondsPerEighth: number) => {
  const usec = Math.round(secondsPerEighth * 2_000_000)
  return [0xff, 0x51, 3, (usec >> 16) & 0xff, (usec >> 8) & 0xff, usec & 0xff]
}

const pedal = (r: Rendering, staff: Staff, channel: number) =>
  r.pedals
    .filter((p) => p.inst === staff.inst)
    .flatMap(({ at, down }) => [
      { tick: tick(at), order: 1, bytes: [0xb0 | channel, 64, 0] },
      ...(down ? [{ tick: tick(at) + REPEDAL, order: 2, bytes: [0xb0 | channel, 64, 127] }] : []),
    ])

export const toMidi = (r: Rendering) => {
  const { staves, staffOf } = layout(r)
  const conductor = track([
    { tick: 0, bytes: text(0x03, r.title) },
    { tick: 0, bytes: tempo(r.clock[0] ?? 30 / r.tempo) },
    { tick: 0, bytes: [0xff, 0x58, 4, 4, 2, 24, 8] },
    ...r.clock.flatMap((seconds, step) => (step && Math.abs(seconds - r.clock[step - 1]) > 1e-9 ? [{ tick: tick(step), bytes: tempo(seconds) }] : [])),
  ])
  const tracks = staves.map((staff, i) => {
    const channel = i >= PERCUSSION ? i + 1 : i
    const notes = r.events
      .filter((e) => staffOf(e) === staff.id)
      .flatMap((e) => {
        const on = tick(e.step + e.offset)
        const velocity = Math.min(127, Math.max(1, Math.round(e.velocity * 200)))
        return [
          { tick: on, order: 3, bytes: [0x90 | channel, e.midi, velocity] },
          { tick: on + tick(Math.min(e.held ?? e.length, e.length)), order: 0, bytes: [0x80 | channel, e.midi, 0] },
        ]
      })
      .concat(staff.pedal ? pedal(r, staff, channel) : [])
      .sort((a, b) => a.tick - b.tick || a.order - b.order)
    return track([{ tick: 0, bytes: text(0x03, staff.name) }, { tick: 0, bytes: [0xc0 | channel, staff.program] }, ...notes])
  })
  return new Uint8Array([...chunk('MThd', [0, 1, 0, tracks.length + 1, PPQ >> 8, PPQ & 0xff]), ...conductor, ...tracks.flat()])
}
