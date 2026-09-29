import { defineConfig, devices } from '@playwright/test'

// Port domyślny 4173; gdy zajmuje go inny projekt, uruchom z E2E_PORT=4273 – inaczej Playwright
// podepnie się pod cudzy serwer (reuseExistingServer) i wszystkie testy padną na obcej stronie.
const PORT = Number(process.env.E2E_PORT ?? 4173)

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['iPhone 14'],
    browserName: 'chromium', // WebKit nie jest zainstalowany; viewport i UA jak iPhone 14
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
