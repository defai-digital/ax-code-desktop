# AX Code Desktop 7.28.6 integration

The user explicitly requested integration of every branch/worktree, cleanup, Grok CLI and Claude Code CLI bug review, fixes, testing, commit, and publication as v7.28.6. Initial inventory found only main and one worktree in Desktop and the AX Code runtime, with no stashes. Five existing Desktop commits and the user's uncommitted archive/test/agent guidance changes were preserved. No unrelated branch, worktree, conversation, or user data was removed.

The candidate includes the existing login-shell PATH repair and external-CLI default exclusion; independent project sandbox requests; decision-only Needs you and quiet follow-up; error supersession and grouped request toasts; changed-file attribution and deduplicated request badges. It also includes the previously committed Mermaid transitive DOMPurify 3.4.17 hardening, which was absent from the immutable v7.28.5 release.

Reproduced review findings were corrected before qualification:

- Archive Undo uses actual successful request IDs rather than inferring success from the active session list. A one-shot action generation prevents an older Undo from reversing a subsequent archive. Undo waits for a slow archive, and an event arriving before acknowledgement remains accepted because pending flags are released first.
- Isolation reads/writes require an explicit nonblank directory. Writes serialize per normalized directory without blocking other projects. A late write completion re-reads the server after a UI deadline, including when the first deadline read saw the old value.
- Relative file names match exactly. Absolute summaries require the canonical worktree root returned by Git status, avoiding suffix matches against unrelated dirty files. Runtime snapshot and Git status paths are both worktree-relative, including requests from nested directories.

Grok CLI and Claude Code CLI review artifacts, before/after regression logs, source hashes, and exact-source release receipts are retained under `.internal/releases/v7.28.6-operator/` and `.internal/releases/v7.28.6-evidence/`. Review claims are leads, not qualification. Source-disproved and non-blocking leads are recorded with their disposition in the release inventory.

Only Desktop's version changes to 7.28.6. The signed AX Code runtime 7.28.5 and published SDK 2.6.46 remain pinned together. Native install, upgrade, rollback, profile/configuration continuity, signed artifact inventory, hosted checks, and independent public readback must qualify this candidate before publication. A separate publication report records the actual final outcomes.

The first fully tested/signed candidate ab4b699eeaf5de319a0a4c3803f97fe8e6f872e4 was superseded before publication after the final gate found that CodeQL alerts 176 and 177 classified intentional Promise identity comparisons as missing await. Both operations already awaited their results. Registry entries now wrap each Promise in an explicit operation record, preserving ownership fencing without comparing Promise values. No alert is dismissed or suppressed. The descendant requires new exact-source local, hosted, signed/native and companion-review evidence; predecessor receipts do not qualify it.
