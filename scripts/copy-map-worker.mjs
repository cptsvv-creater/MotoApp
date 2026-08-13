/**
 * MapLibre 6 вантажить свій фоновий воркер через шлях, який обчислюється
 * під час виконання. Складальник такого не бачить, тому у зібраному
 * застосунку файл воркера просто відсутній — карта мовчки лишається
 * порожньою. Тому кладемо воркер і його файл-супутник у public/ як
 * звичайну статику і показуємо карті шлях через setWorkerUrl().
 *
 * Запускається автоматично перед `npm run dev` і `npm run build`.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const distDir = dirname(require.resolve('maplibre-gl/dist/maplibre-gl.mjs'))
const outDir = join(process.cwd(), 'public', 'maplibre')

// Порядок важливий: воркер імпортує shared-файл із сусідньої теки.
const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']

mkdirSync(outDir, { recursive: true })
for (const file of files) {
  copyFileSync(join(distDir, file), join(outDir, file))
}

console.log(`[maplibre] воркер скопійовано у public/maplibre (${files.length} файли)`)
