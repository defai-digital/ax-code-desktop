# SPEC: Desktop and Portfolio Process Model

| Field   | Value                                            |
| ------- | ------------------------------------------------ |
| Status  | Accepted implementation contract                 |
| Related | Active PRD; ADR-005; AX Code ADR-063 and ADR-067 |

## 1. Extraction release

The first independent Desktop build preserves AX Code ADR-063's process model. Electron main is the sole supervisor of
the bundled AX Code runtime. The renderer consumes authenticated browser-safe contracts. No independent portfolio
daemon, model loop, or second general web proxy is introduced during source extraction.

Closing a renderer window may not corrupt runtime state. Electron main checkpoints and drains its owned child lifecycle
before controlled shutdown. Existing web compatibility behavior remains until the accepted process-collapse work is
complete and independently tested.

## 2. Portfolio phase

Phase 5 may add one separately managed loopback portfolio service. It owns only AX Coder product state: project
registration, desired state, projections, cursors, exceptions, budgets, and product leases. It does not supervise or
proxy AX Code runtime traffic already owned by Electron main, execute coding tools, or become a domain-neutral agent
runtime.

The service persists before acknowledgment, uses a versioned authenticated interface, resumes from durable cursors,
and remains correct when no renderer window is open. Renderer processes are untrusted presentation clients.

## 3. Lifecycle states

Both runtime and future portfolio-service lifecycles expose explicit states:

```text
stopped -> starting -> healthy -> degraded -> restarting -> failed
```

Transitions carry bounded reasons, timestamps, attempt counters, and next-action hints. Unknown or exhausted restart
outcomes fail closed and require operator action.

## 4. Invariants

- One Electron main process owns each active Desktop runtime child.
- One project-manager lease may exist per project, but manager execution is disabled until ADR-007 is revisited.
- Credentials remain in privileged host boundaries and never enter renderer state.
- Process restart cannot acknowledge duplicate dispatch or silently drop persisted decisions.
- A ten-minute reconciliation sweep never implies a ten-minute model wake.

## 5. Verification

Test renderer reload, all-window close behavior, app quit, runtime crash/restart/exhaustion, system sleep/resume, service
crash checkpoints, stale owner fencing, credential redaction, and updater-triggered restart. The portfolio service is not
enabled in a release until these tests exist on every supported platform.
