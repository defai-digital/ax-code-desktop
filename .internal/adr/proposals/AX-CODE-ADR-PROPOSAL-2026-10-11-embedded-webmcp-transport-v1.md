# AX Code ADR Proposal: Desktop-Owned Native WebMCP Provider, Version 1

Status: Proposed draft for the AX Code repository; not accepted or installed there.
Date: 2026-10-11.
Related: AX Coder proposed ADR-009; AX Code WebMCP profile and permission ADRs.

## Proposed producer decision

Add a versioned authenticated desktop-provider capability for the main-owned browser guest in AX
Coder. AX Code retains sole ownership of agent tools, session dispatch, permission prompts/grants,
managed policy, effect classification, input/output bounds, workflows, and execution receipts.

Enrollment and browser requests use the existing authenticated local worker/SDK transport, with a
typed stream bound to the worker boot, provider, project, coding session, connection epoch, and guest
document generation. Project configuration, renderer IPC, and model tools cannot enroll arbitrary
browser providers. Do not expose a browser URL, websocket endpoint, or arbitrary CDP command.

Preserve the existing isolated Chrome bridge unchanged. Introduce an explicit embedded-provider
path rather than weakening the existing profile's prohibition on attaching to another browser.
Share canonical policy and tool dispatch internally; do not copy policy into AX Coder. Unsupported
frame, native API, SDK, or worker combinations fail closed with actionable capability status.

Discovery binds tool name, exact origin, frame, generation, and canonical definition digest.
Authorization revalidates that identity immediately before invocation. Lifecycle changes revoke
enrollment or document state, and cancellation/uncertain effects use the existing runtime lifecycle.
Website annotations and results remain untrusted. Desktop responses are observations, not receipts.

## Acceptance and publication order

1. Accept the AX Coder PRD, then install and accept paired ADRs in each affected repository.
2. Freeze typed provider schemas and test enrollment trust, permissions, document races, cancellation,
   and runtime-owned receipts against the native desktop adapter.
3. Publish the SDK and signed worker with an explicit capability and compatibility fixture.
4. AX Coder consumes exact releases and qualifies the independent packaged application.

No production implementation, producer publication, sibling edits, or acceptance is represented by
this draft. Its purpose is to make the required cross-repository decision reviewable without changing
the user's sibling checkout. Use the next available producer ADR number when accepted there.
