import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

/**
 * Версія збірки. Номер — це кількість комітів (зростає сама), поруч
 * короткий відбиток коміту й час складання: щоб було видно, чи справді
 * на телефоні свіжа версія, а не та, що застрягла в кеші.
 */
function buildInfo() {
  const git = (cmd: string, fallback: string) => {
    try {
      return execSync(cmd, { encoding: 'utf8' }).trim()
    } catch {
      return fallback
    }
  }
  const count = git('git rev-list --count HEAD', '0')
  const hash = git('git rev-parse --short HEAD', 'локальна')
  return {
    version: `1.${count}`,
    hash,
    time: new Date().toISOString(),
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
