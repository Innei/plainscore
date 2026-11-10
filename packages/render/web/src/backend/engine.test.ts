import { describe, expect, it } from 'vitest'
import { SCORE, SOUNDS, backendContract } from './contract.ts'
import { createEngine } from './engine.ts'
import { type ScoreFiles, type Transport, createWorkerBackend } from './workerBackend.ts'

const OPEN = { text: SCORE, name: 'little.score', piece: 't', variant: null }

const wire = async (files: Partial<ScoreFiles> = {}) => {
  const engine = createEngine({ loadSounds: async () => SOUNDS })
  await engine.open(OPEN, () => {})
  const transport: Transport = { call: async (method, args) => (engine[method] as (...a: unknown[]) => unknown)(...args) }
  const written: string[] = []
  const downloads: string[] = []
  const all: ScoreFiles = { name: 'little.score', inPlace: false, check: async () => {}, write: async (text) => void written.push(text), download: (name) => void downloads.push(name), ...files }
  const calls: string[] = []
  const counted: Transport = { call: (method, args) => (calls.push(method), transport.call(method, args)) }
  return { engine, backend: createWorkerBackend(counted, all, { autoMeasure: true }), written, downloads, calls }
}

backendContract('the worker backend', async () => ({ backend: (await wire()).backend, close: () => {} }))

describe('the browser engine', () => {
  it('reports sounds, rendering and measuring in that order', async () => {
    const stages: string[] = []
    const engine = createEngine({
      loadSounds: async (_, onProgress) => {
        onProgress({ stage: 'sounds', loaded: 1, total: 2 })
        return SOUNDS
      },
    })
    await engine.open(OPEN, (p) => stages.push(p.stage))
    expect(stages).toEqual(['sounds', 'rendering', 'measuring'])
  })

  it('refuses a piece over the memory limit before loading sounds', async () => {
    let loaded = false
    const engine = createEngine({ loadSounds: async () => ((loaded = true), SOUNDS), limit: 1 })
    await expect(engine.open(OPEN, () => {})).rejects.toThrow(/too large/)
    expect(loaded).toBe(false)
  })

  it('names an instrument list for the sounds it needs', async () => {
    let asked: string[] = []
    const engine = createEngine({ loadSounds: async (instruments) => ((asked = instruments), SOUNDS) })
    await engine.open(OPEN, () => {})
    expect(asked).toEqual(['piano', 'harp'])
  })
})

describe('saving from the worker backend', () => {
  it('hands the new text to the files and makes it the baseline', async () => {
    const { backend, written } = await wire()
    const state = await backend.state()
    const next = await backend.save({ ...state.edits, loudness: { ...state.edits.loudness, A: -15 } }, state.version)
    expect(written).toEqual([next.text])
    expect((await backend.state()).text).toBe(next.text)
  })

  it('leaves the score alone when the file changed underneath', async () => {
    const { backend } = await wire({ inPlace: true, check: async () => Promise.reject(new Error('little.score changed since it was opened')) })
    const state = await backend.state()
    await expect(backend.save({ ...state.edits, loudness: { ...state.edits.loudness, A: -15 } }, state.version)).rejects.toThrow(/changed/)
    expect((await backend.state()).version).toBe(1)
  })

  it('keeps saving possible after a write that failed, and downloads a copy instead', async () => {
    let fail = true
    const { backend, downloads, written } = await wire({
      inPlace: true,
      write: async (text) => {
        if (fail) throw new Error('not allowed')
        written.push(text)
      },
    })
    const state = await backend.state()
    const edits = { ...state.edits, loudness: { ...state.edits.loudness, A: -15 } }
    await expect(backend.save(edits, state.version)).rejects.toThrow(/not allowed.*copy/)
    expect(downloads).toEqual(['little.score'])
    expect((await backend.state()).version).toBe(1)
    fail = false
    expect((await backend.save(edits, state.version)).version).toBe(2)
  })

  it('fetches one stem at a time however many are asked for', async () => {
    const engine = createEngine({ loadSounds: async () => SOUNDS })
    await engine.open(OPEN, () => {})
    let active = 0
    let most = 0
    const slow: Transport = {
      call: async (method, args) => {
        most = Math.max(most, ++active)
        await new Promise((done) => setTimeout(done, 5))
        active--
        return (engine[method] as (...a: unknown[]) => unknown)(...args)
      },
    }
    const backend = createWorkerBackend(slow, { name: 'little.score', inPlace: false, check: async () => {}, write: async () => {}, download: () => {} }, { autoMeasure: true })
    const ctx = { createBuffer: (channels: number, length: number) => ({ numberOfChannels: channels, length, copyToChannel: () => {} }) } as unknown as BaseAudioContext
    await Promise.all([backend.stemAudio(0, ctx), backend.stemAudio(1, ctx)])
    expect(most).toBe(1)
  })

  it('says how it saves', async () => {
    expect((await wire()).backend.capabilities).toMatchObject({ save: 'download', formats: ['wav'], reopen: true })
    expect((await wire({ inPlace: true })).backend.capabilities.save).toBe('file-handle')
  })

  it('downloads the exported WAV', async () => {
    const { backend, downloads } = await wire()
    await backend.exportAudio((await backend.state()).edits, ['wav'])
    expect(downloads).toEqual(['little.wav'])
  })
})
