import type { ScoreEvent } from './expand.ts'
import type { MixRow, PieceSource, ScoreFile } from './parse.ts'

export interface MixSetting {
  gain: number
  pan: number
  send: number | null
  attack?: number
}

export interface Mix {
  instruments: Record<string, MixSetting>
  parts: Record<string, MixSetting>
}

const over = (base: MixSetting, row: MixRow | undefined, add: boolean): MixSetting => {
  if (!row) return base
  const attack = row.attack ?? base.attack
  return {
    gain: (add ? base.gain : 0) + row.db,
    pan: row.pan ?? base.pan,
    send: row.send === undefined ? base.send : row.send,
    ...(attack === undefined ? {} : { attack }),
  }
}

export const resolveMix = (score: ScoreFile, piece: PieceSource, events: ScoreEvent[]): Mix => {
  const blank: MixSetting = { gain: 0, pan: 0, send: 0 }
  const instruments = Object.fromEntries(score.instruments.map(({ name }) => [name, over(blank, piece.mix.get(name), false)]))
  const parts: Record<string, MixSetting> = {}
  for (const [target, row] of piece.mix) {
    if (target in instruments) continue
    const insts = new Set(events.filter((e) => e.part === target).map((e) => e.inst))
    const base = insts.size === 1 ? instruments[[...insts][0]] : blank
    parts[target] = over(base, row, true)
  }
  return { instruments, parts }
}

export interface Space {
  decay: number
  predelay: number
  damp: number
  wet: number
}

export interface Master {
  loudness: number
  ceiling: number
  fade: number
  lowcut: number | null
  presence: number
  air: { gain: number; freq: number } | null
}

export const DEFAULT_SPACE: Space = { decay: 2.4, predelay: 0.02, damp: 6500, wet: -12 }
export const DEFAULT_MASTER: Master = { loudness: -14, ceiling: -1, fade: 0, lowcut: null, presence: 0, air: null }
export const AIR_FREQ = 9000

const fields = (words: string[], shapes: Record<string, RegExp>, example: string) => {
  const text = words.join(' ')
  const out: Record<string, number> = {}
  let rest = text
  while (rest.trim()) {
    const hit = Object.entries(shapes).find(([key, shape]) => !(key in out) && shape.test(rest.trim()))
    if (!hit) throw new Error(`write it as "${example}"`)
    const match = rest.trim().match(hit[1])!
    out[hit[0]] = Number(match[1])
    rest = rest.trim().slice(match[0].length)
  }
  return out
}

export const spaceRow = (words: string[]): Space => {
  const got = fields(
    words,
    {
      decay: /^decay (\d+(?:\.\d+)?)s\b/,
      predelay: /^predelay (\d+(?:\.\d+)?)ms\b/,
      damp: /^damp (\d+(?:\.\d+)?) Hz\b/,
      wet: /^wet ([+-]?\d+(?:\.\d+)?) dB\b/,
    },
    'space  decay 2.4s  predelay 20ms  damp 6500 Hz  wet -12 dB',
  )
  return { ...DEFAULT_SPACE, ...got, ...('predelay' in got ? { predelay: got.predelay / 1000 } : {}) }
}

export const masterHead = (words: string[]): Master => {
  const got = fields(
    words,
    { loudness: /^([+-]?\d+(?:\.\d+)?) LUFS\b/, ceiling: /^ceiling ([+-]?\d+(?:\.\d+)?) dBTP\b/, fade: /^fade (\d+(?:\.\d+)?)s\b/ },
    'master  -14 LUFS  ceiling -1 dBTP  fade 2.5s',
  )
  return { ...DEFAULT_MASTER, ...got }
}

export const masterRow = (words: string[], master: Master) => {
  const text = words.join(' ')
  const lowcut = text.match(/^lowcut (\d+(?:\.\d+)?) Hz$/)
  const presence = text.match(/^presence ([+-]?\d+(?:\.\d+)?) dB$/)
  const air = text.match(/^air ([+-]?\d+(?:\.\d+)?) dB(?: at (\d+(?:\.\d+)?) Hz)?$/)
  if (lowcut) master.lowcut = Number(lowcut[1])
  else if (presence) master.presence = Number(presence[1])
  else if (air) master.air = { gain: Number(air[1]), freq: air[2] ? Number(air[2]) : AIR_FREQ }
  else throw new Error('master rows are "lowcut 35 Hz", "presence +1 dB" and "air +2 dB at 9000 Hz"')
}
