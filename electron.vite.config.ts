import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { resolve } from 'path'
import type { Plugin } from 'vite'
import { createManualChunks } from './src/manual-chunks'

/**
 * Content-Security-Policy of the packaged app. Build only: Vite's dev server
 * needs inline scripts. connect-, img- and media-src stay open because the
 * user picks the server (and the local library server runs on 127.0.0.1).
 * hls.js plays through a blob: worker and blob: media.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  'img-src * data: blob:',
  'media-src * data: blob:',
  'connect-src *',
  "font-src 'self' data:",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'rimelight-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html.replace(
          /(<meta charset="UTF-8" \/>)/,
          `$1\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
        ),
    },
  }
}

export default defineConfig({
  main: {
    build: {
      minify: 'terser',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main/index.ts'),
        },
      },
      externalizeDeps: {
        exclude: [
          '@electron-toolkit/utils',
          'electron-store',
          'electron-dl',
          'electron-updater',
          'discord-rpc',
          'music-metadata',
        ],
      },
    },
  },
  preload: {
    build: {
      minify: 'terser',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload/index.ts'),
        },
        // Sandboxed preloads run as plain scripts, not ES modules, and
        // package.json's "type": "module" would make this one ESM.
        output: { format: 'cjs' },
      },
      externalizeDeps: {
        exclude: ['electron-updater'],
      },
    },
  },
  renderer: {
    root: '.',
    plugins: [react(), contentSecurityPolicy()],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    build: {
      minify: 'terser',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
        output: {
          manualChunks: createManualChunks,
        },
      },
    },
  },
})
