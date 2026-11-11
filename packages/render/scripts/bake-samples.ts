import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { decodeWav, encodeWav } from '../src/dsp/wav.ts'

type Sprite = Record<string, [number, number]>

const TRIM: Record<string, number> = { piano: 0.62, cello: 1.6, violins: 2, harp: 2.4, pizz: 2 }
const CALIBRATION: Record<string, { target: number; clamp: number }> = {
  cello: { target: -32.5, clamp: 3 },
  violins: { target: -36, clamp: 4 },
  harp: { target: -41, clamp: 6 },
}
const CEILING = 0.89
const BITRATE = '160k'

const SALAMANDER = 'Salamander Grand Piano by Alexander Holm (CC BY 3.0)'
const VSCO = 'VSCO 2 Community Edition by Versilian Studios (CC0)'

const SOUNDS = {
  piano: { file: 'piano', attack: 0.003, release: 1.6, credit: SALAMANDER },
  cello: { file: 'cello', attack: 0.35, release: 2.4, sustain: true, credit: VSCO },
  violins: { file: 'violins', attack: 0.55, release: 2.8, sustain: true, credit: VSCO },
  harp: { file: 'harp', attack: 0.003, release: 2.6, credit: VSCO },
  'violins pizz.': { file: 'pizz', attack: 0.003, release: 0.8, credit: VSCO },
}

const rmsDb = (channels: Float32Array[], from: number, to: number) => {
  let energy = 0
  for (const c of channels) for (let i = from; i < to; i++) energy += c[i] * c[i]
  return 10 * Math.log10(energy / (channels.length * (to - from)) || 1e-24)
}

export const bakeInstrument = (channels: Float32Array[], rate: number, sprite: Sprite, inst: string) => {
  const out = channels.map((c) => c.slice())
  const cal = CALIBRATION[inst]
  for (const [offset, duration] of Object.values(sprite)) {
    const from = Math.round(offset * rate)
    const to = Math.min(out[0].length, from + Math.round(duration * rate))
    const level = cal ? Math.max(-cal.clamp, Math.min(cal.clamp, cal.target - rmsDb(channels, from, to))) : 0
    const gain = TRIM[inst] * 10 ** (level / 20)
    for (const c of out) for (let i = from; i < to; i++) c[i] *= gain
  }
  return out
}

export const headroom = (sets: Float32Array[][]) => {
  let peak = 0
  for (const set of sets) for (const c of set) for (const x of c) peak = Math.max(peak, Math.abs(x))
  return peak > CEILING ? CEILING / peak : 1
}

export const manifestOf = (mp3s: Record<string, Uint8Array>) => {
  const names = Object.fromEntries(Object.entries(mp3s).map(([file, bytes]) => [file, `${file}-${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}.mp3`]))
  const manifest = Object.fromEntries(
    Object.entries(SOUNDS)
      .filter(([, { file }]) => file in names)
      .map(([name, { file, ...envelope }]) => [name, { samples: `./${names[file]}`, sprite: `./sprites.json#${file}`, ...envelope }]),
  )
  return { manifest, files: Object.fromEntries(Object.entries(mp3s).map(([file, bytes]) => [names[file], bytes])) }
}

const main = (source: string) => {
  const out = resolve(dirname(fileURLToPath(import.meta.url)), '../sounds')
  const sprites = JSON.parse(readFileSync(join(source, 'sprites.json'), 'utf8')) as Record<string, Sprite>
  const files = Object.values(SOUNDS).map((s) => s.file)
  const baked = files.map((file) => {
    const wav = decodeWav(new Uint8Array(readFileSync(join(source, `${file}.wav`))))
    return { file, rate: wav.rate, channels: bakeInstrument(wav.channels, wav.rate, sprites[file], file) }
  })
  const gain = headroom(baked.map((b) => b.channels))
  const scratch = mkdtempSync(join(tmpdir(), 'plainscore-bake-'))
  const mp3s: Record<string, Uint8Array> = {}
  for (const { file, rate, channels } of baked) {
    for (const c of channels) for (let i = 0; i < c.length; i++) c[i] *= gain
    const wav = join(scratch, `${file}.wav`)
    writeFileSync(wav, encodeWav(channels, rate, 24))
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', BITRATE, join(scratch, `${file}.mp3`)])
    mp3s[file] = new Uint8Array(readFileSync(join(scratch, `${file}.mp3`)))
  }
  rmSync(scratch, { recursive: true, force: true })
  const { manifest, files: named } = manifestOf(mp3s)
  mkdirSync(out, { recursive: true })
  for (const old of readdirSync(out).filter((f) => f.endsWith('.mp3'))) rmSync(join(out, old))
  for (const [name, bytes] of Object.entries(named)) writeFileSync(join(out, name), bytes)
  writeFileSync(join(out, 'sprites.json'), `${JSON.stringify(Object.fromEntries(files.map((f) => [f, sprites[f]])), null, 2)}\n`)
  writeFileSync(join(out, 'sounds.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`baked ${files.length} sounds into ${out}, shared gain ${(20 * Math.log10(gain)).toFixed(2)} dB`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = process.argv[2]
  if (!source) {
    console.error('usage: node scripts/bake-samples.ts <resume>/assets/bgm')
    process.exit(2)
  }
  main(resolve(source))
}
