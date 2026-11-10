import type { MixerState } from '../lib/types.ts'
import type { OpenRequest, Progress } from './engine.ts'
import type { Transport } from './workerBackend.ts'

interface Reply {
  id: number
  result?: unknown
  error?: string
  progress?: Progress
}

export const createWorkerTransport = (worker: Worker) => {
  let next = 0
  const waiting = new Map<number, { done: (value: unknown) => void; fail: (error: Error) => void; onProgress?: (progress: Progress) => void }>()
  worker.onmessage = ({ data }: MessageEvent<Reply>) => {
    const entry = waiting.get(data.id)
    if (!entry) return
    if (data.progress) return entry.onProgress?.(data.progress)
    waiting.delete(data.id)
    if (data.error !== undefined) entry.fail(new Error(data.error))
    else entry.done(data.result)
  }
  worker.onerror = (event) => {
    for (const entry of waiting.values()) entry.fail(new Error(event.message || 'The renderer stopped; the piece may be too large for this browser.'))
    waiting.clear()
  }
  const send = (method: string, args: unknown[], onProgress?: (progress: Progress) => void) =>
    new Promise<unknown>((done, fail) => {
      const id = ++next
      waiting.set(id, { done, fail, onProgress })
      worker.postMessage({ id, method, args })
    })
  const transport: Transport = { call: (method, args) => send(method, args) }
  return { transport, open: (request: OpenRequest, onProgress: (progress: Progress) => void) => send('open', [request], onProgress) as Promise<MixerState> }
}
