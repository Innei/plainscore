import type { Sounds } from '../../../src/sources/types.ts'
import type { Prepared, Progress } from './engine.ts'

const CACHE = 'plainscore-sounds-v1'
const SAMPLES_CACHE = 'plainscore-samples-v1'

const read = async (res: Response, onBytes: (loaded: number, total: number | null) => void) => {
  const total = Number(res.headers.get('content-length')) || null
  if (!res.body) return res.arrayBuffer()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onBytes(loaded, total)
  }
  const out = new Uint8Array(loaded)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out.buffer
}

const fetchCached = async (url: string, name: string, onBytes: (loaded: number, total: number | null) => void) => {
  const cache = 'caches' in globalThis ? await caches.open(name).catch(() => null) : null
  const hit = await cache?.match(url)
  if (hit) {
    const buffer = await hit.arrayBuffer()
    onBytes(buffer.byteLength, buffer.byteLength)
    return buffer
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`The sounds could not be downloaded (${res.status}).`)
  const buffer = await read(res, onBytes)
  await cache?.put(url, new Response(buffer.slice(0), { headers: { 'content-type': 'application/octet-stream' } })).catch(() => {})
  return buffer
}

export const fetchSoundfont = (url: string, onProgress: (progress: Progress) => void) => fetchCached(url, CACHE, (loaded, total) => onProgress({ stage: 'sounds', loaded, total }))

export const fetchSample = (url: string, onBytes: (loaded: number, total: number | null) => void) => fetchCached(url, SAMPLES_CACHE, onBytes)

export const soundsFor = (instruments: string[], soundfont: ArrayBuffer): Sounds => Object.fromEntries(instruments.map((name) => [name, { soundfont }]))

export const completeSounds = async (prepared: Prepared, fetchSoundfont: () => Promise<ArrayBuffer>): Promise<Sounds> =>
  prepared.soundfont.length ? { ...prepared.sounds, ...soundsFor(prepared.soundfont, await fetchSoundfont()) } : prepared.sounds
