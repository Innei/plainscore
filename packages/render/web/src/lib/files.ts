import type { ScoreFiles } from '../backend/workerBackend.ts'

export interface ScoreHandle {
  getFile(): Promise<{ text(): Promise<string> }>
  createWritable(): Promise<{ write(text: string): Promise<void>; close(): Promise<void> }>
  requestPermission?(options: { mode: 'readwrite' }): Promise<string>
}

export interface OpenedScore {
  name: string
  text: string
  handle: ScoreHandle | null
}

export const downloadBlob = (name: string, data: string | Uint8Array) => {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: typeof data === 'string' ? 'text/plain;charset=utf-8' : 'audio/wav' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const createScoreFiles = ({ name, text, handle, download }: OpenedScore & { download: (name: string, data: string | Uint8Array) => void }): ScoreFiles => {
  let baseline = text
  return {
    name,
    inPlace: handle !== null,
    async check() {
      if (!handle) return
      if (handle.requestPermission && (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error(`permission to save ${name} was not given`)
      const disk = await (await handle.getFile()).text()
      if (disk !== baseline) throw new Error(`${name} changed since it was opened; open it again before saving`)
    },
    async write(next) {
      if (!handle) download(name, next)
      else {
        const writable = await handle.createWritable()
        await writable.write(next)
        await writable.close()
      }
      baseline = next
    },
    download,
  }
}

type Picker = (options: { types: { description: string; accept: Record<string, string[]> }[] }) => Promise<(ScoreHandle & { name: string })[]>

export const canPick = () => typeof window !== 'undefined' && 'showOpenFilePicker' in window

export const pickScore = async (): Promise<OpenedScore | null> => {
  const picker = (window as unknown as { showOpenFilePicker: Picker }).showOpenFilePicker
  try {
    const [handle] = await picker({ types: [{ description: 'plainscore', accept: { 'text/plain': ['.score'] } }] })
    return { name: handle.name, text: await (await handle.getFile()).text(), handle }
  } catch (error) {
    if ((error as Error).name === 'AbortError') return null
    throw error
  }
}

export const readFile = async (file: File): Promise<OpenedScore> => ({ name: file.name, text: await file.text(), handle: null })

export const readDrop = async (data: DataTransfer): Promise<OpenedScore | null> => {
  const item = [...data.items].find((i) => i.kind === 'file')
  if (!item) return null
  const file = item.getAsFile()
  const asHandle = (item as unknown as { getAsFileSystemHandle?: () => Promise<(ScoreHandle & { kind: string; name: string }) | null> }).getAsFileSystemHandle
  const handle = asHandle ? await asHandle.call(item).catch(() => null) : null
  if (handle && handle.kind === 'file') return { name: handle.name, text: await (await handle.getFile()).text(), handle }
  return file ? readFile(file) : null
}
