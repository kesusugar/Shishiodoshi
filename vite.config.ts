/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Shishiodoshi/',
  server: { port: 5173, strictPort: true },
  // three.js alone is ~550 kB minified; that is expected, not a code-splitting problem.
  build: { target: 'es2022', chunkSizeWarningLimit: 1000 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
