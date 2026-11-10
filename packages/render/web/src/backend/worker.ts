import { type OpenRequest, createEngine } from './engine.ts'
import { fetchSoundfont, soundsFor } from './sounds.ts'

interface Request {
  id: number
  method: string
  args: unknown[]
}

const scope = self as unknown as { postMessage(message: unknown): void; onmessage: ((event: MessageEvent<Request>) => void) | null }

const engine = createEngine({
  loadSounds: async (instruments, onProgress) => soundsFor(instruments, await fetchSoundfont(new URL(`${import.meta.env.BASE_URL}sounds/MuseScore_General.sf3`, self.location.origin).href, onProgress)),
})

scope.onmessage = async ({ data: { id, method, args } }) => {
  try {
    const result = method === 'open' ? await engine.open(args[0] as OpenRequest, (progress) => scope.postMessage({ id, progress })) : await (engine[method as 'state'] as (...a: unknown[]) => unknown)(...args)
    scope.postMessage({ id, result })
  } catch (error) {
    scope.postMessage({ id, error: (error as Error).message })
  }
}
