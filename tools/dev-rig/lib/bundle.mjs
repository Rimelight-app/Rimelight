// Builds app modules (src/, TypeScript, "@/" imports, CommonJS packages)
// into one ES module with esbuild, the way Vite would, and imports it. For
// runtime tests of renderer services under Node + jsdom
// (tools/dev-rig/handoff-unit.mjs). Set the browser globals first: modules
// read window, localStorage, … when they load.
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

function esbuild() {
  // esbuild comes with Vite (pnpm doesn't put it at the top level).
  const req = createRequire(path.join(root, 'package.json'))
  return createRequire(req.resolve('vite'))('esbuild')
}

/** `source`: an ES module (in src/ terms) whose exports the test needs. */
export async function importApp(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-bundle-'))
  const out = path.join(dir, 'app.mjs')
  await esbuild().build({
    stdin: { contents: source, resolveDir: path.join(root, 'src'), loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outfile: out,
    alias: { '@': path.join(root, 'src') },
    loader: { '.png': 'dataurl', '.svg': 'dataurl', '.jpg': 'dataurl', '.css': 'empty' },
    jsx: 'automatic',
    define: {
      'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'test', BASE_URL: '/' }),
    },
    logLevel: 'error',
  })
  return import(pathToFileURL(out).href)
}
