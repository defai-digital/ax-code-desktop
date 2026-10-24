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

export const STUB_REVIEW_DIFFS = [
  {
    file: "session/overview.txt",
    before: "Original session overview\n",
    after: "Revised session overview\n",
    additions: 1,
    deletions: 1,
    status: "modified",
  },
  {
    file: "session/last-turn.txt",
    before: "Original last turn\n",
    after: "Revised last turn\n",
    additions: 1,
    deletions: 1,
    status: "modified",
  },
]

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
let portfolioGoalsActive = false;
let reviewScopesActive = false;
const reviewDiffs = ${JSON.stringify(STUB_REVIEW_DIFFS)};
const portfolio = scenario && Array.isArray(scenario.portfolio) ? scenario.portfolio : [];
let scheduledFixture = [];
let scheduledWrites = [];
const createdSessions = [];
let scheduledCreateAttempts = 0;
let scheduledFailCreateAt = 0;
let scheduledFixtureModel = false;
let scheduledFailAfterWrite = false;
let hooksFixture = null;
let hooksReads = [];
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
const canonDirectory = (value) => String(value || '').replace(/\\\\/g, '/').replace(/^([a-z]):/, (_, letter) => letter.toUpperCase() + ':').replace(/(.)\\/+$/, '$1');
const browserProviders = new Map();
const browserReplies = [];
let browserProviderSequence = 0;
let browserTaskSequence = 0;
const nextTaskMessageID = () => 'msg_zz_task_' + String(++browserTaskSequence).padStart(8, '0');
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
    // Windows sends C:/Work/Repo while fixtures use C:\Work\Repo: compare one canonical spelling.
    const scopedDirectory = canonDirectory(url.searchParams.get('directory') || req.headers['x-ax-code-directory'] || '');
    const sessions = [scenario.session, ...portfolio.map(entry => entry.session), ...createdSessions];
    // Native project-browser journey: provider enrollment without a model or agent calls.
    if (pathname === '/desktop/browser/capability') {
      json(res, { capability: 'desktop.webmcp.v1', browserMode: 'embedded' });
      return;
    }
    if (pathname === '/desktop/browser/provider' && req.method === 'POST') {
      readBody(req, body => {
        const selected = sessions.find(item => item.id === body.sessionID && canonDirectory(item.directory) === scopedDirectory);
        if (!selected) { res.statusCode = 404; json(res, { error: 'Unknown browser session' }); return; }
        const providerID = 'e2e-browser-' + (++browserProviderSequence);
        const connection = { providerID, epoch: 'e2e', projectID: selected.projectID };
        browserProviders.set(providerID, { ...connection, sessionID: selected.id, state: body.snapshot, queue: [] });
        json(res, connection);
      });
      return;
    }
    // Scripted page-tool tasks: approval gates the real native provider request.
    if (pathname === '/__e2e__/browser-task' && req.method === 'POST') {
      readBody(req, body => {
        const provider = [...browserProviders.values()].find(item => item.sessionID === body.sessionID);
        if (!provider || !scenario.portfolioMessages) { res.statusCode = 404; json(res, { error: 'No scripted provider' }); return; }
        if (body.newTurn) {
          const user = { info: { ...scenario.portfolioMessages[body.sessionID][0].info,
            id: nextTaskMessageID(), time: { created: Date.now() } }, parts: [] };
          scenario.portfolioMessages[body.sessionID].push(user);
          broadcast(directory, { type: 'message.updated', properties: { info: user.info } });
        }
        const id = body.requestID;
        const messageID = nextTaskMessageID();
        const metadata = { desktopProvider: true, operation: 'invoke', origin: provider.state.origin,
          toolName: body.toolName, definitionDigest: body.digest, generation: provider.state.generation,
          arguments: body.input || {} };
        const part = { id: 'part_' + id, sessionID: body.sessionID, messageID, type: 'tool',
          tool: 'desktop_webmcp', callID: id, state: { status: 'running',
            input: { action: 'invoke', toolName: body.toolName }, metadata, time: { start: Date.now() } } };
        const message = { info: { id: messageID, sessionID: body.sessionID, role: 'assistant',
          parentID: scenario.portfolioMessages[body.sessionID].findLast(item => item.info.role === 'user').info.id,
          time: { created: Date.now() }, modelID: 'fixture', providerID: 'fixture', mode: 'build', agent: 'build',
          path: { cwd: directory, root: directory }, cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }, parts: [part] };
        scenario.portfolioMessages[body.sessionID].push(message);
        const publish = () => {
          broadcast(directory, { type: 'message.updated', properties: { info: message.info } });
          broadcast(directory, { type: 'message.part.updated', properties: { part } });
        };
        const finish = (output) => {
          // Signed v7.28.2 receipts live only on permission metadata, not completed parts.
          if (body.approval) {
            const { definitionDigest: _digest, arguments: _arguments, ...completedMetadata } = part.state.metadata;
            part.state.metadata = completedMetadata;
          }
          // Native script tools return JSON strings; keep one JSON layer in the transcript.
          if (typeof output === 'string') { try { output = JSON.parse(output); } catch {} }
          part.state = { ...part.state, status: 'completed', output: JSON.stringify(output),
            title: body.toolName, time: { ...part.state.time, end: Date.now() } };
          message.info.time.completed = Date.now();
          publish();
          broadcast(directory, { type: 'session.idle', properties: { sessionID: body.sessionID } });
        };
        const enqueue = () => provider.queue.push({ providerID: provider.providerID, epoch: provider.epoch,
          projectID: provider.projectID, sessionID: body.sessionID, requestID: id, operation: 'invoke',
          generation: provider.state.generation, origin: provider.state.origin, frameId: provider.state.frameId,
          toolName: body.toolName, digest: body.digest, input: body.input || {}, deadline: Date.now() + 15000 });
        provider.tasks ||= new Map();
        provider.tasks.set(id, finish);
        publish();
        if (body.approval) {
          const request = { id: 'perm_' + id, sessionID: body.sessionID, permission: 'webmcp',
            patterns: [provider.state.origin], always: [], metadata: { ...metadata, arguments: undefined, inputPreview: JSON.stringify(body.input || {}) },
            tool: { messageID, callID: id } };
          request.enqueue = enqueue;
          pending.push(request);
          broadcast(directory, { type: 'permission.asked', properties: request });
          if (body.expireMs) setTimeout(() => {
            const index = pending.indexOf(request);
            if (index < 0) return;
            pending.splice(index, 1);
            broadcast(directory, { type: 'permission.replied', properties: { sessionID: body.sessionID, requestID: request.id, reply: '' } });
            finish({ status: 'timeout', reason: 'timeout', error: 'Scripted approval expired without an answer' });
          }, body.expireMs);
        } else enqueue();
        json(res, { queued: true, partID: part.id });
      });
      return;
    }
    if (pathname === '/__e2e__/browser-test') {
      if (req.method === 'POST') readBody(req, body => {
        const provider = [...browserProviders.values()].find(item => item.sessionID === body.sessionID);
        if (!provider) { res.statusCode = 404; json(res, { error: 'No provider' }); return; }
        provider.queue.push({
          providerID: provider.providerID, epoch: provider.epoch, projectID: provider.projectID,
          sessionID: provider.sessionID, requestID: body.requestID, operation: 'read',
          generation: provider.state.generation, origin: provider.state.origin, frameId: provider.state.frameId,
          deadline: Date.now() + 30000,
        });
        json(res, { queued: true });
      });
      else json(res, { providers: [...browserProviders.values()].map(item => ({ sessionID: item.sessionID, providerID: item.providerID })), replies: browserReplies });
      return;
    }
    if (pathname.startsWith('/desktop/browser/provider/')) {
      const [, , , , providerID, operation] = pathname.split('/');
      if (!browserProviders.has(providerID)) { res.statusCode = 404; json(res, { error: 'Browser disconnected' }); return; }
      const provider = browserProviders.get(providerID);
      if (req.method === 'DELETE') browserProviders.delete(providerID);
      if (operation === 'state') { readBody(req, body => { provider.state = body; json(res, {}); }); return; }
      if (operation === 'reply') { readBody(req, body => { browserReplies.push({ sessionID: provider.sessionID, ...body }); provider.tasks?.get(body.requestID)?.(body.output ?? body); provider.tasks?.delete(body.requestID); json(res, {}); }); return; }
      if (operation === 'next') {
        const timer = setTimeout(() => json(res, { canceled: [], request: provider.queue.shift() }), 250);
        res.on('close', () => clearTimeout(timer));
      } else json(res, {});
      return;
    }

    const projects = [scenario.project, ...portfolio.map(entry => entry.project)];
    if (pathname === '/__e2e__/hooks' && req.method === 'POST') {
      readBody(req, (body) => {
        hooksFixture = Array.isArray(body.workspaces) ? body.workspaces : [];
        hooksReads = [];
        json(res, { count: hooksFixture.length });
      });
      return;
    }
    if (pathname === '/__e2e__/hooks' && req.method === 'GET') {
      json(res, { reads: hooksReads });
      return;
    }
    if (pathname === '/hooks' && req.method === 'GET' && hooksFixture !== null) {
      const entry = projects.some(project => canonDirectory(project.worktree) === scopedDirectory)
        ? hooksFixture.find(item => canonDirectory(item.directory) === scopedDirectory) : null;
      const read = { directory: scopedDirectory, status: entry ? (entry.status || 200) : 404, completed: false };
      hooksReads.push(read);
      const respond = () => {
        read.completed = true;
        res.statusCode = entry ? (entry.status || 200) : 404;
        json(res, entry ? entry.workspace : { error: 'no hooks fixture for directory' });
      };
      if (entry && entry.delayMs > 0) setTimeout(respond, entry.delayMs);
      else respond();
      return;
    }
    if (pathname === '/__e2e__/scheduled-tasks' && req.method === 'POST') {
      readBody(req, (body) => {
        scheduledFixture = Array.isArray(body.tasks) ? body.tasks : [];
        scheduledWrites = [];
        scheduledCreateAttempts = 0;
        scheduledFailCreateAt = body.failCreateAt || 0;
        scheduledFixtureModel = body.fixtureModel === true;
        scheduledFailAfterWrite = body.failAfterWrite === true;
        json(res, { count: scheduledFixture.length });
      });
      return;
    }
    if (pathname === '/__e2e__/scheduled-tasks' && req.method === 'GET') {
      json(res, { tasks: scheduledFixture, writes: scheduledWrites, createAttempts: scheduledCreateAttempts });
      return;
    }
    if (pathname === '/config/providers' && scheduledFixtureModel) {
      json(res, { providers: [{
        id: 'fixture', name: 'Fixture', models: {
          'fixture-model': { id: 'fixture-model', name: 'Fixture model', providerID: 'fixture',
            limit: { context: 131072, output: 16384 }, capabilities: { input: { text: true }, output: { text: true } } }
        }
      }], default: { fixture: 'fixture-model' } });
      return;
    }
    const scheduledScope = url.searchParams.get('directory') || req.headers['x-ax-code-directory'] || '';
    const updateMatch = pathname.match(/^\\/scheduled-task\\/([^/]+)\\/update$/);
    if ((pathname === '/scheduled-task' || updateMatch) && req.method === 'POST') {
      if (scheduledScope !== directory) {
        res.statusCode = 404;
        json(res, { message: 'Fixture project not found' });
        return;
      }
      readBody(req, (body) => {
        if (!updateMatch && ++scheduledCreateAttempts === scheduledFailCreateAt && !scheduledFailAfterWrite) {
          res.statusCode = 503;
          json(res, { message: 'Controlled create failure' });
          return;
        }
        const existing = updateMatch ? scheduledFixture.find(entry => entry.task.id === updateMatch[1]) : null;
        if (updateMatch && !existing) {
          res.statusCode = 404;
          json(res, { message: 'Fixture task not found' });
          return;
        }
        const fields = {};
        for (const key of ['title', 'prompt', 'schedule', 'status', 'model', 'agent', 'catchUpPolicy']) {
          if (Object.prototype.hasOwnProperty.call(body, key)) fields[key] = body[key];
        }
        const task = existing ? Object.assign(existing.task, fields) : {
          ...fields, id: 'st_created_' + scheduledFixture.length, directory,
          projectID: scenario.project.id, status: 'active', time: { created: Date.now() },
        };
        if (!existing) scheduledFixture.push({ task, history: [] });
        scheduledWrites.push({ operation: updateMatch ? 'update' : 'create', directory, taskID: task.id, fields });
        if (!updateMatch && scheduledCreateAttempts === scheduledFailCreateAt && scheduledFailAfterWrite) {
          res.statusCode = 503;
          json(res, { message: 'Controlled create failure' });
          return;
        }
        json(res, task);
      });
      return;
    }
    if (pathname === '/scheduled-task' && req.method === 'GET') {
      const scope = url.searchParams.get('directory') || req.headers['x-ax-code-directory'] || '';
      json(res, projects.some(project => project.worktree === scope) ? scheduledFixture
        .filter(entry => entry.task.directory === scope).map(entry => entry.task) : []);
      return;
    }
    const historyMatch = pathname.match(/^\\/scheduled-task\\/([^/]+)\\/runs$/);
    if (historyMatch && req.method === 'GET') {
      const scope = url.searchParams.get('directory') || req.headers['x-ax-code-directory'] || '';
      const entry = projects.some(project => project.worktree === scope) ? scheduledFixture
        .find(entry => entry.task.directory === scope && entry.task.id === historyMatch[1]) : null;
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
          if (portfolioGoalsActive) {
            for (const entry of portfolio) {
              broadcast(entry.session.directory, { type: 'session.goal', properties: { sessionID: entry.session.id, goal: null } });
            }
          }
          portfolioGoalsActive = false;
          reviewScopesActive = false;
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
        if (step === 'portfolio-goals') {
          currentGoal = scenario.goal;
          portfolioGoalsActive = true;
          broadcast(directory, { type: 'session.goal', properties: { sessionID: scenario.session.id, goal: currentGoal } });
          for (const entry of portfolio) {
            broadcast(entry.session.directory, { type: 'session.goal', properties: { sessionID: entry.session.id, goal: entry.goal } });
          }
          json(res, { ok: true, step: step });
          return;
        }
        if (step === 'review-scopes' && portfolio.length) {
          reviewScopesActive = true;
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
      if (req.method === 'POST') {
        readBody(req, (body) => {
          const sequence = createdSessions.length + 1;
          const created = {
            id: 'ses_e2e_created_' + sequence,
            slug: 'e2e-created-' + sequence,
            projectID: scenario.project.id,
            directory: scopedDirectory || directory,
            title: typeof body.title === 'string' && body.title.trim() ? body.title : 'E2E created session',
            version: '0.0.0-e2e',
            time: { created: Date.now(), updated: Date.now() },
          };
          createdSessions.push(created);
          json(res, created);
        });
        return;
      }
      json(res, url.searchParams.get('archived') === 'true' ? [] :
        sessions.filter(entry =>
          !scopedDirectory || canonDirectory(entry.directory) === scopedDirectory));
      return;
    }
    if (pathname === '/project') {
      json(res, projects);
      return;
    }
    if (pathname === '/project/current') {
      json(res, projects.find(entry => canonDirectory(entry.worktree) === scopedDirectory) || scenario.project);
      return;
    }
    if (pathname === '/session/status') {
      json(res, {});
      return;
    }
    const messagesMatch = pathname.match(/^\\/session\\/([^/]+)\\/message$/);
    if (messagesMatch && req.method === 'GET' && portfolio.length) {
      const sessionID = decodeURIComponent(messagesMatch[1]);
      const entry = sessions.find(item => item.id === sessionID && (!scopedDirectory || canonDirectory(item.directory) === scopedDirectory));
      res.statusCode = entry ? 200 : 404;
      const messages = scenario.portfolioMessages[sessionID] || [];
      const latestUser = reviewScopesActive ? messages.findLastIndex(message => message.info.role === 'user') : -1;
      json(res, entry ? messages.map((message, index) => index === latestUser ? {
        ...message, info: { ...message.info, summary: { ...message.info.summary, diffs: [reviewDiffs[1]] } },
      } : message) : { error: 'session not found in this directory' });
      return;
    }
    // One message, as the real runtime returns it: the stored user summary keeps before/after, which the app's
    // synced copy strips, so the "Last turn" review reads its content here.
    const messageMatch = pathname.match(/^\\/session\\/([^/]+)\\/message\\/([^/]+)$/);
    if (messageMatch && req.method === 'GET' && portfolio.length) {
      const sessionID = decodeURIComponent(messageMatch[1]);
      const messageID = decodeURIComponent(messageMatch[2]);
      const entry = sessions.find(item => item.id === sessionID && (!scopedDirectory || canonDirectory(item.directory) === scopedDirectory));
      const messages = scenario.portfolioMessages[sessionID] || [];
      const latestUser = reviewScopesActive ? messages.findLastIndex(message => message.info.role === 'user') : -1;
      const index = messages.findIndex(message => message.info.id === messageID);
      const found = entry && index >= 0 ? messages[index] : null;
      res.statusCode = found ? 200 : 404;
      json(res, found ? (index === latestUser ? {
        ...found, info: { ...found.info, summary: { ...found.info.summary, diffs: [reviewDiffs[1]] } },
      } : found) : { error: 'message not found in this directory' });
      return;
    }
    const diffMatch = pathname.match(/^\\/session\\/([^/]+)\\/diff$/);
    if (diffMatch && req.method === 'GET' && reviewScopesActive) {
      const entry = sessions.find(item => item.id === decodeURIComponent(diffMatch[1]));
      if (entry) {
        const inDirectory = !scopedDirectory || canonDirectory(entry.directory) === scopedDirectory;
        res.statusCode = inDirectory ? 200 : 404;
        json(res, inDirectory ? reviewDiffs : { error: 'session not found in this directory' });
        return;
      }
    }
    const sessionMatch = pathname.match(/^\\/session\\/([^/]+)$/);
    if (sessionMatch && req.method === 'GET') {
      const sessionID = decodeURIComponent(sessionMatch[1]);
      const entry = sessions.find(item => item.id === sessionID &&
        (!scopedDirectory || canonDirectory(item.directory) === scopedDirectory));
      res.statusCode = entry ? 200 : 404;
      json(res, entry || { error: 'session not found in this directory' });
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
        if (record.reply === 'once') request.enqueue?.();
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
      const portfolioEntry = portfolio.find(entry => entry.session.id === goalSessionID);
      if (portfolioEntry) {
        json(res, portfolioGoalsActive && (!scopedDirectory || canonDirectory(portfolioEntry.session.directory) === scopedDirectory) ? portfolioEntry.goal : null);
        return;
      }
      if (goalSessionID === scenario.session.id) {
        json(res, !scopedDirectory || scopedDirectory === canonDirectory(directory) ? currentGoal : null);
        return;
      }
      json(res, foreignGoalEmitted && scenario.foreignGoal && goalSessionID === scenario.foreignGoal.sessionID ? scenario.foreignGoal : null);
      return;
    }
    if (pathname === '/path' && projects.some(entry => canonDirectory(entry.worktree) === scopedDirectory)) {
      json(res, Object.assign({}, OBJECT_ROUTES['/path'], { directory: scopedDirectory, worktree: scopedDirectory }));
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

export const writeStubRuntime = async (dir, { version, platform = process.platform } = {}) => {
  const stubPath = path.join(dir, "ax-code")
  await fs.writeFile(stubPath, buildStubRuntimeScript({ version }), { mode: 0o755 })
  if (platform !== "win32") return stubPath
  // Windows cannot run a shebang script; the runtime supervisor launches .cmd files, so give it one that runs this Node.
  const launcherPath = path.join(dir, "ax-code.cmd")
  await fs.writeFile(launcherPath, `@echo off\r\n"${process.execPath}" "%~dp0ax-code" %*\r\n`)
  return launcherPath
}
