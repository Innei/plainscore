import type { Sounds } from '../../../src/sources/types.ts'
import type { Progress } from './engine.ts'

const CACHE = 'plainscore-sounds-v1'

const read = async (res: Response, onProgress: (progress: Progress) => void) => {
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
    onProgress({ stage: 'sounds', loaded, total })
  }
  const out = new Uint8Array(loaded)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out.buffer
}

export const fetchSoundfont = async (url: string, onProgress: (progress: Progress) => void) => {
  const cache = 'caches' in globalThis ? await caches.open(CACHE).catch(() => null) : null
  const hit = await cache?.match(url)
  if (hit) return hit.arrayBuffer()
  const res = await fetch(url)
  if (!res.ok) throw new Error(`The sounds could not be downloaded (${res.status}).`)
  const buffer = await read(res, onProgress)
  await cache?.put(url, new Response(buffer.slice(0), { headers: { 'content-type': 'application/octet-stream' } })).catch(() => {})
  return buffer
}

export const soundsFor = (instruments: string[], soundfont: ArrayBuffer): Sounds => Object.fromEntries(instruments.map((name) => [name, { soundfont }]))
