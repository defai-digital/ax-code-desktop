import fs from "node:fs/promises"
import path from "node:path"

// A stand-in for `ax-code serve` so the harness boots the real renderer without
// sessions, models or credentials. List-shaped routes answer with empty arrays
// so the UI renders its empty states instead of failing on an object.
export const STUB_LIST_ROUTES = [
  "/agent",
  "/command",
  "/session",
  "/experimental/session",
  "/project",
  "/mcp",
  "/lsp",
  "/formatter",
  "/permission",
  "/question",
  "/scheduled-task",
  "/skill",
  "/find/file",
  "/find/symbol",
  "/file/status",
]

export const STUB_OBJECT_ROUTES = {
  "/config": {},
  "/config/providers": { providers: [], default: {} },
  "/provider": { all: [], default: {}, connected: [] },
  "/path": { home: "/tmp", state: "/tmp", config: "/tmp", worktree: "/tmp", directory: "/tmp" },
}

export const buildStubRuntimeScript = ({ version = "0.0.0-e2e" } = {}) => `#!/usr/bin/env node
const http = require('node:http');
const LIST_ROUTES = new Set(${JSON.stringify(STUB_LIST_ROUTES)});
const OBJECT_ROUTES = ${JSON.stringify(STUB_OBJECT_ROUTES)};
const args = process.argv.slice(2);
if (args[0] !== 'serve') {
  console.error('stub ax-code only supports serve');
  process.exit(2);
}
const valueAfter = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : (args[index + 1] || fallback);
};
const hostname = valueAfter('--hostname', '127.0.0.1');
const requestedPort = Number.parseInt(valueAfter('--port', '0'), 10) || 0;
const json = (res, body) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = url.pathname.replace(/\\/+$/, '') || '/';
  if (pathname === '/global/health' || pathname === '/health') {
    json(res, { healthy: true, version: ${JSON.stringify(String(version))} });
    return;
  }
  if (pathname === '/global/event' || pathname === '/event') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write('data: {"type":"server.connected","properties":{}}\\n\\n');
    const timer = setInterval(() => res.write(': keepalive\\n\\n'), 10000);
    req.on('close', () => clearInterval(timer));
    return;
  }
  if (Object.prototype.hasOwnProperty.call(OBJECT_ROUTES, pathname)) {
    json(res, OBJECT_ROUTES[pathname]);
    return;
  }
  if (LIST_ROUTES.has(pathname)) {
    json(res, []);
    return;
  }
  json(res, {});
});
server.listen(requestedPort, hostname, () => {
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : requestedPort;
  console.log('ax-code server listening on http://' + hostname + ':' + port);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
`

export const writeStubRuntime = async (dir, { version } = {}) => {
  const stubPath = path.join(dir, "ax-code")
  await fs.writeFile(stubPath, buildStubRuntimeScript({ version }), { mode: 0o755 })
  return stubPath
}
