# ADR-013: Browser Entrypoint Routing

Status: Accepted for implementation.
Date: 2026-10-13.
Related: PRD-2026-10-13-browser-entrypoint-routing; AX Code ADR-184; AX Coder ADR-008.

Extend the existing native provider contract with an embedded browser mode attestation. AX Code owns selection and MCP admission; Desktop owns launcher environment and native browser UI. Snapshot AX_CODE_BROWSER_MODE once from launcher environment, with CLI chrome default and legacy valid Desktop token implying embedded mode. Desktop sets embedded explicitly for its child services and supervised worker. Embedded mode denies canonical WebMCP and recognizable legacy Chrome DevTools connections before subprocess creation. A missing provider or lease produces an actionable error without Chrome fallback.

Agent enrollment remains explicit and server-owned authorization is preserved. Hyperlinks/OAuth and third-party arbitrary shell or MCP behavior are outside this canonical browser routing contract. Do not modify accepted older records, restore GUI source to AX Code, or consume unpublished SDK/runtime through release manifests. Publish producer SDK/worker first, then repin and qualify Desktop. Rollback uses the previous matched producer/consumer; existing tags and profile data are retained.
