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

describe.each(TRACKS)('$name matches its fixtures', ({ name, score, piece, variant }) => {
  const rendering = render(score, piece, { variant, seed: DEFAULT_SEED })

  it('writes the same ABC', async () => {
    await expect(`${toAbc(render(score, piece, { variant }))}\n`).toMatchFileSnapshot(`../fixtures/${name}.abc`)
  })

  it('writes byte-identical MIDI', () => {
    expect(toMidi(rendering)).toEqual(new Uint8Array(readFileSync(new URL(`../fixtures/${name}.mid`, import.meta.url))))
  })

  it('renders the same events', async () => {
    await expect(`${JSON.stringify(rendering.events, null, 1)}\n`).toMatchFileSnapshot(`../fixtures/${name}.events.json`)
  })
})
