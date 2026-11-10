import type { Edits, MixerState } from '../lib/types.ts'
import type { Engine, Progress } from './engine.ts'
import type { Measured, MixerBackend } from './types.ts'

type Method = Exclude<keyof Engine, 'open'>

export interface Transport {
  call(method: Method, args: unknown[]): Promise<unknown>
}

export interface ScoreFiles {
  name: string
  inPlace: boolean
  check(): Promise<void>
  write(text: string): Promise<void>
  download(name: string, data: string | Uint8Array): void
}

export type { Progress }

export const createWorkerBackend = (transport: Transport, files: ScoreFiles, options: { autoMeasure: boolean }): MixerBackend => {
  let stemQueue: Promise<unknown> = Promise.resolve()
  return {
    capabilities: { formats: ['wav'], save: files.inPlace ? 'file-handle' : 'download', autoMeasure: options.autoMeasure, reopen: true },
    state: () => transport.call('state', []) as Promise<MixerState>,
    measure: (edits: Edits) => transport.call('measure', [edits]) as Promise<Measured>,
    async save(edits, version) {
      await files.check()
      const text = (await transport.call('rewrite', [edits, version])) as string
      try {
        await files.write(text)
      } catch (error) {
        if (!files.inPlace) throw error
        files.download(files.name, text)
        throw new Error(`${files.name} could not be saved in place (${(error as Error).message}); a copy was downloaded instead`)
      }
      return transport.call('commit', [text]) as Promise<MixerState>
    },
    async exportAudio(edits) {
      const { bytes, name, report, curve } = (await transport.call('exportWav', [edits])) as Measured & { bytes: Uint8Array; name: string }
      files.download(name, bytes)
      return { files: [name], report, curve }
    },
    async stemAudio(index, ctx) {
      const fetched = stemQueue.then(() => transport.call('stem', [index]))
      stemQueue = fetched.catch(() => {})
      const { channels, rate } = (await fetched) as { channels: Float32Array[]; rate: number }
      const buffer = ctx.createBuffer(channels.length, channels[0].length, rate)
      channels.forEach((data, i) => buffer.copyToChannel(data as Float32Array<ArrayBuffer>, i))
      return buffer
    },
    onEvent: () => () => {},
  }
}
