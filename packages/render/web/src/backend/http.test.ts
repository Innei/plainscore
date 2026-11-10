import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startMixer } from '../../../src/node/mixer.ts'
import { SCORE, SOUNDS, backendContract } from './contract.ts'
import { createHttpBackend } from './http.ts'

backendContract('the HTTP backend', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'plainscore-http-'))
  const file = join(dir, 'little.score')
  writeFileSync(file, SCORE)
  const mixer = await startMixer({ file, sounds: SOUNDS, piece: 't', variant: null, port: 0, out: join(dir, 'out', 'little'), open: false, page: dir })
  return { backend: createHttpBackend(mixer.url), close: mixer.close }
})
