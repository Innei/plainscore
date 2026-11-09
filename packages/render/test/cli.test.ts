import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeWav, encodeWav } from '../src/dsp/wav.ts'
import { main } from '../src/node/cli.ts'
import { loadSounds } from '../src/node/sounds.ts'

const rate = 48000
const sine = (freq: number, fileRate = rate) => Float32Array.from({ length: fileRate * 3 }, (_, i) => 0.4 * Math.sin((2 * Math.PI * freq * i) / fileRate))

const SCORE = `score 0.3
title  Little
by     Tester
instruments
  piano  piano
piece t  Little Piece
  tempo  q = 120
  key    C major
  chords c
    C  C3 | E4 G4 C5
  part tune  piano mf
    | C4 q E4 q G4 q C5 q |
  form
    A  c  loudness -16
      tune
    B  c
      tune
`

const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'plainscore-render-'))
  writeFileSync(join(dir, 'piano.wav'), encodeWav([sine(261.6255653), sine(261.6255653)], rate, 24))
  writeFileSync(join(dir, 'sprites.json'), JSON.stringify({ piano: { C4: [0, 3] } }))
  writeFileSync(join(dir, 'sounds.json'), JSON.stringify({ piano: { samples: './piano.wav', sprite: './sprites.json#piano', release: 0.5, credit: 'sine by test' } }))
  writeFileSync(join(dir, 'little.score'), SCORE)
  return dir
}

describe('loadSounds', () => {
  it('resolves paths next to the json and sprites by key', async () => {
    const dir = setup()
    const sounds = await loadSounds(join(dir, 'sounds.json'))
    expect(sounds.piano).toMatchObject({ rate, sprite: { C4: [0, 3] }, release: 0.5, credit: 'sine by test' })
    expect('samples' in sounds.piano && sounds.piano.samples.length).toBe(2)
  })

  it('shares one buffer for a soundfont used twice', async () => {
    const dir = setup()
    writeFileSync(join(dir, 'tiny.sf2'), new Uint8Array([1, 2, 3]))
    writeFileSync(join(dir, 'two.json'), JSON.stringify({ a: { soundfont: './tiny.sf2', preset: 0 }, b: { soundfont: './tiny.sf2', preset: 48 } }))
    const sounds = await loadSounds(join(dir, 'two.json'))
    expect('soundfont' in sounds.a && 'soundfont' in sounds.b && sounds.a.soundfont === sounds.b.soundfont).toBe(true)
  })

  it('names a missing file', async () => {
    const dir = setup()
    writeFileSync(join(dir, 'bad.json'), JSON.stringify({ piano: { soundfont: './nope.sf3' } }))
    await expect(loadSounds(join(dir, 'bad.json'))).rejects.toThrow('nope.sf3')
  })
})

describe('plainscore render', () => {
  it('writes a 48 kHz 24-bit WAV, the report and the section table', async () => {
    const dir = setup()
    const out = join(dir, 'out', 'little')
    const log: string[] = []
    await main(['render', join(dir, 'little.score'), '--sounds', join(dir, 'sounds.json'), '-o', out, '--stems'], (s) => log.push(s))
    const wav = readFileSync(`${out}.wav`)
    expect(wav.readUInt16LE(34)).toBe(24)
    const { rate: r, channels } = decodeWav(new Uint8Array(wav))
    expect([r, channels.length]).toEqual([48000, 2])
    const report = JSON.parse(readFileSync(`${out}.report.json`, 'utf8'))
    expect(report.sections.map((s: { mark: string }) => s.mark)).toEqual(['A', 'B'])
    expect(report.credits).toEqual([{ sound: 'piano', credit: 'sine by test' }])
    const sections = JSON.parse(readFileSync(`${out}.sections.json`, 'utf8'))
    expect(sections.sections[1]).toMatchObject({ mark: 'B', bar: 1, start: expect.closeTo(2, 0) })
    expect(existsSync(join(`${out}.stems`, 'piano.wav'))).toBe(true)
    expect(log.join('\n')).toContain('integrated')
  })

  it('encodes an MP3 with the title and author', async () => {
    const dir = setup()
    const out = join(dir, 'little')
    await main(['render', join(dir, 'little.score'), '--sounds', join(dir, 'sounds.json'), '-o', out, '--mp3', '--flac'], () => {})
    const tags = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags=title,artist', '-of', 'json', `${out}.mp3`], { encoding: 'utf8' })
    expect(JSON.parse(tags).format.tags).toMatchObject({ title: 'Little', artist: 'Tester' })
    expect(existsSync(`${out}.flac`)).toBe(true)
  })

  it('explains its usage', async () => {
    await expect(main(['render'], () => {})).rejects.toThrow('usage')
    await expect(main(['render', 'x.score'], () => {})).rejects.toThrow('--sounds')
  })
})

describe('core cli', () => {
  it('points to plainscore-render when it is not installed', () => {
    const run = spawnSync(process.execPath, ['src/cli.ts', 'render', 'examples/road.score'], { cwd: new URL('../../..', import.meta.url), encoding: 'utf8' })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('render needs plainscore-render; install it next to plainscore')
  })
})
