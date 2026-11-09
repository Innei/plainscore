import { type ExecFileSyncOptions, execFileSync } from 'node:child_process'

export const ffmpeg = (args: string[], why: string, options: ExecFileSyncOptions = {}) => {
  try {
    return execFileSync('ffmpeg', args, options) as Buffer
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`${why} needs ffmpeg on the PATH (brew install ffmpeg, or apt install ffmpeg)`)
    throw error
  }
}
