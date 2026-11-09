import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_MASTER, DEFAULT_SPACE } from '../src/mixing.ts'
import { parseScore } from '../src/parse.ts'
import { render } from '../src/render.ts'
import { type ScoreEdits, readEdits, rewriteScore } from '../src/rewrite.ts'

const bgm = readFileSync(new URL('../examples/bgm.score', import.meta.url), 'utf8')
const road = readFileSync(new URL('../examples/road.score', import.meta.url), 'utf8')

const changed = (a: string, b: string) => {
  const [x, y] = [a.split('\n'), b.split('\n')]
  return { removed: x.filter((l) => !y.includes(l)), added: y.filter((l) => !x.includes(l)) }
}

const small = `score 0.3
instruments
  piano  piano
  harp   harp
piece t  T
  tempo  q = 100
  key    D major
  chords c
    D  D3 | F#4 A4 D5
  part melody  piano mf lead
    | D5 w |
  part wash  harp p
    1 chord w

  mix  — balance
    piano   0 dB   pan -0.3   send -6 dB
    harp    75%    — quiet
  # keep me
  space  wet -10 dB  — room

  form
    A  c  loudness -18  — open
      melody, wash
    B  c in E
      melody
`

describe('rewriteScore', () => {
  it.each([
    ['bgm theme', bgm, 'theme'],
    ['bgm stars', bgm, 'stars'],
    ['road', road, 'road'],
    ['small', small, 't'],
  ])('returns %s unchanged when given its own values', (_, text, piece) => {
    expect(rewriteScore(text, piece, readEdits(parseScore(text), piece))).toBe(text)
  })

  it('changes one mix gain on one line and keeps its note', () => {
    const edits = readEdits(parseScore(small), 't')
    edits.mix!.harp = { ...edits.mix!.harp, gain: -4 }
    const out = rewriteScore(small, 't', edits)
    expect(changed(small, out)).toEqual({ removed: ['    harp    75%    — quiet'], added: ['    harp    -4 dB  — quiet'] })
    expect(render(parseScore(out), 't').mix.instruments.harp.gain).toBe(-4)
  })

  it('adds, replaces and clears section targets', () => {
    const out = rewriteScore(small, 't', { loudness: { A: -16.5, B: -15 } })
    expect(changed(small, out)).toEqual({
      removed: ['    A  c  loudness -18  — open', '    B  c in E'],
      added: ['    A  c  loudness -16.5  — open', '    B  c in E  loudness -15'],
    })
    const cleared = rewriteScore(out, 't', { loudness: { A: null } })
    expect(cleared.split('\n')).toContain('    A  c  — open')
    expect(render(parseScore(cleared), 't').sections.map((s) => s.loudness)).toEqual([null, -15])
  })

  it('writes space and master, adding the master block before the form', () => {
    const edits: ScoreEdits = {
      space: { ...DEFAULT_SPACE, decay: 2.6, wet: -10 },
      master: { ...DEFAULT_MASTER, loudness: -15, lowcut: 35, air: { gain: 2, freq: 9000 } },
    }
    const out = rewriteScore(small, 't', edits)
    expect(changed(small, out).removed).toEqual(['  space  wet -10 dB  — room'])
    expect(out).toContain('  space  decay 2.6s  predelay 20ms  damp 6500 Hz  wet -10 dB  — room\n')
    expect(out).toContain('  master  -15 LUFS  ceiling -1 dBTP\n    lowcut  35 Hz\n    air     +2 dB at 9000 Hz\n\n  form\n')
    const r = render(parseScore(out), 't')
    expect([r.space, r.master]).toEqual([edits.space, edits.master])
  })

  it('drops mix rows that are no longer wanted and adds new ones in the block', () => {
    const out = rewriteScore(small, 't', { mix: { piano: { gain: 0, pan: -0.3, send: -6 }, melody: { gain: 1.5, send: null } } })
    expect(changed(small, out)).toEqual({ removed: ['    harp    75%    — quiet'], added: ['    melody  +1.5 dB  send off'] })
    expect(out).toContain('    piano   0 dB   pan -0.3   send -6 dB\n    melody  +1.5 dB  send off\n  # keep me\n')
  })

  it('moves a 0.1 file to 0.3 only when it writes 0.3 words', () => {
    const old = bgm
    expect(rewriteScore(old, 'theme', { mix: { ...readEdits(parseScore(old), 'theme').mix, piano: { gain: -3 } } }).split('\n')[0]).toBe('score 0.1')
    const panned = rewriteScore(old, 'theme', { mix: { ...readEdits(parseScore(old), 'theme').mix, piano: { gain: -3, pan: 0.3 } } })
    expect(panned.split('\n')[0]).toBe('score 0.3')
    expect(panned).toContain('\n  perform off\n')
    expect(parseScore(panned).pieces[0].perform).toBeNull()
    expect(render(parseScore(panned), 'theme').mix.instruments.piano).toMatchObject({ gain: -3, pan: 0.3 })
  })

  it('moves a 0.2 file to 0.3 without touching perform', () => {
    const two = small
      .replace('score 0.3', 'score 0.2')
      .replace('   pan -0.3   send -6 dB', '')
      .replace('  space  wet -10 dB  — room\n', '')
      .replace('  loudness -18', '')
    const out = rewriteScore(two, 't', { space: { decay: 2, predelay: 0.02, damp: 6500, wet: -10 } })
    expect(out.split('\n')[0]).toBe('score 0.3')
    expect(out).not.toContain('perform off')
  })

  it('only touches the named piece and keeps CRLF', () => {
    const crlf = small.replace(/\n/g, '\r\n')
    const out = rewriteScore(crlf, 't', { loudness: { B: -15 } })
    expect(out).toBe(rewriteScore(small, 't', { loudness: { B: -15 } }).replace(/\n/g, '\r\n'))
    const stars = rewriteScore(bgm, 'stars', { space: { ...DEFAULT_SPACE, wet: -9 } })
    const theme = bgm.slice(bgm.indexOf('\n'), bgm.indexOf('\npiece stars'))
    expect(stars.startsWith(`score 0.3${theme.replace(/^(piece\s.*)$/m, '$1\n  perform off')}`)).toBe(true)
  })
})
