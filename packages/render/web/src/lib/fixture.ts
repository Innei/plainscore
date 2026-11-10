import type { Report } from '../../../src/report.ts'
import type { Edits, MixerState } from './types.ts'

const report = (targets: (number | null)[], measured: (number | null)[], comp: number[]): Report => ({
  title: 'Little',
  piece: 'Little',
  variant: null,
  seconds: 12,
  target: -14,
  ceiling: -1,
  integrated: -14,
  range: 3,
  truePeak: -1.2,
  gain: 6,
  limiter: { maxReduction: 0.2, overOneDb: 0 },
  sections: ['A', 'B', 'C'].map((mark, i) => ({
    mark,
    label: mark,
    start: i * 4,
    end: i * 4 + 4,
    target: targets[i],
    compensation: comp[i],
    measured: measured[i],
    diff: measured[i] === null || targets[i] === null ? null : measured[i]! - targets[i]!,
  })),
  seams: [],
  credits: [],
})

export const edits = (): Edits => ({
  mix: { piano: { gain: 0 }, harp: { gain: -3, send: null }, tune: { gain: 1 } },
  space: { decay: 2.6, predelay: 0.02, damp: 6500, wet: -10 },
  master: { loudness: -14, ceiling: -1.2, fade: 2.5, lowcut: null, presence: 0, air: { gain: 2, freq: 9000 } },
  loudness: { A: -16, B: null, C: -13 },
})

export const state = (): MixerState => ({
  file: '/tmp/little.score',
  version: 1,
  title: 'Little',
  piece: { id: 't', title: 'Little' },
  variant: null,
  tempo: 120,
  bars: 6,
  sections: ['A', 'B', 'C'].map((mark, i) => ({ mark, label: mark, start: i * 4, end: i * 4 + 4, tonic: 'C', keyChange: i === 2, parts: ['tune'] })),
  stems: [
    { index: 0, target: 'piano', kind: 'instrument', insts: ['piano'] },
    { index: 1, target: 'harp', kind: 'instrument', insts: ['harp'] },
    { index: 2, target: 'tune', kind: 'part', insts: ['piano'] },
  ],
  edits: edits(),
  mix: { instruments: { piano: { gain: 0, pan: 0, send: 0 }, harp: { gain: -3, pan: 0, send: null } }, parts: { tune: { gain: 1, pan: 0, send: 0 } } },
  partInst: { tune: 'piano' },
  report: report([-16, null, -13], [-16, -15, -13], [2, 2, -1]),
  curve: { step: 1, window: 3, values: [-16, -16, -15, -15, -15, -14, -13, -13, -13, -14] },
  lanes: [{ target: 'piano', spans: [[0, 12]] }],
  text: 'score 0.3\n',
})
