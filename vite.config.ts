import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

/**
 * Версія збірки — це час складання. Рахувати коміти не можна: Vercel
 * викачує лише останній десяток, і номер виходив менший за справжній.
 * Час же ні з чим не сплутаєш і він завжди зростає.
 */
function buildInfo() {
  const hash =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
    (() => {
      try {
        return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
      } catch {
        return 'локальна'
      }
    })()

  const now = new Date()
  const two = (n: number) => String(n).padStart(2, '0')
  return {
    version: `${two(now.getDate())}.${two(now.getMonth() + 1)} ${two(now.getHours())}:${two(now.getMinutes())}`,
    hash,
    time: now.toISOString(),
  }
}

export default defineConfig({
  define: {
    __BUILD__: JSON.stringify(buildInfo()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'MotoApp',
        short_name: 'MotoApp',
        description: 'Трекер мотопоїздок',
        lang: 'uk',
        theme_color: '#0a0a0c',
        background_color: '#0a0a0c',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // mjs — це воркер карти, без нього карта не працює офлайн.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Тайли карти кешуємо, щоб мапа працювала і без звʼязку
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: true,
    // Серверні функції (/api) працюють лише на Vercel — ключ лежить там.
    // Тому в режимі розробки перенаправляємо запити до них на бойовий сервер.
    proxy: {
      '/api': { target: 'https://moto-app-zeta.vercel.app', changeOrigin: true },
    },
  },
})
