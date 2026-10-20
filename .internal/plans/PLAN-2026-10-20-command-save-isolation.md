# Command editor save isolation

Status: implementation plan for the existing Settings and parallel-project quality requirements.

A delayed command save can complete after the user switches projects. Command names are not unique across projects, and returning to a previous project creates a new editing context. Completion must update only the form instance that submitted the operation. A successful create must not clear or select a different draft. Same-form edits made while saving must survive.

1. Reproduce delayed completion across same-name commands in different projects and an away-and-back transition with mounted component tests.
2. Track form generations and reject stale completion effects, including creation selection changes.
3. Retain same-form editing behavior; verify focused tests and type checking.
4. Run the native WebMCP Settings audit and inspect screenshots. This audit covers rendered navigation and controls; the controlled timing regression is component evidence, not a native cross-project race reproduction.
5. Record evidence and commit only scoped files.

A second mounted regression confirms that successful unchanged saves leave Save enabled because dirty state was memoized only by field values. Recompute the inexpensive field comparison on each render so the completed save updates the button immediately.
