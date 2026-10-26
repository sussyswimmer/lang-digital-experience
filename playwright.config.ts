import { defineConfig, devices } from '@playwright/test';

// E2E runs against a production build served at / (BASE_PATH=/), in a desktop and a touch-tablet viewport.
export default defineConfig({
  testDir: 'tests/e2e',
  // software WebGL renders at ~5–7 fps on a 4-core runner: one worker, generous timeouts
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    launchOptions: {
      // software WebGL in headless Chromium; let narration/ambient audio start without a gesture
      args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: false } },
  ],
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    env: { BASE_PATH: '/' },
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
