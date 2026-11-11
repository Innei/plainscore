import { readFileSync } from 'node:fs'
import { checkScore } from 'plainscore'
import { describe, expect, it } from 'vitest'
import { planSiteSounds, prepareSiteSounds } from './siteSounds.ts'

const manifest = JSON.parse(readFileSync(new URL('../../../sounds/sounds.json', import.meta.url), 'utf8'))

const score = (instrument: string, part: string) =>
  checkScore(`score 0.3\ntitle  t\ninstruments\n  ${instrument}\npiece t  T\n  tempo  q = 80\n  key    D major\n  chords c\n    D  D2 | D4 F#4 A4\n  part ${part} mf\n    | D4 w |\n  form\n    A  c\n      ${part.split(' ')[0]}\n`, 't.score')

describe('planning the site sounds', () => {
  it('takes the samples by family, whatever the instrument is called', () => {
    const plan = planSiteSounds('t', null, score('strings  violins', 'pad  strings'), manifest)
    expect(plan).toEqual({ samples: { strings: 'violins' }, soundfont: [] })
  })

  it('takes only the pizz samples for violins that only play pizz.', () => {
    const plan = planSiteSounds('t', null, score('violins  violins', 'plucks  violins pizz.'), manifest)
    expect(plan).toEqual({ samples: { 'violins pizz.': 'violins pizz.' }, soundfont: [] })
  })

  it('leaves an articulation the samples lack to the SoundFont', () => {
    const plan = planSiteSounds('t', null, score('cello  cello', 'plucks  cello pizz.'), manifest)
    expect(plan).toEqual({ samples: {}, soundfont: ['cello pizz.'] })
  })

  it('leaves a family the samples lack to the SoundFont', () => {
    const plan = planSiteSounds('t', null, score('flute  flute', 'tune  flute'), manifest)
    expect(plan).toEqual({ samples: {}, soundfont: ['flute'] })
  })

  it('takes the articulation a doubling part inherits', () => {
    const text = `score 0.3\ntitle  t\ninstruments\n  violins  violins\n  cello  cello\npiece t  T\n  tempo  q = 80\n  key    D major\n  chords c\n    D  D2 | D4 F#4 A4\n  part plucks  violins pizz. mf\n    | D5 w |\n  part low  cello doubles plucks 8vb\n  form\n    A  c\n      plucks, low\n`
    expect(planSiteSounds('t', null, checkScore(text, 't.score'), manifest)).toEqual({ samples: { 'violins pizz.': 'violins pizz.' }, soundfont: ['cello pizz.'] })
  })

  it('takes the instrument a cue plays on with its part articulation', () => {
    const text = `score 0.3\ntitle  t\ninstruments\n  violins  violins\n  cello  cello\npiece t  T\n  tempo  q = 80\n  key    D major\n  chords c\n    D  D2 | D4 F#4 A4\n  part plucks  violins pizz. mf\n    1  cello  D3 q\n  form\n    A  c\n      plucks\n`
    expect(planSiteSounds('t', null, checkScore(text, 't.score'), manifest).soundfont).toEqual(['cello pizz.'])
  })

  it.each(['ma.score', 'road.score', 'bgm.score'])('plays every piece and variant of %s from the samples', (file) => {
    const parsed = checkScore(readFileSync(new URL(`../../../../../examples/${file}`, import.meta.url), 'utf8'), file)
    for (const piece of parsed.pieces)
      for (const variant of [null, ...piece.variants.map((v) => v.name)]) {
        const plan = planSiteSounds(piece.id, variant, parsed, manifest)
        expect(plan.soundfont).toEqual([])
        expect(Object.keys(plan.samples).length).toBeGreaterThan(0)
      }
  })
})

describe('preparing the site sounds', () => {
  const files: Record<string, string | Uint8Array> = {
    'https://site/sounds/sounds.json': JSON.stringify({
      violins: { samples: './violins.mp3', sprite: './sprites.json#violins', attack: 0.5, release: 2, sustain: true, credit: 'VSCO' },
      'violins pizz.': { samples: './pizz.mp3', sprite: './sprites.json#pizz', release: 0.8 },
      cello: { samples: './cello.mp3', sprite: './sprites.json#cello' },
    }),
    'https://site/sounds/sprites.json': JSON.stringify({ violins: { A4: [0, 1] }, pizz: { A4: [0, 0.5] }, cello: { G2: [0, 1] } }),
    'https://site/sounds/violins.mp3': new Uint8Array(10),
    'https://site/sounds/pizz.mp3': new Uint8Array(20),
    'https://site/sounds/cello.mp3': new Uint8Array(30),
  }
  const fetched: string[] = []
  const deps = {
    manifestUrl: 'https://site/sounds/sounds.json',
    fetchBytes: async (url: string, onBytes: (loaded: number, total: number | null) => void) => {
      fetched.push(url)
      const body = files[url]
      const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
      onBytes(bytes.length, bytes.length)
      return bytes.buffer as ArrayBuffer
    },
    decode: async (bytes: ArrayBuffer) => [new Float32Array(bytes.byteLength), new Float32Array(bytes.byteLength)],
  }
  const text = `score 0.3\ntitle  t\ninstruments\n  violins  violins\n  strings  violins\npiece t  T\n  tempo  q = 80\n  key    D major\n  chords c\n    D  D2 | D4 F#4 A4\n  part pad  violins mf\n    | D4 w |\n  part plucks  strings pizz. mf\n    | D4 w |\n  part hold  strings mf\n    | A4 w |\n  form\n    A  c\n      pad, plucks, hold\n`

  it('builds sample sources with the sprite and envelope from the manifest', async () => {
    fetched.length = 0
    const { prepared } = await prepareSiteSounds({ text, name: 't.score', piece: 't', variant: null }, deps, () => {})
    expect(prepared.soundfont).toEqual([])
    expect(Object.keys(prepared.sounds).sort()).toEqual(['strings', 'strings pizz.', 'violins'])
    expect(prepared.sounds.violins).toMatchObject({ rate: 48000, sprite: { A4: [0, 1] }, attack: 0.5, release: 2, sustain: true, credit: 'VSCO' })
    expect(prepared.sounds['strings pizz.']).toMatchObject({ sprite: { A4: [0, 0.5] }, release: 0.8 })
    expect(fetched.filter((u) => u.endsWith('.mp3')).sort()).toEqual(['https://site/sounds/pizz.mp3', 'https://site/sounds/violins.mp3'])
  })

  it('fetches and decodes a file once when two instruments share it', async () => {
    fetched.length = 0
    const { prepared, transfer } = await prepareSiteSounds({ text, name: 't.score', piece: 't', variant: null }, deps, () => {})
    expect(fetched.filter((u) => u.endsWith('violins.mp3'))).toHaveLength(1)
    expect(prepared.sounds.strings).toEqual(prepared.sounds.violins)
    expect(new Set(transfer).size).toBe(transfer.length)
    expect(transfer).toHaveLength(4)
  })

  it('reports the sample downloads as one total', async () => {
    const seen: { loaded: number; total: number | null }[] = []
    await prepareSiteSounds({ text, name: 't.score', piece: 't', variant: null }, deps, (p) => p.stage === 'sounds' && seen.push({ loaded: p.loaded, total: p.total }))
    expect(seen.at(-1)).toEqual({ loaded: 30, total: 30 })
  })
})
