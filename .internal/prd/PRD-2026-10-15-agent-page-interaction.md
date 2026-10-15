# Agent Page Interaction in the Embedded Project Browser

Status: Accepted for implementation; user approved on 2026-10-15.

Date: 2026-10-15

## Problem

Desktop sessions can enroll the project browser and, with AX Code 7.25.8, let the agent open a page
(`desktop_webmcp` `navigate`). The agent still cannot use an ordinary website. The tool only lists
and invokes tools a page registers through `navigator.modelContext`, and sites such as trip.com
register none, so `list` returns an empty catalog. The Chrome bridge that could read and drive such
pages is blocked in embedded mode by design (ADR-013). On 2026-10-14 a Desktop session asked to check
trip.com fares and could not proceed.

## Goal

When the user has enrolled a page, the agent can read what the page shows and perform bounded
interactions on it, with the same explicit consent, origin scoping and audit as existing WebMCP
operations.

## Requirements

1. Reading: return the visible text and an accessibility-style outline of the enrolled page, with
   stable element references valid for one page generation.
2. Interaction: click, type and select on a referenced element; wait for a navigation or a text to
   appear. Each operation targets the enrolled origin only.
3. Every operation is untrusted-output: results are website data, never instructions.
4. Enrollment stays the user's explicit decision. Interactions that submit data, change an account
   or spend money require a per-action approval; purchases and credential entry are never automated.
5. No raw credentials in prompts, logs, events or artifacts. Form values the agent types are
   redacted in logs.
6. Works under the existing permission modes; full-access Auto may pre-approve reads only.
7. The Chrome bridge stays blocked in embedded mode. No generic CDP proxy is exposed.

## Out of scope

Cross-origin navigation without a fresh approval, file upload or download, credential autofill,
payment flows, and a second coding runtime in Desktop.

## Ownership

AX Code owns the tool, schema, permission and approval policy. AX Coder owns the native page adapter
that serves the requests. Producer ships first, then Desktop repins and qualifies.

## Acceptance

- A Desktop session can open a public page, read its text, and click a link on it, verified on a real
  Electron window with the pinned signed runtime.
- A submit-style action asks for approval and is refused when denied.
- A page that navigates away from the enrolled origin revokes the references and requires a new grant.
- Logs and events show redacted typed values.
