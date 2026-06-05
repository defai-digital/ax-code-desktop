import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';
import { themeStoragePlugin } from '../../vite-theme-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));
const pwaDevEnabled = process.env.OPENCHAMBER_DISABLE_PWA_DEV !== '1';
const reactScanToggle = (process.env.VITE_ENABLE_REACT_SCAN ?? '').toLowerCase();
const enableReactScan = reactScanToggle === '1' || reactScanToggle === 'true' || reactScanToggle === 'on' || reactScanToggle === 'yes';
const nodeModulesSegment = 'node_modules/';

process.noDeprecation = true;

function getPackageNameFromNodeModuleId(id: string): string | null {
  const markerIndex = id.lastIndexOf(nodeModulesSegment);
  if (markerIndex < 0) {
    return null;
  }

  const match = id.slice(markerIndex + nodeModulesSegment.length);
  const segments = match.split('/');
  if (!segments[0]) {
    return null;
  }

  return match.startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];
}

function getVendorChunkName(packageName: string): string | undefined {
  if (packageName === 'react' || packageName === 'react-dom' || packageName === 'scheduler') return 'vendor-react';
  if (packageName === 'zustand' || packageName === 'use-sync-external-store') return 'vendor-state';
  if (packageName === '@ax-code/sdk') return 'vendor-ax-code-sdk';
  if (packageName === '@base-ui/react' || packageName.startsWith('@base-ui') || packageName.startsWith('@radix-ui')) return 'vendor-ui';
  if (packageName.startsWith('@codemirror') || packageName.startsWith('@lezer')) return 'vendor-codemirror';
  if (packageName === '@shikijs/langs') return 'vendor-shiki-langs';
  if (packageName === '@shikijs/themes') return 'vendor-shiki-themes';
  if (packageName.startsWith('@shikijs') || packageName === 'shiki') return 'vendor-shiki-core';
  if (packageName.includes('remark') || packageName.includes('rehype') || packageName.includes('micromark') || packageName === 'react-markdown' || packageName === 'unified') return 'vendor-markdown';
  if (packageName.includes('react-syntax-highlighter') || packageName.includes('highlight.js') || packageName === 'refractor' || packageName === 'prismjs') return 'vendor-syntax';
  if (packageName === '@xenova/transformers' || packageName === 'onnxruntime-web' || packageName === 'onnxruntime-common') return 'vendor-ml';
  if (packageName.startsWith('@tauri-apps')) return 'vendor-tauri';
  return undefined;
}

export default defineConfig({
  root: path.resolve(__dirname, '.'),
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    {
      name: 'inject-react-scan-script',
      transformIndexHtml() {
        if (!enableReactScan) {
          return;
        }
        return [
          {
            tag: 'script',
            attrs: {
              crossorigin: 'anonymous',
              src: '//unpkg.com/react-scan/dist/auto.global.js',
            },
            injectTo: 'head-prepend',
          },
        ];
      },
    },
    themeStoragePlugin(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,otf,eot}'],
        // iOS Safari/PWA is much more reliable with a classic (non-module) SW bundle.
        rollupFormat: 'iife',
        // We already keep a custom manifest in index.html
        injectionPoint: undefined,
      },
      devOptions: {
        enabled: pwaDevEnabled,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: [
      { find: '@ax-code/sdk/v2', replacement: path.resolve(__dirname, '../../node_modules/@ax-code/sdk/dist/v2/client.js') },
      { find: '@openchamber/ui', replacement: path.resolve(__dirname, '../ui/src') },
      { find: '@web', replacement: path.resolve(__dirname, './src') },
      { find: '@', replacement: path.resolve(__dirname, '../ui/src') },
    ],
  },
  worker: {
    format: 'es',
  },
  define: {
    'process.env': {},
    global: 'globalThis',
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  optimizeDeps: {
    include: ['@ax-code/sdk/v2'],
  },
  server: {
    port: 5173,
    proxy: {
      '/auth': {
        target: `http://127.0.0.1:${process.env.OPENCHAMBER_PORT || 3001}`,
        changeOrigin: true,
      },
      '/health': {
        target: `http://127.0.0.1:${process.env.OPENCHAMBER_PORT || 3001}`,
        changeOrigin: true,
      },
      '/api': {
        target: `http://127.0.0.1:${process.env.OPENCHAMBER_PORT || 3001}`,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        miniChat: path.resolve(__dirname, 'mini-chat.html'),
      },
      external: ['node:child_process', 'node:fs', 'node:path', 'node:url'],
      onwarn(warning, warn) {
        if (warning.code === 'EVAL' && warning.id?.includes('onnxruntime-web')) {
          return;
        }
        warn(warning);
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          const packageName = getPackageNameFromNodeModuleId(id);
          if (!packageName) return undefined;

          return getVendorChunkName(packageName);
        },
      },
    },
  },
});
