import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire('/Users/akiralam/code/ax-coder-old/desktop/packages/web/package.json')
const { build } = await import(require.resolve('vite'))
let replaced = false
await build({ configFile: '/Users/akiralam/code/ax-coder-old/desktop/packages/web/vite.config.ts',
  plugins: [{ name: 'experimental-virtual-rows-invalidation', enforce: 'pre', load(id) {
    if (!id.endsWith('/components/chat/MessageList-impl.tsx')) return
    const code = readFileSync(id, 'utf8')
    const before = `const historyVirtualRows = React.useMemo(\n      () => (shouldVirtualizeHistory ? historyVirtualizer.getVirtualItems() : EMPTY_VIRTUAL_ROWS),\n      [historyVirtualizer, shouldVirtualizeHistory],\n    )`
    if (!code.includes(before)) throw new Error('Expected projection source was not found')
    replaced = true
    return code.replace(before, `const historyVirtualRows = shouldVirtualizeHistory ? historyVirtualizer.getVirtualItems() : EMPTY_VIRTUAL_ROWS`).replace('    streamPerfCount("ui.message_list.render")', '    "use no memo"\n    streamPerfCount("ui.message_list.render")')
  }}],
  build: { outDir: '/tmp/ax-coder-renderer-candidate-dist', emptyOutDir: true,
    rollupOptions: { input: '/Users/akiralam/code/ax-coder-old/desktop/packages/web/perf/renderer.html' } } })
if (!replaced) throw new Error('Experimental patch did not apply')
