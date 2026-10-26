import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// GitHub Pages serves the site from /<repo>/; local dev and tests override with BASE_PATH=/
const base = process.env.BASE_PATH ?? '/lang-digital-experience/';

export default defineConfig({
  base,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@content': fileURLToPath(new URL('./content', import.meta.url)),
    },
  },
  build: {
    target: ['es2022', 'safari16'],
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.includes('node_modules/three/') ? 'three' : id.includes('node_modules/gsap/') ? 'gsap' : undefined,
      },
    },
  },
  server: { host: true },
  // jspdf is imported lazily (certificate PDF); pre-bundle it so the first click in dev doesn't re-optimise
  optimizeDeps: { include: ['jspdf'] },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
});
