import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const requireElectron = createRequire(path.join(root, "desktop/packages/electron/package.json"))
const { build } = requireElectron("esbuild")
const temp = await mkdtemp(path.join(os.tmpdir(), "ax-rust-event-stream-"))
const ui = path.join(root, "desktop/packages/ui/src")
const output = path.join(root, ".tmp/rust-event-stream-benchmark.json")
const fixture = fileURLToPath(new URL("./", import.meta.url))
try {
  await build({
    entryPoints: [path.join(fixture, "renderer.tsx")],
    outfile: path.join(temp, "renderer.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    minify: true,
    jsx: "automatic",
    nodePaths: [path.join(root, "desktop/packages/ui/node_modules")],
    alias: { "@": ui },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "fixture-native-adapter",
        setup(builder) {
          builder.onResolve({ filter: /^@\/lib\/ax-code\/client$/ }, () => ({ path: "base", namespace: "fixture" }))
          builder.onResolve({ filter: /^@\/lib\/event-stream\/client$/ }, () => ({
            path: "transport",
            namespace: "fixture",
          }))
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: name }) => ({
            loader: "js",
            resolveDir: root,
            contents:
              name === "base"
                ? 'export const axCodeClient = { getBaseUrl: () => "/api/" };'
                : `import { createEventTransport as original } from ${JSON.stringify(path.join(ui, "lib/event-stream/client.ts"))};
export function createEventTransport(config, hooks) {
  if (new URLSearchParams(location.search).get('mode') === 'js') return original(config, hooks);
  const remove = window.fixture.onBatch((sequence, batch) => window.fixtureOnBatch(sequence, batch, hooks));
  return { close: remove, reconnect: () => { throw new Error('Fixture does not silently reconnect'); }, state: () => 'open' };
}`,
          }))
        },
      },
    ],
  })
  await mkdir(path.dirname(output), { recursive: true })
  const env = { ...process.env, AX_EVENT_BENCH_ROOT: root, AX_EVENT_BENCH_DIST: temp, AX_EVENT_BENCH_OUTPUT: output }
  delete env.ELECTRON_RUN_AS_NODE
  await promisify(execFile)(requireElectron("electron"), [path.join(fixture, "electron.cjs")], {
    env,
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  })
  const result = JSON.parse(await readFile(output, "utf8"))
  console.log(JSON.stringify({ ...result, results: undefined, rawEvidence: output }, null, 2))
} finally {
  await rm(temp, { recursive: true, force: true })
}
