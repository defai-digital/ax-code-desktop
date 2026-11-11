import { describe, expect, test } from "vitest"
import {
  cycleWorkMode,
  DEFAULT_WORK_MODE,
  resolveWorkModeSend,
  routeWorkModeInput,
  workModeBlockedMessageKey,
  workModeBlockedReason,
  workModeChipColorHex,
  workModeEnsembleCommand,
  workModeFallbackPrompt,
  workModeLabel,
} from "./workMode"
import type { AgentTeamCatalogProvider, AgentTeamModelRef } from "./agentTeam"

const LEAD: AgentTeamModelRef = { providerID: "alibaba", modelID: "qwen" }
// Runs its own vendor agent loop, so the runtime never gives it council/arena.
const CLI_LEAD: AgentTeamModelRef = { providerID: "claude-code", modelID: "claude-fable-5-2" }
const NO_TOOLS_LEAD: AgentTeamModelRef = { providerID: "alibaba", modelID: "tiny" }

const CATALOG: AgentTeamCatalogProvider[] = [
  { id: "alibaba", models: [{ id: "qwen" }, { id: "tiny", capabilities: { toolcall: false } }] },
  { id: "claude-code", models: [{ id: "claude-fable-5-2", capabilities: { toolcall: true } }] },
]

describe("workMode", () => {
  test("default is agent", () => {
    expect(DEFAULT_WORK_MODE).toBe("agent")
  })

  test("cycles agent → council → arena → agent on one control", () => {
    // Single toggle: each click advances one mode (Desktop + TUI).
    expect(cycleWorkMode("agent")).toBe("council")
    expect(cycleWorkMode("council")).toBe("arena")
    expect(cycleWorkMode("arena")).toBe("agent")
  })

  test("routes free text by mode", () => {
    expect(routeWorkModeInput("agent", "hello")).toEqual({ kind: "prompt", text: "hello" })
    expect(routeWorkModeInput("council", "review auth")).toEqual({
      kind: "command",
      command: "council",
      arguments: "review auth",
    })
  })

  test("keeps slash commands intact", () => {
    expect(routeWorkModeInput("council", "/help")).toEqual({ kind: "prompt", text: "/help" })
  })

  test("strips leading whitespace so slash commands still route", () => {
    expect(routeWorkModeInput("arena", "  /help")).toEqual({ kind: "prompt", text: "/help" })
    expect(routeWorkModeInput("council", "\n/model gpt")).toEqual({ kind: "prompt", text: "/model gpt" })
  })

  test("resolveWorkModeSend forces council/arena and normalizes slashes", () => {
    expect(resolveWorkModeSend("agent", "  /help")).toEqual({
      content: "/help",
      forcedCommand: null,
    })
    expect(resolveWorkModeSend("council", "rate quality")).toEqual({
      content: "/council rate quality",
      forcedCommand: { name: "council", arguments: "rate quality" },
    })
    expect(resolveWorkModeSend("arena", "compare plans")).toEqual({
      content: "/arena compare plans",
      forcedCommand: { name: "arena", arguments: "compare plans" },
    })
    expect(resolveWorkModeSend("arena", "  /sessions")).toEqual({
      content: "/sessions",
      forcedCommand: null,
    })
  })

  test("workModeFallbackPrompt embeds tool instructions for version-skew CLI", () => {
    const council = workModeFallbackPrompt("council", "rate quality")
    expect(council).toContain("council")
    expect(council).toContain("rate quality")
    const arena = workModeFallbackPrompt("arena", "compare plans")
    expect(arena).toContain("arena")
    expect(arena).toContain("compare plans")
  })

  test("chip colors are fixed green / blue / purple", () => {
    expect(workModeChipColorHex("agent")).toBe("#22c55e")
    expect(workModeChipColorHex("council")).toBe("#3b82f6")
    expect(workModeChipColorHex("arena")).toBe("#a855f7")
  })
})

describe("workModeEnsembleCommand", () => {
  test("the work-mode remap is the ensemble command", () => {
    expect(workModeEnsembleCommand("/council rate this", { name: "council" })).toBe("council")
    expect(workModeEnsembleCommand("/arena compare plans", { name: "arena" })).toBe("arena")
  })

  test("an explicit ensemble slash is detected without a remap", () => {
    expect(workModeEnsembleCommand("/council rate this", null)).toBe("council")
    expect(workModeEnsembleCommand("/arena compare plans", null)).toBe("arena")
    expect(workModeEnsembleCommand("/council", null)).toBe("council")
  })

  test("other sends are not ensemble turns", () => {
    // Slash commands the user typed pass through untouched and need no runtime tool.
    expect(workModeEnsembleCommand("/help", null)).toBeNull()
    expect(workModeEnsembleCommand("/compact", null)).toBeNull()
    expect(workModeEnsembleCommand("/councils", null)).toBeNull()
    // Read like the command path: the name ends at the first space, so these are not the command.
    expect(workModeEnsembleCommand("/council\nrate this", null)).toBeNull()
    expect(workModeEnsembleCommand("/arena\tcompare plans", null)).toBeNull()
    expect(workModeEnsembleCommand("fix the login bug", null)).toBeNull()
    expect(workModeEnsembleCommand("", null)).toBeNull()
  })
})

describe("workModeBlockedReason", () => {
  test("agent mode is a plain prompt, so it is never blocked", () => {
    expect(workModeBlockedReason("agent", CLI_LEAD, CATALOG)).toBeNull()
    expect(workModeBlockedReason("agent", NO_TOOLS_LEAD, CATALOG)).toBeNull()
  })

  test("a model that can call tools runs Council and Arena itself", () => {
    expect(workModeBlockedReason("council", LEAD, CATALOG)).toBeNull()
    expect(workModeBlockedReason("arena", LEAD, CATALOG)).toBeNull()
  })

  test("a CLI composer model cannot run either mode", () => {
    expect(workModeBlockedReason("council", CLI_LEAD, CATALOG)).toBe("cliLead")
    expect(workModeBlockedReason("arena", CLI_LEAD, CATALOG)).toBe("cliLead")
    // A CLI provider is reported as such even when its catalog entry claims tool calling.
    expect(workModeBlockedReason("council", CLI_LEAD)).toBe("cliLead")
  })

  test("a non-CLI model known to lack tool calling cannot run them either", () => {
    expect(workModeBlockedReason("council", NO_TOOLS_LEAD, CATALOG)).toBe("noToolCalling")
    expect(workModeBlockedReason("arena", NO_TOOLS_LEAD, CATALOG)).toBe("noToolCalling")
  })

  test("unknown capability counts as capable", () => {
    // The catalog does not list this model at all, and the one it does list says nothing.
    expect(workModeBlockedReason("council", { providerID: "deepseek", modelID: "v4" }, CATALOG)).toBeNull()
    expect(workModeBlockedReason("arena", LEAD, [{ id: "alibaba", models: [{ id: "qwen" }] }])).toBeNull()
    expect(workModeBlockedReason("council", LEAD)).toBeNull()
  })

  test("no selected model has nothing to block yet", () => {
    expect(workModeBlockedReason("council", null, CATALOG)).toBeNull()
    expect(workModeBlockedReason("arena", undefined)).toBeNull()
  })

  test("labels and message keys name the mode and the reason", () => {
    expect(workModeLabel("agent")).toBe("Agent")
    expect(workModeLabel("council")).toBe("Council")
    expect(workModeLabel("arena")).toBe("Arena")
    expect(workModeBlockedMessageKey("cliLead")).toBe("chat.workMode.blocked.cliLead")
    expect(workModeBlockedMessageKey("noToolCalling")).toBe("chat.workMode.blocked.noToolCalling")
  })
})
