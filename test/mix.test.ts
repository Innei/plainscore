import { describe, expect, it } from 'vitest'
import { parseScore } from '../src/parse.ts'
import { DEFAULT_MASTER, DEFAULT_SPACE } from '../src/mixing.ts'
import { render } from '../src/render.ts'

const score = (version: string, mix: string, extra = '') => `score ${version}
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
  mix
${mix}
${extra}  form
    A  c
      melody, wash
`

describe('mix in score 0.3', () => {
  it('resolves pan, send and part rows over instrument rows', () => {
    const text = score('0.3', '    piano   0 dB  pan -0.3  send -6 dB\n    melody  +1 dB  send off  — the tune\n    harp    75%\n')
    const r = render(parseScore(text, 't.score'), 't')
    expect(r.mix.instruments.piano).toEqual({ gain: 0, pan: -0.3, send: -6 })
    expect(r.mix.parts.melody).toEqual({ gain: 1, pan: -0.3, send: null })
    expect(r.mix.instruments.harp.gain).toBeCloseTo(20 * Math.log10(0.75), 6)
    expect(r.mix.instruments.harp).toMatchObject({ pan: 0, send: 0 })
    expect(Object.keys(r.mix.parts)).toEqual(['melody'])
  })

  it('keeps attack on the instrument and lets a part override it', () => {
    const text = score('0.3', '    harp  -2 dB  attack 0ms\n    wash  attack 200ms\n')
    const r = render(parseScore(text, 't.score'), 't')
    expect(r.mix.instruments.harp).toEqual({ gain: -2, pan: 0, send: 0, attack: 0 })
    expect(r.mix.parts.wash).toEqual({ gain: -2, pan: 0, send: 0, attack: 0.2 })
  })

  it('asks 0.1 files to move to 0.3 before using pan or send', () => {
    expect(() => parseScore(score('0.1', '    piano  pan 0.3\n'), 't.score')).toThrow('t.score line 15: "pan" needs score 0.3; change the first line to "score 0.3"')
    expect(() => parseScore(score('0.1', '    piano  send -6 dB\n'), 't.score')).toThrow('"send" needs score 0.3')
    expect(() => parseScore(score('0.2', '    piano  pan 0.2\n'), 't.score')).toThrow('"pan" needs score 0.3')
  })

  it('rejects a pan outside -1..1 and a send without dB', () => {
    expect(() => parseScore(score('0.3', '    piano  pan 1.5\n'), 't.score')).toThrow('pan runs from -1 (left) to 1 (right)')
    expect(() => parseScore(score('0.3', '    piano  send -6\n'), 't.score')).toThrow('write the send as "send -6 dB" or "send off"')
  })

  it('records the version', () => {
    expect(parseScore(score('0.3', '    piano  0 dB\n'), 't.score').version).toBe('0.3')
    expect(parseScore(score('0.1', '    piano  +1 dB\n'), 't.score').version).toBe('0.1')
  })
})

describe('space and master in score 0.3', () => {
  const withBlocks = (blocks: string, version = '0.3') => score(version, '    piano  0 dB\n', blocks)

  it('parses every field', () => {
    const r = render(parseScore(withBlocks('  space  decay 2.6s  predelay 20ms  damp 6500 Hz  wet -10 dB\n  master  -14 LUFS  ceiling -1 dBTP  fade 2.5s\n    lowcut    35 Hz\n    presence  -1 dB\n    air       +2 dB at 9000 Hz  — sparkle\n'), 't.score'), 't')
    expect(r.space).toEqual({ decay: 2.6, predelay: 0.02, damp: 6500, wet: -10 })
    expect(r.master).toEqual({ loudness: -14, ceiling: -1, fade: 2.5, lowcut: 35, presence: -1, air: { gain: 2, freq: 9000 } })
  })

  it('fills defaults for what is not written', () => {
    const r = render(parseScore(withBlocks('  space  wet -14 dB\n  master  -16 LUFS\n'), 't.score'), 't')
    expect(r.space).toEqual({ ...DEFAULT_SPACE, wet: -14 })
    expect(r.master).toEqual({ ...DEFAULT_MASTER, loudness: -16 })
    const bare = render(parseScore(withBlocks(''), 't.score'), 't')
    expect([bare.space, bare.master]).toEqual([DEFAULT_SPACE, DEFAULT_MASTER])
    expect(DEFAULT_SPACE).toEqual({ decay: 2.4, predelay: 0.02, damp: 6500, wet: -12 })
    expect(DEFAULT_MASTER).toEqual({ loudness: -14, ceiling: -1, fade: 0, lowcut: null, presence: 0, air: null })
  })

  it('explains bad rows', () => {
    expect(() => parseScore(withBlocks('  space  decay 2.6\n'), 't.score')).toThrow('write it as "space  decay 2.4s  predelay 20ms  damp 6500 Hz  wet -12 dB"')
    expect(() => parseScore(withBlocks('  master  loud\n'), 't.score')).toThrow('write it as "master  -14 LUFS  ceiling -1 dBTP  fade 2.5s"')
    expect(() => parseScore(withBlocks('  master  -14 LUFS\n    bass  +2 dB\n'), 't.score')).toThrow('master rows are "lowcut 35 Hz", "presence +1 dB" and "air +2 dB at 9000 Hz"')
    expect(() => parseScore(withBlocks('  space  wet -10 dB\n', '0.1'), 't.score')).toThrow('"space" needs score 0.3')
    expect(() => parseScore(withBlocks('  master  -14 LUFS\n', '0.1'), 't.score')).toThrow('"master" needs score 0.3')
  })
})

describe('section loudness in score 0.3', () => {
  const form = (rows: string, version = '0.3') => score(version, '    piano  0 dB\n', '').replace('    A  c\n      melody, wash\n', rows)

  it('reads a target after the chords and the key change', () => {
    const r = render(parseScore(form('    A  c  loudness -18\n      melody, wash\n    B  c in E  loudness -15.5  — lift\n      melody\n    C  c\n      melody\n'), 't.score'), 't')
    expect(r.sections.map((s) => [s.mark, s.loudness, s.tonic, s.label])).toEqual([
      ['A', -18, 2, 'A'],
      ['B', -15.5, 4, 'lift'],
      ['C', null, 2, 'C'],
    ])
  })

  it('copies targets onto looped passes', () => {
    const looped = form('    A  c  loudness -18\n      melody, wash\n').replace('  form\n', '  form loop\n')
    const r = render(parseScore(looped, 't.score'), 't', { passes: 2 })
    expect(r.sections.map((s) => s.loudness)).toEqual([-18, -18])
  })

  it('needs 0.3 and a number', () => {
    expect(() => parseScore(form('    A  c  loudness -18\n      melody, wash\n', '0.1'), 't.score')).toThrow('"loudness" needs score 0.3')
    expect(() => parseScore(form('    A  c  loudness loud\n      melody, wash\n'), 't.score')).toThrow('write the target as "loudness -16" (LUFS)')
  })
})
