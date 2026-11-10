export type MeasureState = 'measuring' | 'measured' | 'failed'

export interface AutoMeasureOptions<E, R> {
  delay: number
  run: (edits: E) => Promise<R>
  onState: (state: MeasureState, done?: { result: R; edits: E }, error?: Error) => void
}

export const createAutoMeasure = <E, R>({ delay, run, onState }: AutoMeasureOptions<E, R>) => {
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let queued: { edits: E } | null = null
  let disposed = false

  const clear = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  const settle = (report: () => void) => {
    running = false
    if (disposed) return
    const next = queued
    queued = null
    if (next) start(next.edits)
    else report()
  }

  const start = (edits: E) => {
    running = true
    onState('measuring')
    run(edits).then(
      (result) => settle(() => onState('measured', { result, edits })),
      (error: Error) => settle(() => onState('failed', undefined, error)),
    )
  }

  const now = (edits: E) => {
    clear()
    if (disposed) return
    if (running) queued = { edits }
    else start(edits)
  }

  return {
    now,
    touch(edits: E) {
      clear()
      if (!disposed) timer = setTimeout(() => now(edits), delay)
    },
    dispose() {
      disposed = true
      clear()
    },
  }
}
