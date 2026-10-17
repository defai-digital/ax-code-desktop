# Explicit synchronization for reconnect and terminal restart tests

A local full run while build checks were active exposed two existing scheduling-dependent regressions: the stalled-stream watcher asserted after a fixed 30 ms before its reconnection event had arrived, and the terminal replacement test timed out while waiting for a provider gate. Both suites pass in isolation, which does not excuse the full-run failures.

The watcher test now awaits the actual `session.updated` payload before checking its event sequence and resumed Last-Event-ID; it always stops its watcher in cleanup. The terminal test now waits until the held provider call has entered and installed its release callback before closing the old session and creating a competing one. The former zero-delay timer could run before the restart reached its provider, letting the competing create consume the held call and preventing the test from reaching its release operation. Cleanup now releases any outstanding provider gate before runtime shutdown.

The production watcher, terminal capacity logic, test assertions, test deadlines and test counts are unchanged. Explicit events replace assumptions about scheduler timing. Required CI and signed shadow are rerun on the corrected source; the superseded candidate's incomplete workflows do not qualify publication.

## Windows PowerShell process deadlines

The Windows bootstrap CI job on `1190bd9698575789c9fafea0b2c5b0e33678ac2f` completed its successful bootstrap path in 7,407 ms, exceeding Vitest's implicit 5,000 ms test deadline. The fixture already permits 30,000 ms per PowerShell subprocess, and some cases invoke it twice. The outer test deadline now covers those existing bounded subprocess calls plus cleanup. No subprocess deadline, installation/signature assertion or production behavior changes. Native Windows CI must execute every bootstrap and ACL test successfully; a rerun alone is not treated as a correction for the deadline mismatch.
