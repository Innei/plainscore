#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { parseArgs } from 'node:util'
import { toAbc } from './abc/index.ts'
import { checkScore } from './expand.ts'
import { LEGEND } from './legend.ts'
import { toMidi } from './midi.ts'
import { DEFAULT_SEED, render } from './render.ts'

const USAGE = `usage:
  plainscore check <file>
  plainscore events <file> [--piece id] [--variant v] [--seed n] [--passes n] [--perform]
  plainscore abc <file> [--piece id] [--variant v]
  plainscore midi <file> [--piece id] [--variant v] [--seed n] [--passes n] [--perform] -o out.mid
  plainscore legend
  plainscore render | mixer …    with plainscore-render installed`

const RENDERER = 'plainscore-render/node'

const forward = async (args: string[]) => {
  let renderer: { main: (argv: string[]) => Promise<unknown> }
  try {
    renderer = await import(RENDERER)
  } catch {
    throw new Error(`${args[0]} needs plainscore-render; install it next to plainscore`)
  }
  await renderer.main(args)
}

const main = async () => {
  if (process.argv[2] === 'render' || process.argv[2] === 'mixer') return forward(process.argv.slice(2))
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      piece: { type: 'string' },
      variant: { type: 'string' },
      seed: { type: 'string' },
      passes: { type: 'string' },
      perform: { type: 'boolean' },
      output: { type: 'string', short: 'o' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  const [command, file] = positionals
  if (values.help || !command) return void console.log(USAGE)
  if (command === 'legend') return void process.stdout.write(LEGEND)
  if (!['check', 'events', 'abc', 'midi'].includes(command)) throw new Error(`unknown command "${command}"\n${USAGE}`)
  if (!file) throw new Error(`${command} needs a score file\n${USAGE}`)
  const score = checkScore(readFileSync(file, 'utf8'), basename(file))
  if (command === 'check') return void console.log(`${file}: ok, ${score.pieces.map((p) => p.id).join(', ')}`)
  const number = (value: string | undefined, name: string) => {
    if (value === undefined) return undefined
    if (!/^\d+$/.test(value)) throw new Error(`--${name} takes a whole number`)
    return Number(value)
  }
  const piece = values.piece ?? score.pieces[0].id
  const passes = number(values.passes, 'passes')
  if (command === 'abc') return void process.stdout.write(`${toAbc(render(score, piece, { variant: values.variant }))}\n`)
  const seed = number(values.seed, 'seed') ?? DEFAULT_SEED
  const rendering = render(score, piece, { variant: values.variant, seed, passes, perform: values.perform })
  if (command === 'events') return void process.stdout.write(`${JSON.stringify(rendering, null, 2)}\n`)
  if (!values.output) throw new Error('midi needs -o <file.mid>')
  writeFileSync(values.output, toMidi(rendering))
}

main().catch((error: Error) => {
  console.error(error.message)
  process.exit(1)
})
