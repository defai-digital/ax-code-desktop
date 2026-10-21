## Review round 15d — final report (read-only, English, nothing modified)

**Verdict: no blocking issue.** No link can land on the wrong call, session or approval; page text cannot change the effect sentence or approve anything; no secret reaches the recap copy, previews, journal text, compare text or clipboard. Four non-blocking defects below, one MEDIUM.

### Verified sound (with evidence)

| Question | Evidence |
|---|---|
| Wrong call / session / approval | `ChatContainer.tsx:703-713` ignores a pending navigation whose `sessionId` is not current and expires it after 15 s (`:700`); `revealToolPart` / `revealPermission` are scoped by the runtime-generated `part.id` / `permission.id`, never by page data. Only one `ChatContainer` exists per document (`MainLayout.tsx:509`); mini-chat is a separate renderer (`ElectronMiniChatApp.tsx:287`), so a navigation cannot cross windows. Desktop split-pane keeps chat mounted and visible (`MainLayout.tsx:415,507`), so a recap step reveals a visible call. |
| Page text steering the approval | `webMcpEffect` (`toolHelpers.ts:541-561`) builds the sentence from operation/element/`submit`/origin only — the page description and hints are never inputs. Hints render under `pageSays` / `hintConsequential` / `hintReadOnly` plus `hintsDoNotApprove` (`WebMcpApprovalToolInfo.tsx:51-75`), description capped at 200 code units and bidi-isolated, and nothing there can answer the permission. |
| Selector injection | `revealToolPart.ts:2` escapes `"` and `\` inside a double-quoted attribute selector; the `prt_"quoted"` test passes. Ids are runtime-generated, so the unescaped-newline `SyntaxError` path is unreachable. |
| Secret leakage in recap / previews / journal | `resultLine` filters the whole string before truncating (`webMcpCalls.ts:60`); `recapText()` emits title, kind, outcome, reason, duration, digest and the already-filtered `resultPreview` only; journal `text` is `label + webMcpResultPreview(output)` (`WebMcpToolPanel.tsx:657`); journal/compare input goes through `redactWebMcpInput` (`:119`). |

### Findings

**[MEDIUM] Export placeholder misses credential-shaped values under ordinary keys**
`desktop/packages/ui/src/lib/toolHelpers.ts:324-334` (`placeholderWebMcpSecrets`, reached from `webMcpDiagnosis.ts:132` for both the copied snippet and the `--run` argument). Redaction is key-name based only: `{ note: "ghp_…" }`, `{ body: "token=abc" }`, `{ value: "sk-live-…" }` are copied verbatim into the clipboard and into the shell argument. The display path (`redactWebMcpInput` → `redactDisplayedText`) does catch these, so the two paths have drifted — and the doc comment promises "a copied test never carries the secret". Fix: after the name check, treat strings with `webMcpTextLooksSensitive(entry)` as `"<fill in>"`.

**[MEDIUM-LOW] Page-supplied tool name and input-property names are interpolated into the authoritative approval sentence without the isolation used elsewhere**
`components/chat/PermissionCard.tsx:387-389` renders `chat.permissionCard.webmcp.effect.*` with `params.tool` (a catalog `name`, allowed up to 256 arbitrary chars at `lib/webMcpCatalog.ts:167`, never truncated by `toolHelpers.ts:552`) and `:404` renders the same name in a `<code>` chip — both without `unicodeBidi: "isolate"`, while `WebMcpApprovalToolInfo.tsx:70` and `WebMcpCallStrip.tsx:84` do isolate page text precisely because bidi can reorder a line. A crafted name containing RTL overrides can visually reorder the sentence the user is asked to trust (the claims themselves stay fixed, so this is spoofing of reading order, not of meaning). Input property names from `schemaInputs()` (`WebMcpApprovalToolInfo.tsx:9-18`) are also injected untruncated into `pageSays`-adjacent text. Fix: `truncateToCodeUnits(toolName, 80)` plus `unicodeBidi: "isolate"` on both the effect `<p>` and the tool `<code>`; cap schema property names the same way.

**[LOW] Mobile: a recap/call-strip link is consumed while the chat is hidden**
`MainLayout.tsx:415` sets `isChatActive = !isGridActive && (!isMobile || activeMainTab === "chat")`, and `:507` hides the mounted chat with `invisible` when another main tab is active. On mobile the changes view (which hosts the recap) is that other tab, so a step click runs `ChatContainer`'s effect against an invisible container: the pending navigation is cleared (`:709`), `scrollIntoView` moves a pane nobody sees, and `focus()` is refused on `visibility:hidden` content. Fix: skip consuming the navigation while the chat surface is not visible, or re-apply the reveal when the chat tab becomes active.

**[LOW] "Awaiting approval" links focus an approving control**
`lib/revealToolPart.ts:26` focuses `card.querySelector("button")`, which is `Allow once` (`PermissionCard.tsx:544`). Reviewing a call and then pressing Enter approves it. This is the documented intent, but focusing the card (or `Reject`) would remove the one-keystroke approval path from a *navigation* affordance.

### Residual limitations
- Verified by source reading only; no `pnpm test` / `typecheck` / `lint` was run and no changes were made, so no verification envelope accompanies this review.
- I did not exercise the WebMCP bridge to observe the recap/call-strip focus behaviour at runtime; the mobile finding is derived from `MainLayout` visibility logic, not from an observed interaction.
- Round-14 territory I did not re-audit: `describeWebMcpCall` argument projection, catalog byte caps, and the supervision/session-grid surfaces.