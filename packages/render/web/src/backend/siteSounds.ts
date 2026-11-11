import { type ScoreFile, checkScore, expand } from 'plainscore'
import { RATE } from '../../../src/offline.ts'
import type { SampleSource, Sounds } from '../../../src/sources/types.ts'
import { soundKey } from '../../../src/stems.ts'
import type { Prepared, Progress } from './engine.ts'
import { fetchSample } from './sounds.ts'

export interface SitePlan {
  samples: Record<string, string>
  soundfont: string[]
}

export const planSiteSounds = (piece: string, variant: string | null, score: ScoreFile, manifest: Record<string, unknown>): SitePlan => {
  const family = new Map(score.instruments.map((i) => [i.name, i.family]))
  const keys = new Map<string, string>()
  for (const section of expand(score, piece, variant).sections)
    for (const { inst, articulation } of section.voices) keys.set(soundKey(inst, articulation), soundKey(family.get(inst)!, articulation))
  const plan: SitePlan = { samples: {}, soundfont: [] }
  for (const [key, wanted] of keys) {
    if (wanted in manifest) plan.samples[key] = wanted
    else plan.soundfont.push(key)
  }
  return plan
}

interface Entry {
  samples: string
  sprite: string
  attack?: number
  release?: number
  sustain?: boolean
  credit?: string
}

export interface SiteSoundDeps {
  manifestUrl: string
  fetchBytes: (url: string, onBytes: (loaded: number, total: number | null) => void) => Promise<ArrayBuffer>
  decode: (bytes: ArrayBuffer) => Promise<Float32Array[]>
}

const json = async <T>(deps: SiteSoundDeps, url: string) => JSON.parse(new TextDecoder().decode(await deps.fetchBytes(url, () => {}))) as T

export const prepareSiteSounds = async ({ text, name, piece, variant }: { text: string; name: string; piece: string; variant: string | null }, deps: SiteSoundDeps, onProgress: (progress: Progress) => void) => {
  const manifest = await json<Record<string, Entry>>(deps, deps.manifestUrl)
  const plan = planSiteSounds(piece, variant, checkScore(text, name), manifest)
  const at = (path: string) => new URL(path, deps.manifestUrl).href
  const entries = [...new Set(Object.values(plan.samples))].map((key) => [key, manifest[key]] as const)
  const sprites = new Map<string, Promise<Record<string, SampleSource['sprite']>>>()
  const spriteOf = (spec: string) => {
    const [path, key] = spec.split('#')
    const url = at(path)
    if (!sprites.has(url)) sprites.set(url, json(deps, url))
    return sprites.get(url)!.then((all) => (key ? all[key] : (all as unknown as SampleSource['sprite'])))
  }
  const counts = new Map<string, { loaded: number; total: number | null }>()
  const report = () => {
    const all = [...counts.values()]
    const total = all.every((c) => c.total !== null) ? all.reduce((n, c) => n + c.total!, 0) : null
    onProgress({ stage: 'sounds', loaded: all.reduce((n, c) => n + c.loaded, 0), total })
  }
  const files = new Map<string, Promise<Float32Array[]>>()
  const audioOf = (path: string) => {
    const url = at(path)
    if (!files.has(url)) {
      counts.set(url, { loaded: 0, total: null })
      files.set(
        url,
        deps.fetchBytes(url, (loaded, total) => (counts.set(url, { loaded, total }), report())).then((bytes) => deps.decode(bytes)),
      )
    }
    return files.get(url)!
  }
  const built = new Map(
    await Promise.all(
      entries.map(async ([key, e]): Promise<[string, SampleSource]> => {
        const [samples, sprite] = await Promise.all([audioOf(e.samples), spriteOf(e.sprite)])
        const extra = { attack: e.attack, release: e.release, sustain: e.sustain, credit: e.credit }
        return [key, { samples, rate: RATE, sprite, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined)) }]
      }),
    ),
  )
  const sounds: Sounds = Object.fromEntries(Object.entries(plan.samples).map(([sound, key]) => [sound, built.get(key)!]))
  const transfer = [...new Set([...built.values()].flatMap((s) => s.samples.map((c) => c.buffer as ArrayBuffer)))]
  return { prepared: { sounds, soundfont: plan.soundfont } satisfies Prepared, transfer }
}

const fetchFresh = async (url: string) => {
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`The sounds could not be downloaded (${res.status}).`)
  return res.arrayBuffer()
}

const decodeAudio = async (bytes: ArrayBuffer) => {
  const audio = await new OfflineAudioContext(2, 1, RATE).decodeAudioData(bytes)
  return Array.from({ length: audio.numberOfChannels }, (_, c) => {
    const out = new Float32Array(audio.length)
    audio.copyFromChannel(out, c)
    return out
  })
}

export const browserSoundDeps = (manifestUrl: string): SiteSoundDeps => ({
  manifestUrl,
  fetchBytes: (url, onBytes) => (url.endsWith('.json') ? fetchFresh(url) : fetchSample(url, onBytes)),
  decode: decodeAudio,
})
