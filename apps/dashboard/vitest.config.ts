import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // Codex's node:test files are excluded — they run with `node --test`, not vitest
    exclude: [
      '**/node_modules/**',
      'lib/telegram-auth.test.ts',
      'lib/telegram-help.test.ts',
      'lib/inspiration.test.ts',
      'lib/anthropic.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
