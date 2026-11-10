import { describe, expect, it } from 'vitest'
import { type ScoreHandle, createScoreFiles } from './files.ts'

const fakeHandle = (initial: string) => {
  let disk = initial
  const handle: ScoreHandle = {
    getFile: async () => ({ text: async () => disk }),
    createWritable: async () => ({
      write: async (text: string) => void (disk = text),
      close: async () => {},
    }),
  }
  return { handle, read: () => disk, edit: (text: string) => void (disk = text) }
}

describe('createScoreFiles', () => {
  it('writes through the handle when the file is as it was opened', async () => {
    const file = fakeHandle('one')
    const files = createScoreFiles({ name: 'a.score', text: 'one', handle: file.handle, download: () => {} })
    expect(files.inPlace).toBe(true)
    await files.check()
    await files.write('two')
    expect(file.read()).toBe('two')
  })

  it('accepts a second save after its own write', async () => {
    const file = fakeHandle('one')
    const files = createScoreFiles({ name: 'a.score', text: 'one', handle: file.handle, download: () => {} })
    await files.write('two')
    await expect(files.check()).resolves.toBeUndefined()
  })

  it('refuses when the file changed since it was opened', async () => {
    const file = fakeHandle('one')
    const files = createScoreFiles({ name: 'a.score', text: 'one', handle: file.handle, download: () => {} })
    file.edit('someone else')
    await expect(files.check()).rejects.toThrow(/a\.score changed/)
  })

  it('asks for write permission before anything else and refuses when it is denied', async () => {
    const order: string[] = []
    const file = fakeHandle('one')
    const handle: ScoreHandle = {
      ...file.handle,
      getFile: async () => (order.push('read'), file.handle.getFile()),
      requestPermission: async () => (order.push('permission'), 'granted'),
    }
    await createScoreFiles({ name: 'a.score', text: 'one', handle, download: () => {} }).check()
    expect(order).toEqual(['permission', 'read'])
    const denied = createScoreFiles({ name: 'a.score', text: 'one', handle: { ...file.handle, requestPermission: async () => 'denied' }, download: () => {} })
    await expect(denied.check()).rejects.toThrow(/permission/)
  })

  it('downloads the score when there is no handle', async () => {
    const got: [string, string][] = []
    const files = createScoreFiles({ name: 'a.score', text: 'one', handle: null, download: (name, data) => void got.push([name, String(data)]) })
    expect(files.inPlace).toBe(false)
    await files.check()
    await files.write('two')
    expect(got).toEqual([['a.score', 'two']])
  })
})
