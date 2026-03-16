import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'market-buzz.standalone.js',
    },
    outDir: 'dist',
  },
  resolve: {
    alias: {
      '@velox/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
})
