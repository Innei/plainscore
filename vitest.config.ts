import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: [{ find: /^plainscore$/, replacement: new URL('./src/index.ts', import.meta.url).pathname }] },
})
