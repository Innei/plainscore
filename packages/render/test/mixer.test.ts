import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseScore, readEdits, render } from 'plainscore'
import { afterEach, describe, expect, it } from 'vitest'
import { lineDiff, startMixer } from '../src/node/mixer.ts'
import type { Sounds } from '../src/sources/types.ts'

const rate = 48000
const sine = Float32Array.from({ length: rate * 3 }, (_, i) => 0.4 * Math.sin((2 * Math.PI * 261.6255653 * i) / rate))
const sounds: Sounds = { piano: { samples: [sine], rate, sprite: { C4: [0, 3] }, release: 0.4 }, harp: { samples: [sine], rate, sprite: { C4: [0, 3] }, release: 0.4 } }

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
    A  c  loudness -16
      tune, pad
    B  c in D
      tune, pad
`

let close: (() => Promise<void>) | null = null
afterEach(async () => {
  await close?.()
  close = null
})

const start = async (page?: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'plainscore-mixer-'))
  const file = join(dir, 'little.score')
  writeFileSync(file, SCORE)
  const mixer = await startMixer({ file, sounds, piece: 't', variant: null, port: 0, out: join(dir, 'out', 'little'), open: false, page })
  close = mixer.close
  const api = async (path: string, body?: unknown) => {
    const res = await fetch(`${mixer.url}${path}`, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
    return { status: res.status, json: res.headers.get('content-type')?.includes('json') ? await res.json() : null, res }
  }
  return { dir, file, mixer, api }
}

describe('lineDiff', () => {
  it('marks changed lines with context', () => {
    expect(lineDiff('a\nb\nc\nd', 'a\nB\nc\nd')).toEqual([
      { kind: 'same', line: 'a', at: 1 },
      { kind: 'del', line: 'b', at: 2 },
      { kind: 'add', line: 'B', at: 2 },
      { kind: 'same', line: 'c', at: 3 },
      { kind: 'same', line: 'd', at: 4 },
    ])
  })
})

describe('mixer server', () => {
  it('describes sections, stems and the current settings', async () => {
    const { api } = await start()
    const { json } = await api('/api/state')
    expect(json.sections.map((s: { mark: string; start: number; keyChange: boolean }) => [s.mark, Math.round(s.start), s.keyChange])).toEqual([
      ['A', 0, false],
      ['B', 2, true],
    ])
    expect(json.stems.map((s: { target: string; kind: string }) => [s.target, s.kind])).toEqual([
      ['harp', 'instrument'],
      ['tune', 'part'],
    ])
    expect(json.edits.mix.tune).toEqual({ gain: 1 })
    expect(json.partInst).toEqual({ tune: 'piano' })
    expect(json.report.sections[0].target).toBe(-16)
  })

  it('returns the loudness curve, lanes, section parts and the file text', async () => {
    const { api } = await start()
    const { json } = await api('/api/state')
    expect(json.curve.step).toBe(1)
    expect(json.curve.window).toBe(3)
    expect(json.curve.values.length).toBe(Math.max(0, Math.floor(json.report.seconds) - 2))
    expect(json.lanes.map((l: { target: string }) => l.target)).toEqual(['harp', 'tune'])
    for (const lane of json.lanes) expect(lane.spans.length).toBeGreaterThan(0)
    expect(json.sections[0].parts).toEqual(['pad', 'tune'])
    expect(json.text).toBe(SCORE)
  })

  it('says how to build the page when it is missing', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'plainscore-page-'))
    mkdirSync(join(empty, 'assets'))
    const { mixer } = await start(empty)
    const res = await fetch(`${mixer.url}/`)
    expect(res.status).toBe(503)
    expect(await res.text()).toContain('pnpm build')
  })

  it('serves stems as WAV and the page', async () => {
    const page = mkdtempSync(join(tmpdir(), 'plainscore-page-'))
    writeFileSync(join(page, 'index.html'), '<!doctype html><title>mixer</title>')
    mkdirSync(join(page, 'assets'))
    writeFileSync(join(page, 'assets', 'app.js'), 'export {}')
    const { api, mixer } = await start(page)
    const wav = await api('/stems/0.wav')
    expect(wav.res.headers.get('content-type')).toBe('audio/wav')
    expect(new TextDecoder().decode(new Uint8Array(await wav.res.arrayBuffer()).subarray(0, 4))).toBe('RIFF')
    expect(await (await fetch(`${mixer.url}/`)).text()).toContain('<title>')
    const js = await fetch(`${mixer.url}/assets/app.js`)
    expect(js.headers.get('content-type')).toContain('javascript')
  })

  it('measures with edited settings', async () => {
    const { api } = await start()
    const { json: state } = await api('/api/state')
    const { json } = await api('/api/measure', { edits: { ...state.edits, loudness: { A: null, B: null } } })
    expect(json.report.sections.map((s: { compensation: number }) => s.compensation)).toEqual([0, 0])
    expect(json.curve.values.length).toBe(state.curve.values.length)
  })

  it('shows the diff, then writes only the changed line', async () => {
    const { api, file } = await start()
    const { json: state } = await api('/api/state')
    const edits = { ...state.edits, mix: { ...state.edits.mix, harp: { gain: -5 } } }
    const { json: diff } = await api('/api/diff', { edits })
    expect(diff.lines.filter((l: { kind: string }) => l.kind !== 'same')).toEqual([
      { kind: 'del', line: '    harp   -3 dB', at: 18 },
      { kind: 'add', line: '    harp   -5 dB', at: 18 },
    ])
    const { status } = await api('/api/write', { edits, version: state.version })
    expect(status).toBe(200)
    const text = readFileSync(file, 'utf8')
    expect(text).toBe(SCORE.replace('    harp   -3 dB', '    harp   -5 dB'))
    expect(render(parseScore(text), 't').mix.instruments.harp.gain).toBe(-5)
  })

  it('refuses to write over a file that changed on disk', async () => {
    const { api, file } = await start()
    const { json: state } = await api('/api/state')
    writeFileSync(file, SCORE.replace('— keys', '— the keys'))
    const { status, json } = await api('/api/write', { edits: readEdits(parseScore(SCORE), 't'), version: state.version })
    expect(status).toBe(409)
    expect(json.error).toContain('changed on disk')
  })

  it('exports a WAV to the out path', async () => {
    const { api, dir } = await start()
    const { json: state } = await api('/api/state')
    const { json } = await api('/api/export', { edits: state.edits, formats: ['wav'] })
    expect(json.files).toEqual([join(dir, 'out', 'little.wav')])
    expect(readFileSync(json.files[0]).subarray(0, 4).toString()).toBe('RIFF')
    expect(json.curve.values.length).toBeGreaterThan(0)
  })
})
