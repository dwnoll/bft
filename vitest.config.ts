import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    // Client component/hook tests need a DOM.
    environmentMatchGlobs: [['tests/client/**', 'jsdom']],
    setupFiles: ['tests/setup.ts'],
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'src/client/**'],
    coverage: {
      provider: 'v8',
      include: ['src/server/**/*', 'src/shared/**/*', 'src/client/**/*'],
      exclude: ['src/server/index.ts', 'src/client/main.tsx'],
      reporter: ['text', 'html'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
})
