import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { MixerBackend } from './backend/types.ts'
import { type MeasureState, createAutoMeasure } from './lib/autoMeasure.ts'
import { revertChange } from './lib/changes.ts'
import { resolveMix } from './lib/mix.ts'
import { scoreRail } from './lib/scoreRail.ts'
import type { Curve, Edits, MixerState, Report } from './lib/types.ts'
import { type Player, createPlayer } from './player.ts'
import { initial, reduce } from './store.ts'

const settingsOf = (state: MixerState, edits: Edits, gain: number) => ({ mix: resolveMix(state, edits), space: edits.space, master: edits.master, gain })

export const useMixer = (backend: MixerBackend) => {
  const [m, dispatch] = useReducer(reduce, initial)
  const player = useRef<Player | null>(null)
  const [, setTick] = useState(0)
  const [measureState, setMeasureState] = useState<MeasureState>('measured')
  const [writing, setWriting] = useState(false)
  const [exported, setExported] = useState<string | null>(null)
  const onChange = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    let alive = true
    let made: Player | null = null
    ;(async () => {
      const state = await backend.state()
      if (!alive) return
      dispatch({ type: 'loaded', state })
      document.title = `${state.piece.title || state.title} — plainscore mixer`
      dispatch({ type: 'status', status: 'loading stems…' })
      made = await createPlayer(state, settingsOf(state, state.edits, state.report.gain), onChange, backend)
      if (!alive) return void made.dispose()
      player.current = made
      made.setComp(state.report.sections.map((s) => s.compensation))
      dispatch({ type: 'status', status: null })
    })().catch((error: Error) => {
      dispatch({ type: 'status', status: 'failed' })
      dispatch({ type: 'banner', banner: { text: error.message } })
    })
    return () => {
      alive = false
      player.current = null
      void made?.dispose()
    }
  }, [onChange])

  useEffect(
    () =>
      backend.onEvent((event) => {
        if (event.type === 'changed') dispatch({ type: 'banner', banner: { text: 'The score changed on disk — rendering it again…' } })
        else if (event.type === 'ready') dispatch({ type: 'banner', banner: { text: 'The score was rendered again.', reload: true } })
        else dispatch({ type: 'banner', banner: { text: `The score no longer reads: ${event.error}` } })
      }),
    [backend],
  )

  const rail = useMemo(() => {
    if (!m.state || !m.edits) return null
    try {
      return scoreRail(m.state.text, m.state.piece.id, m.edits)
    } catch {
      return null
    }
  }, [m.state, m.edits])
  const dirty = (rail?.count ?? 0) > 0

  const auto = useRef<ReturnType<typeof createAutoMeasure<Edits, { report: Report; curve: Curve }>> | null>(null)
  useEffect(() => {
    const made = createAutoMeasure<Edits, { report: Report; curve: Curve }>({
      delay: 800,
      run: (edits) => backend.measure(edits),
      onState: (state, done, error) => {
        setMeasureState(state)
        if (done) dispatch({ type: 'measured', report: done.result.report, curve: done.result.curve, edits: done.edits })
        if (error) dispatch({ type: 'banner', banner: { text: error.message } })
      },
    })
    auto.current = made
    return () => made.dispose()
  }, [])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    if (m.view) player.current?.setComp(m.view.comp)
  }, [m.view])

  useEffect(() => {
    if (m.state && m.edits && m.view) player.current?.update(settingsOf(m.state, m.edits, m.view.gain))
  }, [m.state, m.edits, m.view])

  const edit = useCallback(
    (next: Edits) => {
      dispatch({ type: 'edit', edits: next })
      if (backend.capabilities.autoMeasure) auto.current?.touch(next)
    },
    [backend],
  )

  const measure = useCallback(() => {
    if (m.edits) auto.current?.now(m.edits)
  }, [m.edits])

  const write = useCallback(async () => {
    if (!m.edits || !m.state) return
    setWriting(true)
    try {
      dispatch({ type: 'written', state: await backend.save(m.edits, m.state.version) })
    } catch (error) {
      dispatch({ type: 'writeFailed', error: (error as Error).message })
    } finally {
      setWriting(false)
    }
  }, [backend, m.edits, m.state])

  const exportFiles = useCallback(
    async (formats: string[]) => {
      if (!m.edits) return
      const edits = m.edits
      setExported('rendering…')
      try {
        const { files, report, curve } = await backend.exportAudio(edits, formats)
        setExported(files.join('\n'))
        dispatch({ type: 'measured', report, curve, edits })
      } catch (error) {
        setExported((error as Error).message)
      }
    },
    [backend, m.edits],
  )

  const revert = useCallback((id: string) => m.state && m.edits && edit(revertChange(m.state, m.edits, id)), [m.state, m.edits, edit])
  const revertAll = useCallback(() => m.state && edit(structuredClone(m.state.edits)), [m.state, edit])

  return {
    ...m,
    rail,
    capabilities: backend.capabilities,
    dirty,
    measureState,
    writing,
    exported,
    player: player.current,
    edit,
    measure,
    write,
    exportFiles,
    revert,
    revertAll,
    select: (index: number) => dispatch({ type: 'select', index }),
  }
}

export type Mixer = ReturnType<typeof useMixer>
