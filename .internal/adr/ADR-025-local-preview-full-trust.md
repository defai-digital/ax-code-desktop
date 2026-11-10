# ADR-025: Local previews run with full trust

Status: Accepted by the user on 2026-11-09.
Related: ADR-018 (renderer security baseline), ADR-019 (typed desktop IPC contract).

## Context

The context panel previews a loopback dev server (`localhost`, `127.0.0.1`, `[::1]`) through
`/api/preview/proxy/<id>/`, which is served on the Desktop app's own origin. The preview iframe in
`desktop/packages/ui/src/components/layout/ContextPanel-impl.tsx` is created with
`sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"` for loopback targets and
`sandbox="allow-scripts allow-forms"` for anything else. The preview proxy
(`desktop/packages/web/server/lib/preview/proxy-runtime.js`) marks every non-loopback target as external and adds a
CSP `sandbox` policy to it.

Because a loopback preview shares the app origin, its scripts can reach the parent window, including
`parent.__AX_CODE_DESKTOP__.invoke(...)`. That call runs in the window's main frame, so the main-process check in
`desktop/packages/electron/src/main.js` (`handleCommand`, which rejects IPC whose `senderFrame` is not the main frame)
does not stop it. A preview script can therefore use the same privileged desktop commands as the app, such as
reading files and opening paths, and can read the app's cookies and DOM.

A bug-hunt review (2026-11-08, with independent read-only reviews from the Codex and Grok CLIs) flagged this as the
highest-risk open item. It offered two mitigations: drop `allow-same-origin`, or serve each preview from a separate
origin. Dropping `allow-same-origin` breaks storage, cookies, sign-in flows and HMR for many dev servers. A separate
origin needs new proxy and protocol plumbing.

## Decision

1. AX Code Desktop is a coding tool, and a local preview shows the user's own project. The user expects that page to
   behave exactly as it does in a normal browser tab, with the full rights the app has. Loopback previews keep
   `allow-same-origin` and stay on the app origin.
2. The trust applies only to loopback targets. Non-loopback targets, and any redirect from a loopback preview to a
   public host, keep the restrictive iframe sandbox and the proxy's CSP `sandbox` policy. Untrusted file previews in
   `FilesView` keep their sandbox without `allow-same-origin`.
3. Reviews should not treat full access from a loopback preview as a defect. A change that weakens the external-target
   sandbox or widens which hosts count as loopback is a defect.

## Consequences

Dev servers keep working in the preview with storage, cookies, authentication redirects and HMR. Any code the
previewed project runs, including its third-party dependencies, runs with the Desktop app's privileges while the
preview is open. A compromised dependency in the user's project could read files or open paths through the desktop
bridge. The user accepted that risk for this product.

Revisit this decision if any of these happens:

- Desktop starts previewing content the user did not write, such as shared or remote workspaces, or arbitrary URLs
  treated as loopback.
- Desktop exposes more powerful IPC commands to the renderer.
- A per-preview origin can be added without breaking dev-server behaviour.

No runtime, SDK, identity or updater contract changes.
