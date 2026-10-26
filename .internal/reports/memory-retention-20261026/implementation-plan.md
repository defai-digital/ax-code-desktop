# Memory retention implementation plan

Status: implemented and verified; see implementation-results.md for test and native evidence. Scope: Desktop renderer working-set retention; no canonical runtime history changes.

1. Introduce one scheduled directory-content sweep owned by ChildStoreManager. Observe every store writer, coalesce work outside streaming deltas, and enforce session count, background history window, estimated content bytes and idle expiry. Protect viewed conversations, active/incomplete runs, unresolved permissions/questions and loads. Dispose subscriptions/timers with the directory. Clear dependent pagination, prefetch, projection and routing state when content is removed; prevent late requests from restoring evicted content.
2. Bound Git directory snapshots and metadata across project switches and async writes, retaining the active directory and rejecting superseded late responses. Bound snippets snapshots and timestamps and use request identity rather than accumulating invalidation epochs.
3. Make diagnostics report the enforced sync working set, including protected overflow, rather than unrelated legacy limits. Keep existing user-facing message keys where possible.
4. Add failing regression tests before each fix: completed background sessions, long background history and refetch, payload budgets, protected/viewed/load safety, cleanup, late responses, Git churn and snippets churn/failure.
5. Run focused regressions, type-check and full required root gates. Build and verify the isolated WebMCP app with fresh rendered state/screenshots. Exercise repeated memory workloads with matched collection checkpoints where available and record limits of the evidence.
6. Review the final diff, record verification and remaining intentional protected working-set exceptions, and commit the complete scoped change. Do not publish or release.

Initial budgets reuse the existing 40-session and 150-message page conventions, with a 20 MiB estimated content budget per directory and 20-minute idle expiry. Estimates describe retained payload content, not process RSS. Protected data is an explicit soft-budget exception. Real workloads may justify future tuning; safety invariants take precedence over a hard cap that would hide a running task or approval.
