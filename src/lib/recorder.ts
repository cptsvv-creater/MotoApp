/**
 * Запис відео з полотна. Браузери підтримують різні формати: Safari
 * віддає mp4, решта — webm, тож питаємо, що вміє саме цей телефон,
 * і не наполягаємо на своєму.
 */

const CANDIDATES = [
  'video/mp4;codecs=h264',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
]

export function videoSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    CANDIDATES.some((t) => MediaRecorder.isTypeSupported(t))
  )
}

export function pickMime(): string | null {
  return CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null
}

export interface Recording {
  stop: () => Promise<Blob>
  cancel: () => void
}

export function recordCanvas(canvas: HTMLCanvasElement, fps = 30): Recording | null {
  const mime = pickMime()
  if (!mime) return null

  const stream = canvas.captureStream(fps)
  // 4.5 Мбіт/с: сорокап'ятисекундне відео важить близько 15 МБ — таке
  // без мороки надсилається в месенджери й лягає в Instagram.
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_500_000 })
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  recorder.start(500)

  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop())
          resolve(new Blob(chunks, { type: mime }))
        }
        // Записувач іноді ще тримає останній шматок — просимо віддати.
        if (recorder.state !== 'inactive') recorder.stop()
        else resolve(new Blob(chunks, { type: mime }))
      }),
    cancel: () => {
      if (recorder.state !== 'inactive') recorder.stop()
      stream.getTracks().forEach((t) => t.stop())
    },
  }
}

/** Розширення файлу за типом, щоб телефон упізнав відео. */
export function extensionFor(blob: Blob): string {
  return blob.type.includes('mp4') ? 'mp4' : 'webm'
}
