# Browser Entrypoint Routing

Status: Accepted for implementation; user authorized plan, implementation, tests and commits on 2026-10-13.

AX Code CLI/TUI uses its existing external Chrome WebMCP bridge. Desktop uses its native embedded provider for canonical AI browser operations. Launcher selection is immutable within each worker; project configuration cannot re-enable an external Chrome bridge in embedded mode. Agent access remains explicit. Normal hyperlink opening and OAuth keep existing behavior.

Acceptance: CLI remains Chrome, Desktop advertises embedded mode, startup/add/reconnect cannot launch a profiled or legacy Chrome DevTools bridge in embedded mode, old providers fail compatibility negotiation, and other MCP tools retain their behavior. Source implementation and local tests do not establish released worker/SDK compatibility.
