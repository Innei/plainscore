import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutoMeasure } from './autoMeasure.ts'

const deferred = <T>() => {
  let resolve!: (v: T) => void
  let reject!: (e: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createAutoMeasure', () => {
  it('runs once, 800 ms after the last of several touches, with the latest edits', async () => {
    const run = vi.fn(async (edits: string) => `report of ${edits}`)
    const seen: unknown[] = []
    const auto = createAutoMeasure({ delay: 800, run, onState: (state, done) => seen.push([state, done?.result]) })
    auto.touch('a')
    vi.advanceTimersByTime(500)
    auto.touch('b')
    vi.advanceTimersByTime(799)
    expect(run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(run.mock.calls).toEqual([['b']])
    expect(seen).toEqual([['measuring', undefined], ['measured', 'report of b']])
  })

  it('runs one measure at a time and follows with only the latest edits', async () => {
    const first = deferred<string>()
    const run = vi.fn<(edits: string) => Promise<string>>().mockReturnValueOnce(first.promise).mockImplementation(async (edits) => `report of ${edits}`)
    const done: string[] = []
    const auto = createAutoMeasure<string, string>({ delay: 800, run, onState: (state, got) => state === 'measured' && done.push(got!.result) })
    auto.now('a')
    auto.now('b')
    auto.now('c')
    expect(run.mock.calls).toEqual([['a']])
    first.resolve('old')
    await vi.runAllTimersAsync()
    expect(run.mock.calls).toEqual([['a'], ['c']])
    expect(done).toEqual(['report of c'])
  })

  it('reports a failure of the latest run', async () => {
    const states: string[] = []
    const auto = createAutoMeasure<string, string>({ delay: 800, run: async () => Promise.reject(new Error('no')), onState: (state) => states.push(state) })
    auto.now('a')
    await vi.runAllTimersAsync()
    expect(states).toEqual(['measuring', 'failed'])
  })

  it('does not run after it is disposed', () => {
    const run = vi.fn(async () => 'x')
    const auto = createAutoMeasure<string, string>({ delay: 800, run, onState: () => {} })
    auto.touch('a')
    auto.dispose()
    vi.advanceTimersByTime(2000)
    expect(run).not.toHaveBeenCalled()
  })
})
