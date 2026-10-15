# Scheduled task convergence module

S2.6 (SPEC-2026-08-29-desktop-process-model-collapse §2 D6): deletes the
desktop scheduled-tasks engine and converges on the ax-code runtime's
`/scheduled-task` routes.

## Scope

- The retired desktop engine (`lib/scheduled-tasks/`) is gone. The runtime
  owns scheduling, execution, catch-up, overlap protection, and run history.
- This module owns the one-time storage migration and the per-boot scheduler
  wake-up. It is desktop-web feature glue, not runtime code.

## Files

- `transform.js`
  - Pure desktop-task → runtime-create-payload transform.
  - Multi-time / multi-weekday fan-out into N runtime tasks (`name (i/N)`
    suffixes) — the runtime supports a single time/weekday per task.
  - Runtime cron-subset guard (mirror of the runtime parser).
  - Skip decisions: unsupported cron, slash-command prompts, fired one-shots,
    oversized prompts.
  - KEEP IN SYNC with `desktop/packages/ui/src/lib/scheduledTaskTransform.ts`.

- `convergence.js`
  - `createScheduledTaskConvergence(deps)` → `{ start, migrate, wakeUp }`.
  - `start()` waits for runtime readiness, runs the marker-gated migration,
    then wakes every registered project directory with one
    `GET /scheduled-task?directory=<path>` (the runtime starts an instance's
    scheduler loop on the first directory-scoped request).
  - `startWakeWatch({ getRuntimeIdentity, isActive, initialDirectories })`
    keeps schedulers awake after boot: it re-wakes every directory when the
    runtime identity changes (restart generation, respawned process, or new
    origin; `index.js` builds it), wakes newly registered projects (project
    list read at most every 60 s), retries failed wakes, and re-wakes all
    directories every 5 min to cover external runtime restarts it cannot
    observe (the refresh also runs while readiness is unknown). After an
    identity change it wakes once more a minute later, and it adopts an
    identity only if it held for the whole pass. `index.js` passes the boot
    wake's directories as `initialDirectories` only when no restart happened
    during it. Starting a new watch stops the previous one; graceful shutdown
    calls `stopWakeWatch()`.
  - Migration is idempotent (title-match against existing runtime tasks) and
    writes `scheduled-tasks-migrated.json` next to the projects dir with the
    skip/warning report. Only confirmed tasks are removed from the project
    JSON; the `scheduledTasks` key is deleted once nothing remains.

## Related

- Task JSON persistence: `lib/projects/project-config.js`
  (`replaceScheduledTasks` is the migration write path).
- Time helpers: `lib/projects/scheduled-task-time.js`.
