# ADR-014: Agent Page Interaction in the Embedded Project Browser

Status: Accepted for implementation; user approved on 2026-10-15.
Date: 2026-10-15.
Related: PRD-2026-10-15-agent-page-interaction; ADR-009; ADR-013; AX Code ADR-184 (paired producer
record required before acceptance).

## Context

ADR-009 admits fixed native protocol commands only and exposes no generic CDP proxy. ADR-013 blocks
the external Chrome bridge in embedded mode. Together they leave `desktop_webmcp` limited to
page-registered tools, plus `navigate` from AX Code 7.25.8.

## Decision

1. Extend the desktop-provider contract additively with `read`, `act` and `wait` operations beside
   `list`, `invoke` and `navigate`. AX Code remains the sole tool and permission authority.
2. `read` returns bounded visible text and an accessibility outline built in the guest through the
   existing fixed-command channel, with element references scoped to one snapshot generation.
3. `act` accepts `click`, `type` and `select` on a reference only. It never accepts selectors,
   script, or coordinates from the model. A stale generation is rejected, not retried.
4. Operations stay bound to the enrolled origin and frame. A cross-origin change retires every
   reference, as navigation already does.
5. Approval: `read` and `wait` follow the existing WebMCP approval rule. `act` always asks once per
   origin and again for submit-like actions; `fullAccessOnly` auto-approval never covers `act`.
6. Typed values are redacted in logs and events. Password inputs are refused.
7. Output is wrapped as untrusted website data, as `list` and `invoke` results are now.

## Alternatives

| Alternative | Decision |
| --- | --- |
| Re-enable the Chrome bridge in embedded mode | Rejected by ADR-013 |
| Expose a generic CDP proxy | Rejected by ADR-009 |
| Selector or script based actions | Rejected: unbounded, hard to audit |
| Leave as is; use `webfetch` | Cannot render JavaScript sites such as trip.com |

## Consequences

Agents can use ordinary sites at the cost of a larger audited surface and a paired AX Code release.
Rollback is the previous matched producer/consumer pins; the new operations are additive and absent
operations fail with the existing unsupported-operation error.

## Release order

Accept this record and the AX Code ADR. Publish the producer, then repin and qualify Desktop. Do not
consume an unpublished runtime in release manifests.
