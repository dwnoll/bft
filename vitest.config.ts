import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'src/client/**'],
    coverage: {
      provider: 'v8',
      include: ['src/server/**/*', 'src/shared/**/*'],
      exclude: ['src/server/index.ts'],
      reporter: ['text', 'html'],
    },
  },
})
