#!/usr/bin/env node
/**
 * AX Code Desktop performance diagnostics report.
 *
 * Pulls the metrics the running desktop already records — startup milestones
 * and SSE proxy stream timings from /api/desktop/diagnostics/startup, plus
 * runtime state from /health — and prints a breakdown of where time goes:
 * backend startup, the desktop streaming pipeline, or the consumer (renderer).
 *
 * Usage:
 *   node scripts/ax-code-perf-report.mjs [--url http://localhost:3000] [--json]
 *   bun run perf:report -- --port 3000
 */

const DEFAULT_BASE_URL = 'http://localhost:3000';

// Streams whose delivered-vs-upstream first-chunk delta stays under this are
// considered free of meaningful desktop pipeline overhead.
const PIPELINE_OVERHEAD_THRESHOLD_MS = 50;
const SLOW_BACKEND_STARTUP_THRESHOLD_MS = 10_000;

const KEY_STARTUP_MILESTONES = [
  'web.server.bootstrap.start',
  'ax-code.process.launched',
  'web.server.ready',
  'api.first_response',
  'renderer.load-url.start',
  'renderer.did-finish-load',
  'stream.first_token',
];

export const median = (values) => {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

export const summarizeStartupTimeline = (events = []) => {
  const ordered = [...events]
    .filter((event) => event && typeof event.name === 'string' && Number.isFinite(event.sinceStartMs))
    .sort((a, b) => a.sinceStartMs - b.sinceStartMs);

  let previousMs = 0;
  const timeline = ordered.map((event) => {
    const stepMs = Math.max(0, event.sinceStartMs - previousMs);
    previousMs = event.sinceStartMs;
    return {
      name: event.name,
      source: event.source ?? null,
      sinceStartMs: event.sinceStartMs,
      stepMs,
      key: KEY_STARTUP_MILESTONES.includes(event.name),
      details: event.details ?? {},
    };
  });

  const milestoneMs = {};
  for (const entry of timeline) {
    if (entry.key && milestoneMs[entry.name] === undefined) {
      milestoneMs[entry.name] = entry.sinceStartMs;
    }
  }

  return { timeline, milestoneMs };
};

export const summarizeStreams = (sseProxy = {}) => {
  const recent = Array.isArray(sseProxy.recent) ? sseProxy.recent : [];
  const streams = recent.map((stream) => {
    const delivered = Number.isFinite(stream.firstChunkLatencyMs) ? stream.firstChunkLatencyMs : null;
    const upstream = Number.isFinite(stream.upstreamFirstChunkLatencyMs) ? stream.upstreamFirstChunkLatencyMs : null;
    return {
      requestPath: stream.requestPath ?? null,
      reason: stream.reason ?? null,
      durationMs: stream.durationMs ?? null,
      deliveredFirstChunkMs: delivered,
      upstreamFirstChunkMs: upstream,
      // Time the desktop added before the first chunk reached the client:
      // proxy handling plus the upstream connection setup.
      pipelineOverheadMs: delivered !== null && upstream !== null ? Math.max(0, delivered - upstream) : null,
      backpressureWaitCount: stream.backpressureWaitCount ?? 0,
      backpressureWaitMs: stream.backpressureWaitMs ?? 0,
    };
  });

  const overheadSamples = streams.map((s) => s.pipelineOverheadMs).filter((v) => v !== null);

  return {
    totals: sseProxy.totals ?? {},
    activeStreams: sseProxy.active ?? 0,
    streams,
    overhead: {
      samples: overheadSamples.length,
      medianMs: median(overheadSamples),
      maxMs: overheadSamples.length > 0 ? Math.max(...overheadSamples) : null,
    },
  };
};

export const buildVerdicts = ({ health = {}, startup = {}, streaming = {} }) => {
  const verdicts = [];
  const compatibility = health.axCodeVersionCompatibility;
  if (compatibility?.compatible === false) {
    verdicts.push(
      `ax-code runtime ${compatibility.version} is below the minimum supported ` +
      `${compatibility.minSupportedVersion} — upgrade before chasing performance issues.`
    );
  }

  const launchedMs = startup.milestoneMs?.['ax-code.process.launched'];
  const readyMs = startup.milestoneMs?.['web.server.ready'];
  if (Number.isFinite(launchedMs) && Number.isFinite(readyMs)) {
    const backendStartupMs = Math.max(0, readyMs - launchedMs);
    if (backendStartupMs > SLOW_BACKEND_STARTUP_THRESHOLD_MS) {
      verdicts.push(
        `Backend startup took ${Math.round(backendStartupMs)}ms from launch to ready — ` +
        'startup, not the transport, dominates first-use slowness.'
      );
    }
  }

  const { medianMs, maxMs, samples } = streaming.overhead ?? {};
  if (samples > 0) {
    if (medianMs !== null && medianMs < PIPELINE_OVERHEAD_THRESHOLD_MS) {
      verdicts.push(
        `Desktop streaming pipeline adds a median of ${Math.round(medianMs)}ms before the first chunk ` +
        `(max ${Math.round(maxMs)}ms over ${samples} streams) — the proxy/SSE pipeline is NOT the bottleneck; ` +
        'a gRPC transport migration would not improve this.'
      );
    } else if (medianMs !== null) {
      verdicts.push(
        `Desktop streaming pipeline adds a median of ${Math.round(medianMs)}ms before the first chunk ` +
        `(max ${Math.round(maxMs)}ms over ${samples} streams) — investigate the proxy path before blaming providers.`
      );
    }
  } else {
    verdicts.push('No completed SSE streams recorded yet — run a session first, then re-run this report.');
  }

  const backpressureWaits = streaming.totals?.backpressureWaits ?? 0;
  if (backpressureWaits > 0) {
    verdicts.push(
      `${backpressureWaits} backpressure wait(s) recorded — the consumer (renderer or network) ` +
      'is reading slower than the backend produces; look at renderer rendering cost, not the transport.'
    );
  }

  const upstreamErrors = streaming.totals?.upstreamErrors ?? 0;
  if (upstreamErrors > 0) {
    verdicts.push(`${upstreamErrors} upstream stream error(s) recorded — check ax-code backend stability.`);
  }

  return verdicts;
};

export const buildReport = ({ health = {}, diagnostics = {} }) => {
  const startup = summarizeStartupTimeline(diagnostics.events);
  const streaming = summarizeStreams(diagnostics.sseProxy);
  return {
    generatedAt: new Date().toISOString(),
    bootId: diagnostics.bootId ?? null,
    health: {
      axCodeRunning: health.axCodeRunning ?? null,
      isAxCodeReady: health.isAxCodeReady ?? null,
      axCodeVersion: health.axCodeVersion ?? null,
      axCodeVersionCompatibility: health.axCodeVersionCompatibility ?? null,
      axCodeBinarySource: health.axCodeBinarySource ?? null,
      lastAxCodeError: health.lastAxCodeError ?? null,
    },
    startup,
    streaming,
    verdicts: buildVerdicts({ health, startup, streaming }),
  };
};

const formatMs = (value) => (Number.isFinite(value) ? `${Math.round(value)}ms` : 'n/a');

export const formatReport = (report) => {
  const lines = [];
  lines.push('AX Code Desktop — Performance Diagnostics Report');
  lines.push(`generated: ${report.generatedAt}  boot: ${report.bootId ?? 'unknown'}`);
  lines.push('');

  lines.push('## Runtime');
  lines.push(`  ax-code running: ${report.health.axCodeRunning}  ready: ${report.health.isAxCodeReady}`);
  lines.push(`  version: ${report.health.axCodeVersion ?? 'unknown'}` +
    (report.health.axCodeVersionCompatibility?.compatible === false
      ? `  (INCOMPATIBLE — min ${report.health.axCodeVersionCompatibility.minSupportedVersion})`
      : ''));
  if (report.health.lastAxCodeError) {
    lines.push(`  last error: ${report.health.lastAxCodeError}`);
  }
  lines.push('');

  lines.push('## Startup timeline (key milestones)');
  const keyEntries = report.startup.timeline.filter((entry) => entry.key);
  if (keyEntries.length === 0) {
    lines.push('  (no startup events recorded)');
  }
  for (const entry of keyEntries) {
    lines.push(`  ${String(entry.sinceStartMs).padStart(8)}ms  ${entry.name}`);
    if (entry.name === 'stream.first_token' && entry.details) {
      const delivered = entry.details.firstChunkLatencyMs;
      const upstream = entry.details.upstreamFirstChunkLatencyMs;
      lines.push(`            first token: delivered ${formatMs(delivered)}, upstream ${formatMs(upstream)}`);
    }
  }
  lines.push('');

  lines.push('## Streaming pipeline');
  const t = report.streaming.totals;
  lines.push(`  streams: ${t.started ?? 0} started, ${t.completed ?? 0} completed, ` +
    `${t.clientDisconnects ?? 0} client disconnects, ${t.upstreamErrors ?? 0} upstream errors, ` +
    `${report.streaming.activeStreams} active`);
  lines.push(`  pipeline overhead before first chunk: median ${formatMs(report.streaming.overhead.medianMs)}, ` +
    `max ${formatMs(report.streaming.overhead.maxMs)} (${report.streaming.overhead.samples} samples)`);
  lines.push(`  backpressure waits: ${t.backpressureWaits ?? 0}`);
  for (const stream of report.streaming.streams.slice(-10)) {
    lines.push(`    ${stream.requestPath ?? '?'}  delivered=${formatMs(stream.deliveredFirstChunkMs)} ` +
      `upstream=${formatMs(stream.upstreamFirstChunkMs)} overhead=${formatMs(stream.pipelineOverheadMs)} ` +
      `duration=${formatMs(stream.durationMs)} (${stream.reason ?? '?'})`);
  }
  lines.push('');

  lines.push('## Verdicts');
  for (const verdict of report.verdicts) {
    lines.push(`  - ${verdict}`);
  }

  return lines.join('\n');
};

export const parseArgs = (argv = []) => {
  const options = { baseUrl: DEFAULT_BASE_URL, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--url' && argv[index + 1]) {
      options.baseUrl = argv[index + 1].replace(/\/+$/, '');
      index += 1;
    } else if (arg === '--port' && argv[index + 1]) {
      options.baseUrl = `http://localhost:${argv[index + 1]}`;
      index += 1;
    }
  }
  return options;
};

const fetchJson = async (url) => {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status} ${response.statusText}`);
  }
  return response.json();
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  let health;
  let diagnostics;
  try {
    [health, diagnostics] = await Promise.all([
      fetchJson(`${options.baseUrl}/health`),
      fetchJson(`${options.baseUrl}/api/desktop/diagnostics/startup`),
    ]);
  } catch (error) {
    console.error(`Failed to reach AX Code Desktop at ${options.baseUrl}: ${error.message}`);
    console.error('Make sure the desktop app (or `bun run dev`) is running, or pass --url/--port.');
    process.exit(1);
  }

  const report = buildReport({ health, diagnostics });
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReport(report));
  }
};

const { pathToFileURL } = await import('node:url');
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  await main();
}
