import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const target = `http://127.0.0.1:${process.env.MIXER_PORT ?? 4747}`

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig(({ mode }) => {
  const site = mode === 'site'
  return {
    root: at('.'),
    base: '/',
    publicDir: site ? at('../site-public') : false,
    plugins: [react()],
    resolve: { alias: [{ find: /^plainscore$/, replacement: at('../../../src/index.ts') }] },
    worker: { format: 'es' as const },
    build: { outDir: at(site ? '../site' : '../mixer'), emptyOutDir: true, chunkSizeWarningLimit: 2000 },
    server: { proxy: site ? undefined : { '/api': target, '/stems': target } },
  }
})
