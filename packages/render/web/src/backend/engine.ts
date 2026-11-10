import { type ScoreEdits, checkScore } from 'plainscore'
import { encodeWav } from '../../../src/dsp/wav.ts'
import { RATE } from '../../../src/offline.ts'
import { type Session, createSession, planScore } from '../../../src/session.ts'
import type { Sounds } from '../../../src/sources/types.ts'
import type { MixerState } from '../lib/types.ts'
import { MEMORY_LIMIT, estimateBytes } from './memory.ts'

export type Progress = { stage: 'sounds'; loaded: number; total: number | null } | { stage: 'rendering' } | { stage: 'measuring' }

export interface OpenRequest {
  text: string
  name: string
  piece: string
  variant: string | null
}

export interface EngineOptions {
  loadSounds: (instruments: string[], onProgress: (progress: Progress) => void) => Promise<Sounds>
  limit?: number
}

export const createEngine = ({ loadSounds, limit = MEMORY_LIMIT }: EngineOptions) => {
  let session: Session | null = null
  let name = ''
  const held = () => {
    if (!session) throw new Error('no score is open')
    return session
  }
  const state = () => ({ file: name, ...held().describe() }) as unknown as MixerState

  return {
    async open(request: OpenRequest, onProgress: (progress: Progress) => void) {
      const plan = planScore(request.text, request.name, request.piece, request.variant)
      const bytes = estimateBytes(plan.seconds, plan.stems)
      if (bytes > limit) {
        const minutes = Math.round(plan.seconds / 6) / 10
        throw new Error(`This piece is too large to render in the browser: ${minutes} minutes in ${plan.stems} parts needs about ${Math.round(bytes / 1e6)} MB. Use the plainscore-render mixer command for it.`)
      }
      const sounds = await loadSounds(checkScore(request.text, request.name).instruments.map((i) => i.name), onProgress)
      name = request.name
      session = await createSession({ ...request, sounds, onProgress })
      return state()
    },
    state,
    measure: (edits: ScoreEdits) => held().measure(edits),
    rewrite(edits: ScoreEdits, version: number) {
      const s = held()
      if (version !== s.version) throw new Error('the score changed since this page loaded it')
      return s.rewrite(edits)
    },
    async commit(text: string) {
      await held().apply(text, true)
      return state()
    },
    exportWav(edits: ScoreEdits) {
      const { audio, report, curve } = held().master(edits)
      return { bytes: encodeWav(audio, RATE, 24), name: `${name.replace(/\.[^.]+$/, '')}.wav`, report, curve }
    },
    stem(index: number) {
      return { channels: held().stems[index].channels, rate: RATE }
    },
  }
}

export type Engine = ReturnType<typeof createEngine>
