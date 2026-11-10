import type { MixerState } from '../lib/types.ts'
import type { BackendEvent, Measured, MixerBackend } from './types.ts'

export const createHttpBackend = (base = ''): MixerBackend => {
  const call = async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${base}${path}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? res.statusText)
    return json as T
  }

  return {
    capabilities: { formats: ['wav', 'flac', 'mp3'], save: 'write', autoMeasure: true, reopen: false },
    state: () => call<MixerState>('/api/state'),
    measure: (edits) => call<Measured>('/api/measure', { edits }),
    save: (edits, version) => call<MixerState>('/api/write', { edits, version }),
    exportAudio: (edits, formats) => call<Measured & { files: string[] }>('/api/export', { edits, formats }),
    stemAudio: async (index, ctx) => ctx.decodeAudioData(await (await fetch(`${base}/stems/${index}.wav`)).arrayBuffer()),
    onEvent(listener) {
      const events = new EventSource(`${base}/api/events`)
      const on = (type: BackendEvent['type']) => (e: Event) => listener(type === 'failed' ? { type, error: JSON.parse((e as MessageEvent).data).error } : { type })
      events.addEventListener('changed', on('changed'))
      events.addEventListener('ready', on('ready'))
      events.addEventListener('failed', on('failed'))
      return () => events.close()
    },
  }
}
