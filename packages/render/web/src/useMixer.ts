import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { api } from './api.ts'
import { changeCards, revertChange } from './lib/changes.ts'
import { resolveMix } from './lib/mix.ts'
import type { Edits, MixerState } from './lib/types.ts'
import { type Player, createPlayer } from './player.ts'
import { type Tab, initial, reduce } from './store.ts'

const settingsOf = (state: MixerState, edits: Edits, gain: number) => ({ mix: resolveMix(state, edits), space: edits.space, master: edits.master, gain })

export const useMixer = () => {
  const [m, dispatch] = useReducer(reduce, initial)
  const player = useRef<Player | null>(null)
  const [, setTick] = useState(0)
  const [measuring, setMeasuring] = useState(false)
  const [writing, setWriting] = useState(false)
  const [exported, setExported] = useState<string | null>(null)
  const onChange = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    let alive = true
    let made: Player | null = null
    ;(async () => {
      const state = await api.state()
      if (!alive) return
      dispatch({ type: 'loaded', state })
      document.title = `${state.piece.title || state.title} — plainscore mixer`
      dispatch({ type: 'status', status: 'loading stems…' })
      made = await createPlayer(state, settingsOf(state, state.edits, state.report.gain), onChange)
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

  useEffect(() => {
    const events = new EventSource('/api/events')
    events.addEventListener('changed', () => dispatch({ type: 'banner', banner: { text: 'The score changed on disk — rendering it again…' } }))
    events.addEventListener('ready', () => dispatch({ type: 'banner', banner: { text: 'The score was rendered again.', reload: true } }))
    events.addEventListener('failed', (e) => dispatch({ type: 'banner', banner: { text: `The score no longer reads: ${JSON.parse((e as MessageEvent).data).error}` } }))
    return () => events.close()
  }, [])

  const changes = useMemo(() => (m.state && m.edits ? changeCards(m.state, m.edits) : []), [m.state, m.edits])
  const dirty = changes.length > 0

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

  const edit = useCallback((next: Edits) => dispatch({ type: 'edit', edits: next }), [])

  const measure = useCallback(async () => {
    if (!m.edits) return
    const edits = m.edits
    setMeasuring(true)
    try {
      const { report, curve } = await api.measure(edits)
      dispatch({ type: 'measured', report, curve, edits })
    } catch (error) {
      dispatch({ type: 'banner', banner: { text: (error as Error).message } })
    } finally {
      setMeasuring(false)
    }
  }, [m.edits])

  const write = useCallback(async () => {
    if (!m.edits || !m.state) return
    setWriting(true)
    try {
      dispatch({ type: 'written', state: await api.write(m.edits, m.state.version) })
    } catch (error) {
      dispatch({ type: 'writeFailed', error: (error as Error).message })
    } finally {
      setWriting(false)
    }
  }, [m.edits, m.state])

  const exportFiles = useCallback(
    async (formats: string[]) => {
      if (!m.edits) return
      const edits = m.edits
      setExported('rendering…')
      try {
        const { files, report, curve } = await api.export(edits, formats)
        setExported(files.join('\n'))
        dispatch({ type: 'measured', report, curve, edits })
      } catch (error) {
        setExported((error as Error).message)
      }
    },
    [m.edits],
  )

  const revert = useCallback((id: string) => m.state && m.edits && edit(revertChange(m.state, m.edits, id)), [m.state, m.edits, edit])
  const revertAll = useCallback(() => m.state && edit(structuredClone(m.state.edits)), [m.state, edit])

  return {
    ...m,
    changes,
    dirty,
    measuring,
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
    setTab: (tab: Tab) => dispatch({ type: 'tab', tab }),
  }
}

export type Mixer = ReturnType<typeof useMixer>
