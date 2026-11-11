import { type OpenRequest, createEngine } from './engine.ts'
import { completeSounds, fetchSoundfont, soundsFor } from './sounds.ts'

interface Request {
  id: number
  method: string
  args: unknown[]
}

const scope = self as unknown as { postMessage(message: unknown): void; onmessage: ((event: MessageEvent<Request>) => void) | null }

const SOUNDFONT = new URL(`${import.meta.env.BASE_URL}sounds/MuseScore_General.sf3`, self.location.origin).href

const engine = createEngine({
  loadSounds: async (instruments, onProgress, prepared) => {
    const soundfont = () => fetchSoundfont(SOUNDFONT, onProgress)
    return prepared ? completeSounds(prepared, soundfont) : soundsFor(instruments, await soundfont())
  },
})

scope.onmessage = async ({ data: { id, method, args } }) => {
  try {
    const result = method === 'open' ? await engine.open(args[0] as OpenRequest, (progress) => scope.postMessage({ id, progress })) : await (engine[method as 'state'] as (...a: unknown[]) => unknown)(...args)
    scope.postMessage({ id, result })
  } catch (error) {
    scope.postMessage({ id, error: (error as Error).message })
  }
}
