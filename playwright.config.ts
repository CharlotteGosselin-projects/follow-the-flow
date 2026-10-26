import { defineConfig, devices } from '@playwright/test';

// End-to-end tests drive the built app (run `npm run build` first) in Chromium.
// PW_CHROMIUM_PATH points at a preinstalled Chromium when downloading one isn't possible.
const PORT = Number(process.env.PORT || 4173);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    locale: 'en-US',
    timezoneId: 'Europe/Paris',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 900 } } },
  ],
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
