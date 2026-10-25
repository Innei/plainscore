import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { toAbc } from '../src/abc/index.ts'
import { toMidi } from '../src/midi.ts'
import { parseScore } from '../src/parse.ts'
import { DEFAULT_SEED, render } from '../src/render.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const bgm = parseScore(read('examples/bgm.score'), 'bgm.score')
const road = parseScore(read('examples/road.score'), 'road.score')

const TRACKS = [
  { name: 'overview', score: bgm, piece: 'theme', variant: 'overview' },
  { name: 'browse', score: bgm, piece: 'theme', variant: 'browse' },
  { name: 'read', score: bgm, piece: 'theme', variant: 'read' },
  { name: 'cosmos', score: bgm, piece: 'stars', variant: null },
  { name: 'road', score: road, piece: 'road', variant: null },
]

interface SiteEvent {
  step: number
  offset: number
  inst: string
  part: string
  role: string | null
  midi: number
  length: number
  written: number
  held?: number
  velocity: number
  level: number
  rolled: boolean
}

const near = (a: number | undefined, b: number | undefined, tolerance: number) => Math.abs((a ?? 0) - (b ?? 0)) <= tolerance

describe.each(TRACKS)('$name matches the resume site at 34d99d7', ({ name, score, piece, variant }) => {
  it('writes the same ABC, except that a piece without variants names no scene', () => {
    const expected = read(`fixtures/${name}.abc`).replace(/^(T:.*) · cosmos$/m, '$1')
    expect(`${toAbc(render(score, piece, { variant }))}\n`).toBe(expected)
  })

  it('writes byte-identical MIDI', () => {
    const expected = new Uint8Array(readFileSync(new URL(`../fixtures/${name}.mid`, import.meta.url)))
    expect(toMidi(render(score, piece, { variant, seed: DEFAULT_SEED }))).toEqual(expected)
  })

  it('renders the same events', () => {
    const site: SiteEvent[] = JSON.parse(read(`fixtures/${name}.events.json`))
    const ours = render(score, piece, { variant, seed: DEFAULT_SEED }).events
    const eighth = 30 / render(score, piece, { variant }).tempo
    expect(ours).toHaveLength(site.length)
    ours.forEach((e, i) => {
      const s = site[i]
      const sound = e.articulation === 'pizz.' ? 'pizz' : e.inst
      expect([e.step, sound, e.midi, e.role, e.rolled]).toEqual([s.step, s.inst, s.midi, s.role, s.rolled])
      expect(e.lead && e.inst === 'piano' ? 'melody' : e.part).toBe(s.part)
      expect(near(e.offset, s.offset, 0.01 / eighth)).toBe(true)
      for (const key of ['length', 'written', 'held'] as const) expect(near(e[key], s[key], 1e-9)).toBe(true)
      expect(near(e.velocity, s.velocity, 0.03)).toBe(true)
      expect(near(e.level, s.level, 0.03)).toBe(true)
    })
  })
})
