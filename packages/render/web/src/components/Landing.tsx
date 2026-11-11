import { checkScore } from 'plainscore'
import { useRef, useState } from 'react'
import type { Progress } from '../backend/engine.ts'
import { browserSoundDeps, prepareSiteSounds } from '../backend/siteSounds.ts'
import type { MixerBackend } from '../backend/types.ts'
import { createWorkerBackend } from '../backend/workerBackend.ts'
import { createWorkerTransport } from '../backend/workerTransport.ts'
import { type OpenedScore, canPick, createScoreFiles, downloadBlob, pickScore, readDrop, readFile } from '../lib/files.ts'

const EXAMPLES = [
  ['ma.score', '間 Ma'],
  ['road.score', '来路 The Road Behind'],
  ['bgm.score', 'bgm'],
] as const

const SLOW_MEASURE_MS = 30_000

interface PieceChoice {
  id: string
  title: string
  variants: string[]
}

type Stage =
  | { kind: 'idle'; error?: string }
  | { kind: 'choose'; opened: OpenedScore; pieces: PieceChoice[]; piece: PieceChoice | null }
  | { kind: 'preparing'; name: string; progress: Progress | null }

const mb = (bytes: number) => (bytes / 1e6).toFixed(1)

const progressText = (p: Progress | null) => {
  if (!p) return 'Reading the score…'
  if (p.stage === 'sounds') return p.total ? `Downloading sounds · ${mb(p.loaded)} of ${mb(p.total)} MB` : `Downloading sounds · ${mb(p.loaded)} MB`
  return p.stage === 'rendering' ? 'Rendering the parts…' : 'Measuring loudness…'
}

export const Landing = ({ onReady }: { onReady: (backend: MixerBackend) => void }) => {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const fail = (error: unknown) => setStage({ kind: 'idle', error: (error as Error).message })

  const start = async (opened: OpenedScore, piece: string, variant: string | null) => {
    setStage({ kind: 'preparing', name: opened.name, progress: null })
    const worker = new Worker(new URL('../backend/worker.ts', import.meta.url), { type: 'module' })
    const { transport, open } = createWorkerTransport(worker)
    let measuringSince = 0
    const onProgress = (progress: Progress) => {
      if (progress.stage === 'measuring') measuringSince = performance.now()
      setStage({ kind: 'preparing', name: opened.name, progress })
    }
    try {
      const manifest = new URL(`${import.meta.env.BASE_URL}sounds/sounds.json`, location.origin).href
      const { prepared, transfer } = await prepareSiteSounds({ text: opened.text, name: opened.name, piece, variant }, browserSoundDeps(manifest), onProgress)
      await open({ text: opened.text, name: opened.name, piece, variant, prepared }, onProgress, transfer)
      const files = createScoreFiles({ ...opened, download: downloadBlob })
      onReady(createWorkerBackend(transport, files, { autoMeasure: performance.now() - measuringSince <= SLOW_MEASURE_MS }))
    } catch (error) {
      worker.terminate()
      fail(error)
    }
  }

  const take = (opened: OpenedScore | null) => {
    if (!opened) return
    try {
      const pieces = checkScore(opened.text, opened.name).pieces.map((p) => ({ id: p.id, title: p.title, variants: p.variants.map((v) => v.name) }))
      if (!pieces.length) throw new Error(`${opened.name} has no piece to play`)
      if (pieces.length === 1 && !pieces[0].variants.length) return void start(opened, pieces[0].id, null)
      setStage({ kind: 'choose', opened, pieces, piece: pieces.length === 1 ? pieces[0] : null })
    } catch (error) {
      fail(error)
    }
  }

  const example = async (file: string) => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}examples/${file}`)
      if (!res.ok) throw new Error(`${file} could not be loaded (${res.status})`)
      take({ name: file, text: await res.text(), handle: null })
    } catch (error) {
      fail(error)
    }
  }

  const choose = () => (canPick() ? pickScore().then(take, fail) : input.current?.click())

  return (
    <main className="landing">
      <div className="landing-col">
        <header>
          <span className="mark">plainscore</span>
          <h1>Mixer</h1>
          <p>Open a .score to hear it, balance the parts, set each section&apos;s loudness, and save the lines back.</p>
        </header>

        {stage.kind === 'idle' && (
          <>
            <button
              className={`drop${over ? ' over' : ''}`}
              onClick={choose}
              onDragOver={(e) => {
                e.preventDefault()
                setOver(true)
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setOver(false)
                readDrop(e.dataTransfer).then(take, fail)
              }}
            >
              <b>Drop a .score here</b>
              <span>or choose a file</span>
            </button>
            <input ref={input} type="file" accept=".score,text/plain" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0]).then(take, fail)} />
            {stage.error && <pre className="landing-error mono">{stage.error}</pre>}
            <p className="landing-note">Your score stays in this browser. Nothing is uploaded.</p>
            <section>
              <h2>Or try an example</h2>
              <div className="choices">
                {EXAMPLES.map(([file, title]) => (
                  <button key={file} onClick={() => void example(file)}>
                    <b>{title}</b>
                    <span className="mono">{file}</span>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {stage.kind === 'choose' && (
          <section>
            <h2>{stage.piece ? `Which version of ${stage.piece.title || stage.piece.id}?` : `Which piece in ${stage.opened.name}?`}</h2>
            <div className="choices">
              {stage.piece ? (
                <>
                  <button onClick={() => void start(stage.opened, stage.piece!.id, null)}>
                    <b>As written</b>
                    <span>no variant</span>
                  </button>
                  {stage.piece.variants.map((v) => (
                    <button key={v} onClick={() => void start(stage.opened, stage.piece!.id, v)}>
                      <b>{v}</b>
                      <span>variant</span>
                    </button>
                  ))}
                </>
              ) : (
                stage.pieces.map((p) => (
                  <button key={p.id} onClick={() => (p.variants.length ? setStage({ ...stage, piece: p }) : void start(stage.opened, p.id, null))}>
                    <b>{p.title || p.id}</b>
                    <span className="mono">{p.id}</span>
                  </button>
                ))
              )}
            </div>
            <button className="landing-back" onClick={() => setStage({ kind: 'idle' })}>
              Open a different score
            </button>
          </section>
        )}

        {stage.kind === 'preparing' && (
          <section className="preparing" aria-live="polite">
            <h2 className="mono">{stage.name}</h2>
            <div className="bar-track">
              <i style={{ width: stage.progress?.stage === 'sounds' && stage.progress.total ? `${(stage.progress.loaded / stage.progress.total) * 100}%` : stage.progress ? '100%' : '0%' }} />
            </div>
            <p>{progressText(stage.progress)}</p>
            <p className="landing-note">The first visit downloads about 3.5 MB of sounds. A long piece can take a minute or more to render.</p>
          </section>
        )}
      </div>
    </main>
  )
}
