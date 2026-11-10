import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startMixer } from '../src/node/mixer.ts'
import type { Sounds } from '../src/sources/types.ts'

const rate = 48000
const sine = Float32Array.from({ length: rate * 2 }, (_, i) => 0.4 * Math.sin((2 * Math.PI * 261.6255653 * i) / rate))
const sounds: Sounds = { piano: { samples: [sine], rate, sprite: { C4: [0, 2] }, release: 0.4 }, harp: { samples: [sine], rate, sprite: { C4: [0, 2] }, release: 0.4 } }

const SCORE = `score 0.3
title  Little
instruments
  piano  piano
  harp   harp
piece t  Little
  tempo  q = 120
  key    C major
  chords c
    C  C3 | E4 G4 C5
  part tune  piano mf
    | C4 q E4 q G4 q C5 q |
  part pad  harp p
    | C4 w |

  mix  — balance
    piano  0 dB  — keys
    harp   -3 dB
    tune   +1 dB

  form
    A  c  loudness -16  — opening
      tune, pad
    B  c
      tune, pad
`

const dir = mkdtempSync(join(tmpdir(), 'plainscore-page-'))
const page = join(dir, 'page')
const file = join(dir, 'little.score')
let mixer: Awaited<ReturnType<typeof startMixer>>

beforeAll(async () => {
  await build({ configFile: resolve(import.meta.dirname, '../web/vite.config.ts'), logLevel: 'silent', build: { outDir: page, emptyOutDir: true } })
  writeFileSync(file, SCORE)
  mixer = await startMixer({ file, sounds, piece: 't', variant: null, port: 0, out: join(dir, 'out', 'little'), open: false, page })
}, 60_000)

afterAll(() => mixer?.close())

const post = async (path: string, body: unknown) => {
  const res = await fetch(`${mixer.url}${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
  return { status: res.status, json: await res.json() }
}

describe('mixer page', () => {
  it('serves the built page and the script it loads', async () => {
    const res = await fetch(mixer.url)
    expect(res.status).toBe(200)
    const html = await res.text()
    const script = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1]
    expect(script).toBeDefined()
    const js = await fetch(new URL(script!, mixer.url))
    expect(js.status).toBe(200)
    expect(js.headers.get('content-type')).toContain('javascript')
    expect((await js.text()).length).toBeGreaterThan(10_000)
  })

  it('builds the local page without the worker or landing code of the site', () => {
    const assets = readdirSync(join(page, 'assets'))
    expect(assets.filter((f) => /worker|SiteApp|Landing/i.test(f))).toEqual([])
    expect(assets.some((f) => f.endsWith('.js'))).toBe(true)
  })

  it('writes three edits as exactly three changed lines', async () => {
    const state = await (await fetch(`${mixer.url}/api/state`)).json()
    const edits = structuredClone(state.edits)
    edits.loudness.A = -14
    edits.mix.harp.gain = -5
    edits.mix.tune.gain = 2
    const { status } = await post('/api/write', { edits, version: state.version })
    expect(status).toBe(200)
    const before = SCORE.split('\n')
    const after = readFileSync(file, 'utf8').split('\n')
    expect(after).toHaveLength(before.length)
    const changed = before.flatMap((line, i) => (line === after[i] ? [] : [[line, after[i]]]))
    expect(changed).toEqual([
      ['    harp   -3 dB', '    harp   -5 dB'],
      ['    tune   +1 dB', '    tune   +2 dB'],
      ['    A  c  loudness -16  — opening', '    A  c  loudness -14  — opening'],
    ])
  })
})
