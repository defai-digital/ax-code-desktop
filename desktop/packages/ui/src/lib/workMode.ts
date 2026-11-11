/**
 * Work mode: Agent (default) | Council | Arena — multi-model send routing.
 *
 * Re-exports from the public SDK contract with desktop-friendly flat names.
 * Desktop-specific helpers (resolveWorkModeSend, workModeEnsembleCommand, workModeBlockedReason,
 * workModeFallbackPrompt) live here.
 */

import { WorkMode } from "@defai-digital/ax-code-sdk/mode"
import { canOrchestrateAgentTeam, type AgentTeamCatalogProvider, type AgentTeamModelRef } from "./agentTeam"
import { isExternalCliProvider } from "./providerModelAvailability"

// ── Re-exports from core ────────────────────────────────────────────────
export type WorkModeId = WorkMode.Id
export const DEFAULT_WORK_MODE: WorkModeId = WorkMode.DEFAULT

/** A new chat always starts in Agent, even when the directory last used Council or Arena. */
export function initialWorkModeForNewChat(): WorkModeId {
  return DEFAULT_WORK_MODE
}
export const parseWorkMode: (value: unknown, fallback?: WorkModeId) => WorkModeId = WorkMode.parse
export const cycleWorkMode: (current: WorkModeId) => WorkModeId = WorkMode.cycle
export const workModeChipColorHex: (mode: WorkModeId) => `#${string}` = WorkMode.chipColorHex
type WorkModeRouted = WorkMode.Routed
export const routeWorkModeInput: (mode: WorkModeId, text: string) => WorkModeRouted = WorkMode.routeInput

// ── Desktop-specific helpers ────────────────────────────────────────────

/**
 * Resolve send content through work mode + slash detection.
 * Shared by routeMessage so leading whitespace cannot bypass slash/work-mode routing.
 */
export function resolveWorkModeSend(
  mode: WorkModeId,
  content: string,
): {
  content: string
  forcedCommand: { name: "council" | "arena"; arguments: string } | null
} {
  const routed = routeWorkModeInput(mode, content)
  if (routed.kind === "command") {
    return {
      content: `/${routed.command} ${routed.arguments}`.trimEnd(),
      forcedCommand: { name: routed.command, arguments: routed.arguments },
    }
  }
  // Explicit slash (possibly after leading whitespace) — use normalized text.
  if (routed.text.trimStart().startsWith("/")) {
    return { content: routed.text, forcedCommand: null }
  }
  return { content: routed.text, forcedCommand: null }
}

/**
 * The ensemble command a send is actually routed to, or null when it is not an arena/council turn.
 *
 * Work-mode remapping sets `forcedCommand` (`resolveWorkModeSend`); an explicit `/council` or
 * `/arena` typed by the user goes through untouched in any mode and asks for the same runtime tool.
 * Every other slash command — `/help`, `/compact`, a custom command — is not an ensemble turn.
 */
export function workModeEnsembleCommand(
  content: string,
  forcedCommand: { name: "council" | "arena" } | null,
): "council" | "arena" | null {
  if (forcedCommand) return forcedCommand.name
  const head = content.trimStart().split(/\s+/, 1)[0]
  if (head === "/council") return "council"
  if (head === "/arena") return "arena"
  return null
}

/** Why the armed Council or Arena mode cannot run on the composer model, or null when it can. */
export type WorkModeBlockedReason = "cliLead" | "noToolCalling"

/** Display name of a work mode, matching the mode selector's label. */
export function workModeLabel(mode: WorkModeId): string {
  if (mode === "council") return "Council"
  if (mode === "arena") return "Arena"
  return "Agent"
}

/**
 * Council and Arena ask the model that runs the turn to call the runtime's `council`/`arena` tools.
 * A CLI provider runs its own vendor agent loop and never receives those tools, and a model the
 * catalog marks as unable to call tools cannot use them either, so the turn could not do what the
 * mode promises. Agent mode is a plain prompt and is never blocked.
 */
export function workModeBlockedReason(
  mode: WorkModeId,
  lead: AgentTeamModelRef | null | undefined,
  providers?: readonly AgentTeamCatalogProvider[],
): WorkModeBlockedReason | null {
  if (mode === "agent" || !lead) return null
  if (canOrchestrateAgentTeam(lead, providers)) return null
  return isExternalCliProvider(lead.providerID) ? "cliLead" : "noToolCalling"
}

/** Translation key for a blocked-mode warning; the mode name is passed as `{mode}`. */
export function workModeBlockedMessageKey(
  reason: WorkModeBlockedReason,
): "chat.workMode.blocked.cliLead" | "chat.workMode.blocked.noToolCalling" {
  return reason === "cliLead" ? "chat.workMode.blocked.cliLead" : "chat.workMode.blocked.noToolCalling"
}

/**
 * Free-text fallback when Desktop work mode forces council/arena but the connected
 * CLI does not expose that slash command (version skew). Mirrors the built-in
 * command templates so the model still invokes the ensemble tool.
 */
export function workModeFallbackPrompt(command: "council" | "arena", args: string): string {
  if (command === "council") {
    return [
      "Run a multi-provider council review (advisory). Use the **council** tool **as the primary action**.",
      "",
      `Question / focus: ${args}`,
      "",
      "Call the **council** tool within the first 1–2 tool rounds. Do not start with task_parallel monorepo digs.",
      "After council returns, summarize consensus / majority / minority / singleton honestly.",
    ].join("\n")
  }
  return [
    "Run a multi-provider arena (best-of-N). Use the **arena** tool.",
    "",
    `Task: ${args}`,
    "",
    "Call **arena** within the first 1–2 tool rounds. Do not start with task_parallel monorepo digs.",
    "Present ranked results honestly. Never fabricate multi-model output.",
  ].join("\n")
}
