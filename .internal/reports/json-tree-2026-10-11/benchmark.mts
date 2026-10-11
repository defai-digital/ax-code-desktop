import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'

const repo = resolve(process.cwd())
const directory = mkdtempSync(join(tmpdir(), 'ax-coder-json-baseline-'))
try {
  const historicalPath = join(directory, 'jsonTreeUtils.ts')
  writeFileSync(historicalPath, execFileSync('git', ['show', '13e4263:desktop/packages/ui/src/lib/jsonTreeUtils.ts'], { cwd: repo }))
  const baseline = await import(pathToFileURL(historicalPath).href)
  const candidate = await import(pathToFileURL(join(repo, 'desktop/packages/ui/src/lib/jsonTreeUtils.ts')).href)
  const fixtures = {
    nested: Array.from({ length: 4000 }, (_, index) => ({ index, name: `JSON fixture ${index}`, payload: Array.from({ length: 20 }, (_, i) => index + i) })),
    cappedArray: Array.from({ length: 1_000_000 }, (_, index) => index),
  }
  const results: Record<string, unknown> = {}
  for (const [name, data] of Object.entries(fixtures)) {
    const old = () => baseline.parseJsonToTree(JSON.stringify(data))
    const next = () => candidate.buildJsonTree(data)
    old(); next()
    const timings = { baseline: [] as number[], candidate: [] as number[] }
    for (let iteration = 0; iteration < 9; iteration++) {
      // Alternate order to limit a systematic warmup bias.
      for (const [label, operation] of (iteration % 2 ? [['candidate', next], ['baseline', old]] : [['baseline', old], ['candidate', next]]) as [keyof typeof timings, () => unknown][]) {
        const started = performance.now()
        operation()
        timings[label].push(performance.now() - started)
      }
    }
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
    const before = old()
    const after = next()
    const beforeCount = baseline.flattenTree(before, new Set()).length
    const afterCount = candidate.flattenTree(after, new Set()).length
    if (beforeCount !== afterCount) throw new Error('Retained node count changed')
    results[name] = { sourceBytes: Buffer.byteLength(JSON.stringify(data)), retainedNodes: afterCount, baselineMedianMs: median(timings.baseline), candidateMedianMs: median(timings.candidate), timings }
  }
  console.log(JSON.stringify({ node: process.version, baselineRevision: '13e4263', results }, null, 2))
} finally {
  rmSync(directory, { recursive: true, force: true })
}
