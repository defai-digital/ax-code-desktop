import { createRequire } from 'node:module'
const require = createRequire('/Users/akiralam/code/ax-coder-old/desktop/packages/web/package.json')
const { build } = await import(require.resolve('vite'))
await build({ configFile: '/Users/akiralam/code/ax-coder-old/desktop/packages/web/vite.config.ts',
  build: { outDir: '/tmp/ax-coder-renderer-dist', emptyOutDir: true,
    rollupOptions: { input: '/Users/akiralam/code/ax-coder-old/desktop/packages/web/perf/renderer.html' } } })
