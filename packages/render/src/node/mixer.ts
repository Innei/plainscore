import { spawn } from 'node:child_process'
import { type FSWatcher, watch } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_SEED, type Rendering, type ScoreEdits, type ScoreFile, checkScore, readEdits, render, rewriteScore } from 'plainscore'
import { encodeWav } from '../dsp/wav.ts'
import { type Overrides, RATE, credits, masterStems, sectionSpans } from '../offline.ts'
import type { Report } from '../report.ts'
import type { Sounds } from '../sources/types.ts'
import { type Stem, renderStems } from '../stems.ts'
import { encodeWith } from './encode.ts'

export interface MixerOptions {
  file: string
  sounds: Sounds
  piece: string
  variant: string | null
  port?: number
  out?: string
  open?: boolean
}

export type DiffLine = { kind: 'same' | 'add' | 'del'; line: string; at: number }

export const lineDiff = (before: string, after: string): DiffLine[] => {
  const a = before.split('\n')
  const b = after.split('\n')
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) out.push({ kind: 'same', line: b[j++], at: ++i })
    else if (j < b.length && (i >= a.length || lcs[i][j + 1] >= lcs[i + 1][j])) out.push({ kind: 'add', line: b[j], at: ++j })
    else out.push({ kind: 'del', line: a[i], at: ++i })
  }
  for (let k = 0; k + 1 < out.length; k++) {
    if (out[k].kind === 'add' && out[k + 1].kind === 'del') [out[k], out[k + 1]] = [out[k + 1], out[k]]
  }
  return out
}

const here = dirname(fileURLToPath(import.meta.url))
const PAGE = resolve(here, '../../mixer')
const LIB = resolve(here, '..')
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }

interface State {
  text: string
  score: ScoreFile
  rendering: Rendering
  stems: Stem[]
  credits: Report['credits']
  report: Report
  version: number
  wavs: Map<number, Uint8Array>
}

const body = async (req: IncomingMessage) => {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

const send = (res: ServerResponse, status: number, data: unknown, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(type === 'application/json' ? JSON.stringify(data) : (data as Uint8Array | string))
}

export const startMixer = async (options: MixerOptions) => {
  const file = resolve(options.file)
  const out = options.out ?? join(dirname(file), 'out', basename(file, extname(file)))
  const renderOf = (score: ScoreFile) => render(score, options.piece, { variant: options.variant, seed: DEFAULT_SEED, perform: true })

  const load = async (text: string, version: number, keepStems?: Stem[]): Promise<State> => {
    const score = checkScore(text, basename(file))
    const rendering = renderOf(score)
    const stems = keepStems ?? (await renderStems(rendering, options.sounds, RATE)).stems
    const credit = await credits(rendering, options.sounds)
    const { report } = masterStems(stems, rendering, RATE, { credits: credit })
    return { text, score, rendering, stems, credits: credit, report, version, wavs: new Map() }
  }

  let state = await load(await readFile(file, 'utf8'), 1)
  const listeners = new Set<ServerResponse>()
  const emit = (event: string, data: unknown) => {
    for (const res of listeners) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  const overridesOf = (edits: ScoreEdits): Overrides => {
    const r = renderOf(checkScore(rewriteScore(state.text, options.piece, edits), basename(file)))
    return { mix: r.mix, space: r.space, master: r.master, loudness: Object.fromEntries(r.sections.map((s) => [s.mark, s.loudness])) }
  }

  const describe = () => {
    const r = state.rendering
    const spans = sectionSpans(r, state.stems[0]?.channels[0].length / RATE || 0)
    const partInst = Object.fromEntries(
      Object.keys(r.mix.parts).map((p) => [p, [...new Set(r.events.filter((e) => e.part === p).map((e) => e.inst))].join(' ')]),
    )
    return {
      file,
      version: state.version,
      title: r.title,
      piece: r.piece,
      variant: r.variant,
      tempo: r.tempo,
      bars: r.bars,
      sections: r.sections.map((s, i) => ({ mark: s.mark, label: s.label, start: spans[i].start, end: spans[i].end, tonic: s.tonic, keyChange: s.tonic !== r.tonic })),
      stems: state.stems.map((s, i) => ({ index: i, target: s.target, kind: s.kind, insts: s.insts })),
      edits: readEdits(state.score, options.piece),
      mix: r.mix,
      partInst,
      report: state.report,
    }
  }

  let watcher: FSWatcher | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const reload = async () => {
    const text = await readFile(file, 'utf8').catch(() => null)
    if (text === null || text === state.text) return
    emit('changed', { file })
    try {
      state = await load(text, state.version + 1)
      emit('ready', { version: state.version })
    } catch (error) {
      emit('failed', { error: (error as Error).message })
    }
  }
  watcher = watch(file, () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void reload(), 250)
  })

  const routes: Record<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>> = {
    'GET /api/state': async (_, res) => send(res, 200, describe()),
    'POST /api/measure': async (req, res) => {
      const { edits } = await body(req)
      const { report } = masterStems(state.stems, state.rendering, RATE, { credits: state.credits, overrides: overridesOf(edits) })
      send(res, 200, { report })
    },
    'POST /api/diff': async (req, res) => {
      const { edits } = await body(req)
      send(res, 200, { lines: lineDiff(state.text, rewriteScore(state.text, options.piece, edits)) })
    },
    'POST /api/write': async (req, res) => {
      const { edits, version } = await body(req)
      const disk = await readFile(file, 'utf8')
      if (disk !== state.text || version !== state.version) return send(res, 409, { error: `${basename(file)} changed on disk; reload the mixer before writing` })
      const text = rewriteScore(state.text, options.piece, edits)
      checkScore(text, basename(file))
      await writeFile(file, text)
      state = await load(text, state.version + 1, state.stems)
      send(res, 200, describe())
    },
    'POST /api/export': async (req, res) => {
      const { edits, formats = ['wav'] } = await body(req)
      const { audio, report } = masterStems(state.stems, state.rendering, RATE, { credits: state.credits, overrides: overridesOf(edits) })
      await mkdir(dirname(out), { recursive: true })
      await writeFile(`${out}.wav`, encodeWav(audio, RATE, 24))
      const r = state.rendering
      const tags = { title: r.title || r.piece.title, artist: r.by }
      const files = [`${out}.wav`]
      for (const f of formats as string[]) {
        if (f !== 'flac' && f !== 'mp3') continue
        encodeWith(`${out}.wav`, `${out}.${f}`, tags, f)
        files.push(`${out}.${f}`)
      }
      if (!formats.includes('wav')) files.shift()
      await writeFile(`${out}.report.json`, `${JSON.stringify(report, null, 2)}\n`)
      send(res, 200, { files, report })
    },
    'GET /api/events': async (req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
      res.write(': connected\n\n')
      listeners.add(res)
      req.on('close', () => listeners.delete(res))
    },
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    try {
      const route = routes[`${req.method} ${url.pathname}`]
      if (route) return await route(req, res)
      const stem = url.pathname.match(/^\/stems\/(\d+)\.wav$/)
      if (stem && state.stems[Number(stem[1])]) {
        const i = Number(stem[1])
        if (!state.wavs.has(i)) state.wavs.set(i, encodeWav(state.stems[i].channels, RATE, 16))
        return send(res, 200, state.wavs.get(i), 'audio/wav')
      }
      const asset = url.pathname === '/' ? join(PAGE, 'index.html') : url.pathname.startsWith('/lib/') ? join(LIB, url.pathname.slice(5)) : join(PAGE, url.pathname.slice(1))
      if (!asset.startsWith(PAGE) && !asset.startsWith(LIB)) return send(res, 404, { error: 'not found' })
      const type = TYPES[extname(asset)]
      if (!type) return send(res, 404, { error: 'not found' })
      send(res, 200, await readFile(asset), type)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 400
      send(res, code, { error: (error as Error).message })
    }
  })

  await new Promise<void>((done, fail) => {
    server.once('error', (error: NodeJS.ErrnoException) =>
      fail(error.code === 'EADDRINUSE' ? new Error(`port ${options.port} is in use; pass --port with another number`) : error),
    )
    server.listen(options.port ?? 4747, '127.0.0.1', () => done())
  })
  const address = server.address()
  const url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : options.port}`
  if (options.open) spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore', detached: true }).unref()

  return {
    url,
    close: () =>
      new Promise<void>((done) => {
        watcher?.close()
        if (timer) clearTimeout(timer)
        for (const res of listeners) res.end()
        server.close(() => done())
      }),
  }
}
