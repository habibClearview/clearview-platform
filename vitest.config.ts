import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // .tsx as well, so a component can be rendered in a test. The Phase 0
    // workspace has now been taken down twice by a fault that type-checks and
    // builds cleanly and only appears when the thing is actually rendered.
    include: ['src/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.tsx'],
    coverage: {
      reporter: ['text', 'json'],
      include: ['src/lib/**/*.ts'],
    },
  },
  // tsconfig sets jsx: preserve for Next, which leaves JSX in the file, so the
  // runner has to transform it itself before a component can be rendered.
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
