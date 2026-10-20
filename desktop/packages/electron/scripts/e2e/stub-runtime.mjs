import fs from "node:fs/promises"
import path from "node:path"
import { E2E_STEP_ROUTE } from "./scenario.mjs"

// A stand-in for `ax-code serve` so the harness boots the real renderer without
// sessions, models or credentials. List-shaped routes answer with empty arrays
// so the UI renders its empty states instead of failing on an object.
//
// With a scenario (SPEC-2026-10-19-desktop-e2e-journeys-v1) the stub serves one
// scripted session, its pending permission requests and its goal through the
// same routes, records permission replies to a JSON-lines file, and emits the
// scenario steps on the event stream. The scenario path and the reply-log path
// reach the stub through its environment; without them nothing changes.
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

export const STUB_SCENARIO_ENV = "AX_CODE_DESKTOP_E2E_SCENARIO_PATH"
export const STUB_REPLIES_ENV = "AX_CODE_DESKTOP_E2E_REPLIES_PATH"

export const buildStubRuntimeScript = ({ version = "0.0.0-e2e" } = {}) => `#!/usr/bin/env node
const http = require('node:http');
const fs = require('node:fs');
const nodePath = require('node:path');
const LIST_ROUTES = new Set(${JSON.stringify(STUB_LIST_ROUTES)});
const OBJECT_ROUTES = ${JSON.stringify(STUB_OBJECT_ROUTES)};
const STEP_ROUTE = ${JSON.stringify(E2E_STEP_ROUTE)};
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
const scenarioPath = process.env[${JSON.stringify(STUB_SCENARIO_ENV)}] || '';
// The stub writes only inside the launch temp dir, which is the directory
// holding the scenario file. Paths outside it are ignored, never followed.
const scenarioDir = scenarioPath ? nodePath.dirname(nodePath.resolve(scenarioPath)) : '';
const isInsideScenarioDir = (candidate) => {
  if (typeof candidate !== 'string' || !candidate || !scenarioDir) return false;
  const relative = nodePath.relative(scenarioDir, nodePath.resolve(candidate));
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + nodePath.sep) && !nodePath.isAbsolute(relative);
};
const rawRepliesPath = process.env[${JSON.stringify(STUB_REPLIES_ENV)}] || '';
const repliesPath = isInsideScenarioDir(rawRepliesPath) ? rawRepliesPath : '';
let scenario = null;
try {
  scenario = scenarioPath ? JSON.parse(fs.readFileSync(scenarioPath, 'utf8')) : null;
} catch {
  scenario = null;
}
const pending = scenario && scenario.approveRequest ? [scenario.approveRequest] : [];
let currentGoal = null;
let foreignGoalEmitted = false;
let scheduledFixture = [];
const eventClients = new Set();
const sendEvent = (res, directory, payload) => {
  try {
    res.write('data: ' + JSON.stringify({ directory: directory, payload: payload }) + '\\n\\n');
  } catch {}
};
const broadcast = (directory, payload) => {
  for (const client of eventClients) sendEvent(client, directory, payload);
};
const readBody = (req, done) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    let parsed = {};
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {}
    done(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {});
  });
  req.on('error', () => done({}));
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
    if (scenario) {
      eventClients.add(res);
      for (const entry of pending) {
        sendEvent(res, scenario.projectDirectory, { type: 'permission.asked', properties: entry });
      }
    }
    const timer = setInterval(() => res.write(': keepalive\\n\\n'), 10000);
    req.on('close', () => {
      clearInterval(timer);
      eventClients.delete(res);
    });
    return;
  }
  if (scenario) {
    const directory = scenario.projectDirectory;
    if (pathname === '/__e2e__/scheduled-tasks' && req.method === 'POST') {
      readBody(req, (body) => {
        scheduledFixture = Array.isArray(body.tasks) ? body.tasks : [];
        json(res, { count: scheduledFixture.length });
      });
      return;
    }
    if (pathname === '/scheduled-task' && req.method === 'GET') {
      const scope = url.searchParams.get('directory') || req.headers['x-ax-code-directory'] || '';
      json(res, scope === directory ? scheduledFixture.map(entry => entry.task) : []);
      return;
    }
    const historyMatch = pathname.match(/^\\/scheduled-task\\/([^/]+)\\/runs$/);
    if (historyMatch && req.method === 'GET') {
      const scope = url.searchParams.get('directory') || req.headers['x-ax-code-directory'] || '';
      const entry = scope === directory ? scheduledFixture.find(entry => entry.task.id === historyMatch[1]) : null;
      json(res, entry ? entry.history : []);
      return;
    }
    if (pathname === STEP_ROUTE && req.method === 'POST') {
      readBody(req, (body) => {
        const step = typeof body.step === 'string' ? body.step : '';
        if (step === 'reset') {
          const cleared = pending.splice(0, pending.length);
          for (const entry of cleared) {
            broadcast(directory, {
              type: 'permission.replied',
              properties: { sessionID: entry.sessionID, requestID: entry.id, reply: '' },
            });
          }
          if (currentGoal) {
            broadcast(directory, {
              type: 'session.goal',
              properties: { sessionID: scenario.session.id, goal: null },
            });
          }
          if (foreignGoalEmitted && scenario.foreignGoal) {
            broadcast(directory, {
              type: 'session.goal',
              properties: { sessionID: scenario.foreignGoal.sessionID, goal: null },
            });
          }
          currentGoal = null;
          foreignGoalEmitted = false;
          json(res, { ok: true, step: step });
          return;
        }
        if (step === 'approve' || step === 'deny') {
          const request = step === 'approve' ? scenario.approveRequest : scenario.denyRequest;
          if (request && !pending.some((entry) => entry.id === request.id)) {
            pending.push(request);
            broadcast(directory, { type: 'permission.asked', properties: request });
          }
          json(res, { ok: true, step: step });
          return;
        }
        if (step === 'goal') {
          currentGoal = scenario.goal;
          broadcast(directory, { type: 'session.goal', properties: { sessionID: scenario.session.id, goal: scenario.goal } });
          json(res, { ok: true, step: step });
          return;
        }
        if (step === 'foreign-goal') {
          if (scenario.foreignGoal) {
            foreignGoalEmitted = true;
            broadcast(directory, {
              type: 'session.goal',
              properties: { sessionID: scenario.foreignGoal.sessionID, goal: scenario.foreignGoal },
            });
          }
          json(res, { ok: true, step: step });
          return;
        }
        if (step === 'goal-revision') {
          currentGoal = scenario.updatedGoal || scenario.goal;
          broadcast(directory, {
            type: 'session.goal',
            properties: { sessionID: scenario.session.id, goal: currentGoal },
          });
          json(res, { ok: true, step: step });
          return;
        }
        res.statusCode = 400;
        json(res, { error: 'unknown e2e step' });
      });
      return;
    }
    if (pathname === '/session' || pathname === '/experimental/session') {
      const requestedDirectory = url.searchParams.get('directory');
      if ((requestedDirectory && requestedDirectory !== directory) || url.searchParams.get('archived') === 'true') {
        json(res, []);
        return;
      }
      json(res, [scenario.session]);
      return;
    }
    if (pathname === '/project') {
      json(res, [scenario.project]);
      return;
    }
    if (pathname === '/project/current') {
      json(res, scenario.project);
      return;
    }
    if (pathname === '/permission' && req.method === 'GET') {
      // The real runtime keeps pending permissions per directory instance. An answer that ignores the requested
      // directory hands the scripted request to every project the app bootstraps, so a reply is then sent with the
      // wrong project's directory.
      const requestedPermissionDirectory = url.searchParams.get('directory') || req.headers['x-ax-code-directory'] || '';
      json(res, requestedPermissionDirectory && requestedPermissionDirectory !== directory ? [] : pending.slice());
      return;
    }
    const replyMatch = pathname.match(/^\\/permission\\/([^/]+)\\/reply$/);
    if (replyMatch && req.method === 'POST') {
      readBody(req, (body) => {
        const requestID = decodeURIComponent(replyMatch[1]);
        const headerDirectory = req.headers['x-ax-code-directory'] || req.headers['x-opencode-directory'] || '';
        let incomingDirectory = url.searchParams.get('directory') || headerDirectory || null;
        if (incomingDirectory) {
          try {
            incomingDirectory = decodeURIComponent(incomingDirectory);
          } catch {}
        }
        const index = pending.findIndex((entry) => entry.id === requestID);
        const accepted = index !== -1;
        const record = { requestID: requestID, reply: typeof body.reply === 'string' ? body.reply : '' };
        if (typeof body.message === 'string' && body.message) record.message = body.message;
        record.directory = incomingDirectory;
        record.effectiveDirectory = incomingDirectory || directory;
        record.accepted = accepted;
        if (repliesPath) {
          try {
            fs.appendFileSync(repliesPath, JSON.stringify(record) + '\\n');
          } catch {}
        }
        if (!accepted) {
          res.statusCode = 404;
          json(res, { error: 'unknown permission request' });
          return;
        }
        const request = pending[index];
        pending.splice(index, 1);
        broadcast(directory, {
          type: 'permission.replied',
          properties: { sessionID: request.sessionID, requestID: requestID, reply: record.reply },
        });
        json(res, true);
      });
      return;
    }
    const goalMatch = pathname.match(/^\\/session\\/([^/]+)\\/goal$/);
    if (goalMatch && req.method === 'GET') {
      const goalSessionID = decodeURIComponent(goalMatch[1]);
      if (goalSessionID === scenario.session.id) {
        json(res, currentGoal);
        return;
      }
      json(res, foreignGoalEmitted && scenario.foreignGoal && goalSessionID === scenario.foreignGoal.sessionID ? scenario.foreignGoal : null);
      return;
    }
    if (pathname === '/path' && url.searchParams.get('directory') === directory) {
      json(res, Object.assign({}, OBJECT_ROUTES['/path'], { directory: directory, worktree: directory }));
      return;
    }
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
  if (scenario && isInsideScenarioDir(scenario.originFile)) {
    try {
      fs.writeFileSync(scenario.originFile, 'http://' + hostname + ':' + port);
    } catch {}
  }
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
