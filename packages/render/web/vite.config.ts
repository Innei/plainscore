import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const target = `http://127.0.0.1:${process.env.MIXER_PORT ?? 4747}`

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: { alias: [{ find: /^plainscore$/, replacement: fileURLToPath(new URL('../../../src/index.ts', import.meta.url)) }] },
  build: { outDir: fileURLToPath(new URL('../mixer', import.meta.url)), emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  server: { proxy: { '/api': target, '/stems': target } },
})
