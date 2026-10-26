/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// cel builda: `ios` = aplikacja w powłoce Capacitora (docs/26) – bez service workera i manifestu PWA
const target = process.env.VITE_TARGET === 'ios' ? 'ios' : 'web'
const buildId = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' }).format(new Date())

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    react(),
    tailwindcss(),
    target === 'web' && VitePWA({
      // własny service worker – potrzebny do obsługi powiadomień Web Push
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon.svg', 'icon-src.png'],
      manifest: {
        name: 'Trening',
        short_name: 'Trening',
        description: 'Osobisty asystent treningowy: rower i żywienie.',
        lang: 'pl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f2f2f7',
        theme_color: '#0f172a',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,ico,json,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: { chunkSizeWarningLimit: 1000 },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // w aplikacji iOS zasoby są w bundlu – rejestracja service workera to pusta funkcja
      ...(target === 'ios' ? { 'virtual:pwa-register': fileURLToPath(new URL('./src/native/noServiceWorker.ts', import.meta.url)) } : {}),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/engine/**'],
      exclude: ['src/engine/**/*.test.ts', 'src/engine/types.ts'],
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
})
