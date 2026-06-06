#!/usr/bin/env node
/**
 * Thin wrapper around electron-builder for platform-specific packaging.
 * Called by CI as: node ./scripts/package.mjs --win --x64 --publish=never
 *
 * Exists as a separate script (rather than a direct bunx call) so we can add
 * platform-specific pre-packaging steps (e.g., signing setup, env coercion)
 * without modifying the CI YAML.
 */
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const electronDir = path.join(__dirname, '..')

// Forward all CLI args to electron-builder unchanged.
// e.g. ['--win', '--x64', '--publish=never']
const args = process.argv.slice(2)

// Resolve electron-builder via bun (it's hoisted to the workspace root, not
// packages/electron/node_modules/.bin), matching how the macOS job invokes it.
// shell:true so `bunx` resolves on the Windows runner.
const result = spawnSync(
  'bunx',
  ['electron-builder', ...args],
  {
    stdio: 'inherit',
    cwd: electronDir,
    shell: true,
    env: {
      ...process.env,
      // electron-builder reads these for Windows code signing.
      // They are injected by the CI signing step when a certificate is present.
      WINDOWS_CERTIFICATE_FILE: process.env.WINDOWS_CERTIFICATE_FILE ?? '',
      WINDOWS_CERTIFICATE_PASSWORD: process.env.WINDOWS_CERTIFICATE_PASSWORD ?? '',
    },
  }
)

if (result.error) throw result.error
process.exit(result.status ?? 0)
