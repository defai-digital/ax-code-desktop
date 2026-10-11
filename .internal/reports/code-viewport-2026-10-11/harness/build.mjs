import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
const repo = '/Users/akiralam/code/ax-coder-old'
const require = createRequire(`${repo}/desktop/packages/web/package.json`)
const { build } = await import(require.resolve('vite'))
const sourcePath = `${repo}/desktop/packages/ui/src/components/chat/message/ToolOutputDialog.tsx`
const baseline = process.env.AX_PERF_BASELINE === '1'
const original = baseline ? execFileSync('git', ['show', 'a16e771:desktop/packages/ui/src/components/chat/message/ToolOutputDialog.tsx'], { cwd: repo, encoding: 'utf8' }) : null
await build({
  configFile: `${repo}/desktop/packages/web/vite.config.ts`,
  plugins: baseline ? [{ name: 'historical-code-viewport-baseline', enforce: 'pre', load(id) { if (id === sourcePath) return original } }] : [],
  build: { outDir: `/tmp/ax-coder-code-viewport-${baseline ? 'baseline' : 'candidate'}-dist`, emptyOutDir: true,
    rollupOptions: { input: `${repo}/desktop/packages/web/perf/renderer.html` } },
})
