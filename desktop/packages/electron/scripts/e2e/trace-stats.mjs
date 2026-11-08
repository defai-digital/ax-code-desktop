// Pure fixture builders and statistics for the renderer trace harness
// (markdown-trace-webmcp.mjs). Kept free of CDP so they are unit-testable.

/** Nearest-rank percentile; `p` is in [0, 100]. Returns null for no samples. */
export const percentile = (values, p) => {
  const samples = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (samples.length === 0) return null
  const rank = Math.ceil((Math.min(Math.max(p, 0), 100) / 100) * samples.length)
  return samples[Math.max(rank, 1) - 1]
}

const round = (value) => (value === null ? null : Math.round(value * 100) / 100)

export const summarizeSamples = (values) => {
  const samples = values.filter((value) => Number.isFinite(value))
  return {
    count: samples.length,
    p50: round(percentile(samples, 50)),
    p95: round(percentile(samples, 95)),
    max: round(samples.length ? Math.max(...samples) : null),
  }
}

/**
 * Long tasks overlapping [start, end] on the performance.now() clock. A task that
 * straddles the window counts once with its full duration: the main thread was
 * blocked for that long regardless of where the window boundary falls.
 */
export const longTasksWithin = (tasks, start, end) => {
  const overlapping = tasks.filter((task) => task.start < end && task.start + task.duration > start)
  const durations = overlapping.map((task) => task.duration)
  return {
    count: overlapping.length,
    totalMs: round(durations.reduce((sum, value) => sum + value, 0)),
    maxMs: round(durations.length ? Math.max(...durations) : 0),
    over100Ms: durations.filter((value) => value > 100).length,
  }
}

/** Completed headed sections, as in a long assistant answer. Ends on a complete block. */
export const manyBlocksMarkdown = (targetCharacters) => {
  const sections = []
  let length = 0
  while (length < targetCharacters) {
    const section =
      `## Trace section ${sections.length}\n\n` +
      `${"Text with **bold**, `code`, a [link](https://example.com) and Unicode 中文 😀. ".repeat(6)}\n\n` +
      `- item one\n- item two\n\n`
    sections.push(section)
    length += section.length
  }
  return { text: sections.join(""), sections: sections.length }
}

/** A single unterminated code fence: the mutable tail the Worker must reparse on every append. */
export const openFenceMarkdown = (targetCharacters, marker) => {
  const lines = ["Streaming a long file:", "", "```ts"]
  let length = lines.join("\n").length
  for (let index = 0; length < targetCharacters; index += 1) {
    const line = `const value_${index} = ${index} // padding`
    lines.push(line)
    length += line.length + 1
  }
  lines.push(marker)
  return lines.join("\n")
}
