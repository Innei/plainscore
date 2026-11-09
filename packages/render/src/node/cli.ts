import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { BAR, DEFAULT_SEED, checkScore, render } from 'plainscore'
import { encodeWav } from '../dsp/wav.ts'
import { credits, masterStems, RATE } from '../offline.ts'
import { formatReport } from '../report.ts'
import { renderStems, timeline } from '../stems.ts'
import { encodeWith } from './encode.ts'
import { loadSounds } from './sounds.ts'

export const USAGE = `usage:
  plainscore render <file> --sounds sounds.json -o out/name [--piece id] [--variant v] [--seed n] [--passes n] [--loop] [--stems] [--flac] [--mp3]
  plainscore mixer <file> --sounds sounds.json [--piece id] [--variant v] [--port 4747] [-o out/name] [--open]`

const OPTIONS = {
  sounds: { type: 'string' },
  piece: { type: 'string' },
  variant: { type: 'string' },
  seed: { type: 'string' },
  passes: { type: 'string' },
  port: { type: 'string' },
  output: { type: 'string', short: 'o' },
  loop: { type: 'boolean' },
  stems: { type: 'boolean' },
  flac: { type: 'boolean' },
  mp3: { type: 'boolean' },
  open: { type: 'boolean' },
} as const

const whole = (value: string | undefined, name: string) => {
  if (value === undefined) return undefined
  if (!/^\d+$/.test(value)) throw new Error(`--${name} takes a whole number`)
  return Number(value)
}

export const sectionTable = (r: ReturnType<typeof render>) => {
  const at = timeline(r)
  return {
    title: r.title,
    piece: r.piece.id,
    tempo: r.tempo,
    bars: r.bars,
    seconds: at(r.bars * BAR),
    sections: r.sections.map((s, i, all) => ({
      mark: s.mark,
      label: s.label,
      bar: s.bar,
      bars: (all[i + 1]?.bar ?? r.bars) - s.bar,
      start: at(s.bar * BAR),
      tonic: s.tonic,
      loudness: s.loudness,
    })),
  }
}

export const main = async (argv: string[], print: (line: string) => void = console.log) => {
  const { positionals, values } = parseArgs({ args: argv, allowPositionals: true, options: OPTIONS })
  const [command, file] = positionals
  if (command !== 'render' && command !== 'mixer') throw new Error(USAGE)
  if (!file) throw new Error(`${command} needs a score file\n${USAGE}`)
  if (!values.sounds) throw new Error(`${command} needs --sounds sounds.json\n${USAGE}`)
  const score = checkScore(readFileSync(file, 'utf8'), basename(file))
  const piece = values.piece ?? score.pieces[0].id
  const sounds = await loadSounds(values.sounds)
  if (command === 'mixer') {
    const { startMixer } = await import('./mixer.ts')
    const mixer = await startMixer({ file, sounds, piece, variant: values.variant ?? null, port: whole(values.port, 'port'), out: values.output?.replace(/\.wav$/, ''), open: values.open })
    print(`mixer for ${basename(file)} at ${mixer.url} — Ctrl-C to stop`)
    return mixer
  }
  if (!values.output) throw new Error(`render needs -o out/name\n${USAGE}`)
  const out = values.output.replace(/\.wav$/, '')
  const r = render(score, piece, { variant: values.variant, seed: whole(values.seed, 'seed') ?? DEFAULT_SEED, passes: whole(values.passes, 'passes'), perform: true })
  const { stems } = await renderStems(r, sounds, RATE)
  const { audio, report } = masterStems(stems, r, RATE, { loop: values.loop, credits: await credits(r, sounds) })
  mkdirSync(dirname(out) || '.', { recursive: true })
  writeFileSync(`${out}.wav`, encodeWav(audio, RATE, 24))
  writeFileSync(`${out}.report.json`, `${JSON.stringify(report, null, 2)}\n`)
  const tags = { title: score.pieces.length > 1 ? r.piece.title : r.title || r.piece.title, artist: r.by, ...(score.pieces.length > 1 ? { album: r.title } : {}) }
  if (values.flac) encodeWith(`${out}.wav`, `${out}.flac`, tags, 'flac')
  if (values.mp3) encodeWith(`${out}.wav`, `${out}.mp3`, tags, 'mp3')
  if (values.stems) {
    mkdirSync(`${out}.stems`, { recursive: true })
    for (const stem of stems) writeFileSync(join(`${out}.stems`, `${stem.target}.wav`), encodeWav(stem.channels, RATE, 24))
    writeFileSync(`${out}.sections.json`, `${JSON.stringify({ ...sectionTable(r), stems: stems.map((s) => s.target) }, null, 2)}\n`)
  }
  print(formatReport(report))
  return report
}
