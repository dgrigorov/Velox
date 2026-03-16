import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@velox/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@velox/economic-calendar': resolve(__dirname, '../../packages/economic-calendar/src/index.ts'),
      '@velox/market-buzz': resolve(__dirname, '../../packages/market-buzz/src/index.ts'),
    },
  },
  server: {
    port: 5173,
  },
})
