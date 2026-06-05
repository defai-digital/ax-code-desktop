#!/usr/bin/env node
/**
 * Bundles the Electron main process, preload script, and the web server into
 * the dist/ directory using esbuild.
 *
 * All JavaScript dependencies are inlined. Native modules (.node files) and
 * the electron runtime are kept as external requires so that electron-builder
 * can locate, sign, and unpack them correctly.
 */
import { build } from 'esbuild'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../../..')
const outDir = path.join(__dirname, '../dist')

await fs.mkdir(outDir, { recursive: true })
await fs.rm(path.join(outDir, 'server.js'), { force: true })
await fs.rm(path.join(outDir, 'server.mjs'), { force: true })

// Modules that cannot be bundled (native .node binaries or the Electron
// runtime itself). They are required at runtime from node_modules.
const nativeExternals = [
  'electron',
  'better-sqlite3',
  'node-pty',
  'bun-pty',
  'fsevents',
]

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  external: nativeExternals,
  minify: false,
  sourcemap: false,
}

// Main process + preload stay CJS because Electron reads package.json "main".
// The server is loaded dynamically from server.mjs at runtime.
await build({
  ...shared,
  format: 'cjs',
  entryPoints: [
    path.join(__dirname, '../src/main.js'),
    path.join(__dirname, '../src/preload.js'),
  ],
  outdir: outDir,
  external: [...nativeExternals, './server.mjs'],
})

// Server bundle stays ESM so import.meta.url remains valid in server modules.
await build({
  ...shared,
  format: 'esm',
  entryPoints: [path.join(root, 'packages/web/server/index.js')],
  outfile: path.join(outDir, 'server.mjs'),
})

console.log('[electron] bundle → dist/{main,preload}.js, dist/server.mjs')
