import { spawn } from 'node:child_process'
import { type FSWatcher, watch } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rewriteScore } from 'plainscore'
import { encodeWav } from '../dsp/wav.ts'
import { RATE } from '../offline.ts'
import { createSession } from '../session.ts'
import type { Sounds } from '../sources/types.ts'
import { encodeWith } from './encode.ts'

export interface MixerOptions {
  file: string
  sounds: Sounds
  piece: string
  variant: string | null
  port?: number
  out?: string
  open?: boolean
  page?: string
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
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.json': 'application/json',
}
const UNBUILT = 'The mixer page is not built. Run `pnpm build` in packages/render, then start the mixer again.'

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
  const page = resolve(options.page ?? PAGE)
  const out = options.out ?? join(dirname(file), 'out', basename(file, extname(file)))
  const session = await createSession({ text: await readFile(file, 'utf8'), name: basename(file), piece: options.piece, variant: options.variant, sounds: options.sounds })
  let wavs = new Map<number, Uint8Array>()
  const listeners = new Set<ServerResponse>()
  const emit = (event: string, data: unknown) => {
    for (const res of listeners) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  const describe = () => ({ file, ...session.describe() })

  let watcher: FSWatcher | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const reload = async () => {
    const text = await readFile(file, 'utf8').catch(() => null)
    if (text === null || text === session.text) return
    emit('changed', { file })
    try {
      await session.apply(text, false)
      wavs = new Map()
      emit('ready', { version: session.version })
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
      send(res, 200, session.measure(edits))
    },
    'POST /api/diff': async (req, res) => {
      const { edits } = await body(req)
      send(res, 200, { lines: lineDiff(session.text, rewriteScore(session.text, options.piece, edits)) })
    },
    'POST /api/write': async (req, res) => {
      const { edits, version } = await body(req)
      const disk = await readFile(file, 'utf8')
      if (disk !== session.text || version !== session.version) return send(res, 409, { error: `${basename(file)} changed on disk; reload the mixer before writing` })
      const text = session.rewrite(edits)
      await writeFile(file, text)
      await session.apply(text, true)
      wavs = new Map()
      send(res, 200, describe())
    },
    'POST /api/export': async (req, res) => {
      const { edits, formats = ['wav'] } = await body(req)
      const { audio, report, curve } = session.master(edits)
      await mkdir(dirname(out), { recursive: true })
      await writeFile(`${out}.wav`, encodeWav(audio, RATE, 24))
      const r = session.rendering
      const tags = { title: r.title || r.piece.title, artist: r.by }
      const files = [`${out}.wav`]
      for (const f of formats as string[]) {
        if (f !== 'flac' && f !== 'mp3') continue
        encodeWith(`${out}.wav`, `${out}.${f}`, tags, f)
        files.push(`${out}.${f}`)
      }
      if (!formats.includes('wav')) files.shift()
      await writeFile(`${out}.report.json`, `${JSON.stringify(report, null, 2)}\n`)
      send(res, 200, { files, report, curve })
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
      if (stem && session.stems[Number(stem[1])]) {
        const i = Number(stem[1])
        if (!wavs.has(i)) wavs.set(i, encodeWav(session.stems[i].channels, RATE, 16))
        return send(res, 200, wavs.get(i), 'audio/wav')
      }
      const asset = url.pathname === '/' ? join(page, 'index.html') : resolve(page, `.${url.pathname}`)
      if (!asset.startsWith(page)) return send(res, 404, { error: 'not found' })
      if (url.pathname === '/' && !(await stat(asset).catch(() => null))) return send(res, 503, UNBUILT, 'text/plain; charset=utf-8')
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
