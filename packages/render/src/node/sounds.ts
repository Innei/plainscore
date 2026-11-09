import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { decodeWav } from '../dsp/wav.ts'
import type { SoundSource, Sounds } from '../sources/types.ts'

interface Entry {
  soundfont?: string
  preset?: number
  bank?: number
  samples?: string
  sprite?: string | Record<string, [number, number]>
  attack?: number
  release?: number
  sustain?: boolean
  credit?: string
}

const DECODE_RATE = 48000

const read = async (path: string) => {
  try {
    return await readFile(path)
  } catch {
    throw new Error(`cannot read "${path}"`)
  }
}

export const decodeAudio = async (path: string) => {
  if (extname(path).toLowerCase() === '.wav') return decodeWav(new Uint8Array(await read(path)))
  await read(path)
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', String(DECODE_RATE), '-'], { maxBuffer: 2 ** 31 - 1 })
  const all = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4)
  const n = all.length / 2
  const channels = [new Float32Array(n), new Float32Array(n)]
  for (let i = 0; i < n; i++) {
    channels[0][i] = all[2 * i]
    channels[1][i] = all[2 * i + 1]
  }
  return { rate: DECODE_RATE, channels }
}

export const loadSounds = async (file: string): Promise<Sounds> => {
  const base = dirname(resolve(file))
  const table = JSON.parse(await readFile(file, 'utf8').catch(() => Promise.reject(new Error(`cannot read "${file}"`)))) as Record<string, Entry>
  const buffers = new Map<string, Promise<ArrayBuffer>>()
  const shared = (path: string) => {
    const full = resolve(base, path)
    if (!buffers.has(full)) buffers.set(full, read(full).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer))
    return buffers.get(full)!
  }
  const sprite = async (spec: Entry['sprite']) => {
    if (!spec) throw new Error('a samples sound needs a "sprite"')
    if (typeof spec !== 'string') return spec
    const [path, key] = spec.split('#')
    const json = JSON.parse((await read(resolve(base, path))).toString('utf8'))
    const found = key ? json[key] : json
    if (!found) throw new Error(`no "${key}" in ${path}`)
    return found as Record<string, [number, number]>
  }
  const sounds: Sounds = {}
  for (const [name, e] of Object.entries(table)) {
    const credit = e.credit === undefined ? {} : { credit: e.credit }
    let source: SoundSource
    if (e.soundfont) source = { soundfont: await shared(e.soundfont), ...(e.preset === undefined ? {} : { preset: e.preset }), ...(e.bank === undefined ? {} : { bank: e.bank }), ...credit }
    else if (e.samples) {
      const audio = await decodeAudio(resolve(base, e.samples))
      source = {
        samples: audio.channels,
        rate: audio.rate,
        sprite: await sprite(e.sprite),
        ...(e.attack === undefined ? {} : { attack: e.attack }),
        ...(e.release === undefined ? {} : { release: e.release }),
        ...(e.sustain === undefined ? {} : { sustain: e.sustain }),
        ...credit,
      }
    } else throw new Error(`"${name}" needs "soundfont" or "samples"`)
    sounds[name] = source
  }
  return sounds
}
