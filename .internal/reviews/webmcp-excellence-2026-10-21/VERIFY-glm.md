# Verification of SYNTHESIS-kimi.md (glm-5.3, read-only, 2026-10-21)


## Citation audit: confirmed / imprecise / wrong

**Wrong (1):**
- Header "Verification: `VERIFY-glm.md`" — no such file exists in `webmcp-excellence-2026-10-21/` (one exists only in `../supervision-ux-orca-2026-10-20/round8-webmcp-design/`). Stale pointer.

**Imprecise (2):**
- **WX-14** cites `desktop-webmcp-browser.js:138-152,375`. Those lines correctly support storage-wipe-on-close and popup denial (`setWindowOpenHandler deny`, :375). But "stop stripping query/hash on URL restore" happens in **UI**, not Electron: `safeWebMcpAddress` in `useWebMcpBrowserStore.ts`, proven by `useWebMcpBrowserStore.test.ts:14-15` (`?token=secret#credential` → restores `https://example.org/one`). Claim true, pointer incomplete (inherited from audit:14).
- **Conflict 1** cites `answer-codex.md:47` for the no-auto-approval bar. Line 47 lists traps (persistent login, popups, screenshot archives, duplicate validator) but never mentions auto-approval; PRD:66 alone carries that half.

**Confirmed — everything else.** Per requirement:
- **WX-01**: `webMcpToolForm.ts:19` (`.slice(0,24)`), `:40` (`raw.trim()`); panel renders only name/required/kind/description — no `minLength` etc.
- **WX-02**: `useWebMcpBrowserStore.ts:216-219` drops `annotations` (native-webmcp.js:138 ships them); 64-entry cap at store:214 and `CATALOG_MAX_TOOLS=64` (browser.js:157) → "64 of 65" acceptance is real; `WebMcpToolPanel.tsx:118-122` truncated description.
- **WX-03**: `desktop-webmcp-browser.js:627-631` (`ok:true` passthrough; catch → single `invoke-failed`); panel :94-100 styles `ok:true` as success; `toolHelpers.ts:372-377` transcript reason/nextAction vocabulary (panel has a second ad-hoc set).
- **WX-04**: `native-webmcp.js:123-160` — duplicate/invalid catalog throws are swallowed (:155-158 → `available=false`, snapshot returns `[]` at :182); `:202-203` digest check; `WebMcpToolPanel.tsx:196` (`return null` on empty catalog), `:211` (`key={tool.name}` name-keyed identity).
- **WX-05/R1**: `toolHelpers.ts:366-370` masked `inputPreview` comment; deepseek #9 (ring 32, never transcript/disk) and #12 verified verbatim.
- **WX-06**: `docs/development-webmcp.md` is explicitly "separate from using website tools through the project browser" (line 3-4).
- **WX-07**: `WebMcpCallStrip.tsx:50-85` rows lack duration/timestamp/approval-link/page marker; `webMcpCalls.ts:53-84` session-wide, limit 20, no origin.
- **WX-08**: `PermissionCard.tsx:143-147` countdown exists (no explicit timeout outcome rendered); :374-457 labeled rows, no effect sentence, submit flag at :417.
- **WX-09**: `EmbeddedWebMcpBrowser.tsx:366-401` action row; `PermissionCard.tsx:199-203`; `WebMcpAllowlistSection.tsx:30` exists.
- **WX-10**: `EmbeddedWebMcpBrowser.tsx:374-400` overloaded slot (Resume/Fix/Disconnect/Start/Enable); `desktop-webmcp-browser.js:119-124` pause = revoke provider, retain page.
- **WX-11**: `EmbeddedWebMcpBrowser.tsx:489-498` arrows toggle selection, no focus move.
- **WX-13**: `ReviewLandingBrowserEvidence.tsx:21-29` counts only; `ToolPart-impl.tsx:957` completed-output transcript part.
- **WX-15/WX-16**: `desktop-webmcp-browser.js:349-350` one view per sender; `toolHelpers.ts:364` defensive runtime-metadata reads.
- All PRD cites (33-46, 50-57, 52-53, 55-57, 63-67, 66), audit (11-48 and every line ref), SotA (56, 71-88), grok (41-78, incl. :53 "20 prompts × 3 runs ≥90%", :69, :71, :75, :78 deferred), codex (:3 non-additive, :47, #1-#10), minimax (P1-P12, :3, :56), deepseek (#1-#13) — verified against actual content.

## PRD-constraint check (section 5 / AGENTS.md)

- **WX-14 — flag (tension).** "Stop stripping query/hash on URL restore" reverses a deliberate credential-hygiene behavior: the existing test asserts localStorage never matches `/secret|credential/`, and PRD §5 bars credentials in records. Restoring full query/hash into persisted address history risks persisting auth tokens. Acceptance needs a carve-out (strip credential-shaped params, or keep the full URL in memory only). The other WX-14 halves (isolated profile, explicit sign-out, no durable records) are consistent.
- **WX-09 — note.** Merging/displaying grants is fine; must stay display-only. Minimax P7's "allow a saved scope for Desktop browser calls" would create a standing grant barred by PRD:66; codex #6's "add no grant mechanism" reading must govern.
- WX-12 (auto-run deferred, hash-binding now), WX-15/16 (runtime-pending, excluded from DoD item 1 per PRD:55-57), WX-05 (in-memory, never disk), deferred grok items — all consistent. No second runtime anywhere; lint stays advisory (WX-02/WX-16 split, conflict 4).

## Acceptance-test checkability

All WX-01..WX-13, WX-18 acceptances are checkable via unit tests (`data-webmcp-*` selectors, store/adapter tests) or native journeys (W1-W8). WX-15/WX-16 are not checkable in Desktop alone — correctly gated as runtime-pending. WX-17's eval gate is harness-checkable. Soft spots: WX-14's "sign-in pages hand control to the person" is partly judgment (needs an operational proxy, e.g., agent action suppression on sign-in-class pages); WX-16's "capability availability" is only verifiable after a signed pin exists.

**Verdict: synthesis is source-faithful — 1 wrong pointer (VERIFY-glm), 2 imprecise citations (WX-14 location, conflict-1 codex:47), and one substantive constraint flag (WX-14 query/hash restore). No files modified.**