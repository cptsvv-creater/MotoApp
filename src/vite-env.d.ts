/// <reference types="vite/client" />

/** Версія збірки, підставляється під час складання — див. vite.config.ts */
declare const __BUILD__: {
  version: string
  hash: string
  time: string
}
