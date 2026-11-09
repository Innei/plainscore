import { ffmpeg } from './ffmpeg.ts'

export const encodeWith = (wav: string, out: string, tags: { title: string; artist: string; album?: string }, codec: 'flac' | 'mp3') => {
  const meta = Object.entries(tags).flatMap(([k, v]) => (v ? ['-metadata', `${k}=${v}`] : []))
  const args = codec === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '320k', '-id3v2_version', '3'] : ['-c:a', 'flac', '-sample_fmt', 's32']
  ffmpeg(['-v', 'error', '-y', '-i', wav, ...args, ...meta, out], `--${codec}`)
}
