# Chat Message Parts: Rendering Architecture

This folder contains renderers for chat message parts (text, tools, reasoning, placeholders) and shared tool presentation helpers.

Use this doc when you ask an agent to change tool/header/description behavior.

## High-level flow

- Message parts are rendered from `MessageBody.tsx`.
- There are two tool rendering paths:
  - **Static tools** -> `StaticToolRow` in `StaticToolRow.tsx`
  - **Expandable tools** -> `ToolPart.tsx`
- Shared tool icon mapping is centralized in `toolPresentation.tsx` (`getToolIcon`).

## Which file controls what

- `StaticToolRow.tsx`
  - Renders one compact row per static tool call (`StaticToolRow`).
  - Contains static tool short description logic (`getToolShortDescription`).
  - If you want to change how `read/grep/perplexity/webfetch/...` look as compact rows, edit here.

- `ToolPart.tsx`
  - Renders expandable tool rows (bash/edit/write/question/task + fallback).
  - Controls expandable header title/description/diff stats/timer and expanded output body.
  - If you want to change expandable tool layout, edit here.

- `toolPresentation.tsx`
  - Shared icon mapping for tool names (`getToolIcon`).
  - Used by both `StaticToolRow.tsx` and `ToolPart.tsx`.

- `toolRenderUtils.ts`
  - Core classification helpers:
    - `isExpandableTool`
    - `isStaticTool`
    - `isStandaloneTool`
    - `getStaticGroupToolName`
  - If a tool should switch between static vs expandable, change it here.

- `ReasoningPart.tsx`
  - Thinking block UI (`ReasoningTimelineBlock`), summary + optional duration.

## Current important behavior

- `read` and most search/fetch tools are treated as **static tools** and usually render via `StaticToolRow`.
- `bash/edit/write/question/task` are **expandable tools** and render via `ToolPart`.
- `perplexity` is currently treated as static and rendered as a search/web-search style row (through short description extraction).
- Chat renders in one (live) mode; the retired `sorted` mode and its grouped Activity block are gone.

## "I want to change description for Perplexity" (example recipe)

If task is: "change text shown near Perplexity tool header/description":

1. Edit `StaticToolRow.tsx` -> `getToolShortDescription(activity)`.
2. Update the branch that handles web-search tools (`websearch`, `web-search`, `search_web`, `codesearch`, `perplexity`, etc.).
3. If needed, update rendering in `StaticToolRow` (search/fetch specific rendering branches).
4. Keep icon changes (if any) in `toolPresentation.tsx`.

Why: in the current pipeline Perplexity is static, so `StaticToolRow` is the primary path.

## "I want tool to become expandable" (example)

1. Update `toolRenderUtils.ts`:
   - add/remove tool name in `EXPANDABLE_TOOL_NAMES`
2. Ensure `ToolPart.tsx` supports desired header + expanded output format for that tool.
3. Validate it in the chat transcript, with Activity both expanded and collapsed.

## Safe editing checklist

- Do not duplicate icon logic; keep it in `toolPresentation.tsx`.
- For static tool copy changes, prefer `StaticToolRow.tsx` first.
- For expanded output changes, edit `ToolPart.tsx`.
- After edits run:
  - `pnpm run typecheck`
  - `pnpm run lint`
  - `pnpm run test`

## Quick map of files in this folder

- Text: `AssistantTextPart.tsx`, `UserTextPart.tsx`
- Tools: `ToolPart.tsx`, `StaticToolRow.tsx`, `toolPresentation.tsx`, `toolRenderUtils.ts`, `ToolRevealOnMount.tsx`
- Reasoning: `ReasoningPart.tsx`
- Status/placeholders: `WorkingPlaceholder.tsx`, `BusyDots.tsx`
- Utility renderers: `VirtualizedCodeBlock.tsx`, `MinDurationShineText.tsx`
