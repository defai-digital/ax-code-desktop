import { afterEach, describe, expect, test, vi } from "vitest"
import type { ProviderWithModelList } from "@/types/providerModels"
import { registerAgentsSource } from "@/lib/agents"
import { keepsManualSelection, shouldKeepCurrentSelection, useConfigStore } from "./useConfigStore-impl"

const providers = [
  {
    id: "claude-code",
    models: [{ id: "claude-sonnet", limit: { context: 200_000, output: 8_000 } }],
  },
  {
    id: "defai",
    models: [{ id: "deepseek-flash", limit: { context: 200_000, output: 8_000 } }],
  },
] as unknown as ProviderWithModelList[]

describe("shouldKeepCurrentSelection", () => {
  test("keeps a still-selectable selection when only the last-resort default resolved", () => {
    // Regression: loadAgents ran on every startup/refresh and moved the composer to
    // the first selectable provider (claude-code) even though the user's choice was
    // still valid.
    expect(shouldKeepCurrentSelection(true, providers, "defai", "deepseek-flash")).toBe(true)
  })

  test("lets a configured default or agent preference apply", () => {
    expect(shouldKeepCurrentSelection(false, providers, "defai", "deepseek-flash")).toBe(false)
  })

  test("does not keep a selection the fresh provider list no longer offers", () => {
    expect(shouldKeepCurrentSelection(true, providers, "defai", "removed-model")).toBe(false)
    expect(shouldKeepCurrentSelection(true, providers, "removed-provider", "deepseek-flash")).toBe(false)
  })

  test("does not keep an empty selection", () => {
    expect(shouldKeepCurrentSelection(true, providers, "", "")).toBe(false)
  })

  test("treats an empty provider list as the discovery window, not proof of removal", () => {
    // The jump happens later, once the list returns: nothing may be resolved against
    // an empty list. Here the empty list simply cannot confirm the selection.
    expect(shouldKeepCurrentSelection(true, [], "defai", "deepseek-flash")).toBe(false)
  })
})

describe("keepsManualSelection", () => {
  test("keeps a selectable pick the user made", () => {
    expect(keepsManualSelection("manual", providers, "defai", "deepseek-flash")).toBe(true)
  })

  test("treats a selection the project only inherited as replaceable", () => {
    expect(keepsManualSelection("auto", providers, "defai", "deepseek-flash")).toBe(false)
    expect(keepsManualSelection(undefined, providers, "defai", "deepseek-flash")).toBe(false)
  })

  test("does not keep a pick the fresh provider list no longer offers", () => {
    expect(keepsManualSelection("manual", providers, "defai", "removed-model")).toBe(false)
    expect(keepsManualSelection("manual", providers, "removed-provider", "deepseek-flash")).toBe(false)
  })

  test("does not keep an empty pick", () => {
    expect(keepsManualSelection("manual", providers, "", "")).toBe(false)
  })
})

const PROJECT_DIRECTORY = "/project"
const SETTINGS_DEFAULT_MODEL = "claude-code/claude-sonnet"

const seedProject = (selectionSource: "auto" | "manual") => {
  registerAgentsSource({
    getAgents: () => [{ name: "build" }, { name: "plan" }] as never,
    loadAgents: async () => true,
  })
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    json: async () => ({ defaultModel: SETTINGS_DEFAULT_MODEL }),
  }))
  useConfigStore.setState({
    activeDirectoryKey: PROJECT_DIRECTORY,
    providers,
    currentProviderId: "defai",
    currentModelId: "deepseek-flash",
    currentAgentName: "build",
    settingsDefaultModel: undefined,
    directoryScoped: {
      [PROJECT_DIRECTORY]: {
        providers,
        currentProviderId: "defai",
        currentModelId: "deepseek-flash",
        currentAgentName: "build",
        selectedProviderId: "defai",
        agentModelSelections: {},
        defaultProviders: {},
        selectionSource,
      },
    },
  })
}

describe("loadAgents and a manual project selection", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("keeps the pick the user made instead of applying the settings default", async () => {
    // Regression: the settings default overwrote a still-valid manual pick on every
    // loadAgents run (startup, directory activation, MCP/plugin/agent refresh) and
    // persisted the replacement, so the composer jumped to another provider on its
    // own.
    seedProject("manual")

    await useConfigStore.getState().loadAgents()

    const state = useConfigStore.getState()
    expect(state.currentProviderId).toBe("defai")
    expect(state.currentModelId).toBe("deepseek-flash")
    expect(state.directoryScoped[PROJECT_DIRECTORY].selectionSource).toBe("manual")
  })

  test("applies the settings default to a project that never picked one", async () => {
    seedProject("auto")

    await useConfigStore.getState().loadAgents()

    const state = useConfigStore.getState()
    expect(state.currentProviderId).toBe("claude-code")
    expect(state.currentModelId).toBe("claude-sonnet")
    expect(state.directoryScoped[PROJECT_DIRECTORY].selectionSource).toBe("auto")
  })

  test("a run against an empty provider list does not hand the pick to the defaults", async () => {
    // Auth connect/disconnect empties every provider snapshot while AX Code restarts, and the
    // agents list can be empty on a run of its own, which clears the project's agent name. Neither
    // is proof that the user's pick is gone: nothing resolves against an empty list, so the pick
    // must stay marked as the user's, or the next refresh applies the settings default over it.
    seedProject("manual")
    useConfigStore.setState((state) => ({
      providers: [],
      currentAgentName: undefined,
      directoryScoped: {
        [PROJECT_DIRECTORY]: {
          ...state.directoryScoped[PROJECT_DIRECTORY],
          providers: [],
          currentAgentName: undefined,
        },
      },
    }))

    await useConfigStore.getState().loadAgents()
    expect(useConfigStore.getState().directoryScoped[PROJECT_DIRECTORY].selectionSource).toBe("manual")

    // The list is back: the pick still wins over the settings default.
    useConfigStore.setState({ providers })
    await useConfigStore.getState().loadAgents()

    const state = useConfigStore.getState()
    expect(state.currentProviderId).toBe("defai")
    expect(state.currentModelId).toBe("deepseek-flash")
  })
})

describe("selection source tracking", () => {
  test("picking a model marks the project pick as manual, a default does not", () => {
    seedProject("auto")

    useConfigStore.getState().setModel("deepseek-flash")
    expect(useConfigStore.getState().directoryScoped[PROJECT_DIRECTORY].selectionSource).toBe("manual")

    // The settings-default editor previews its value in the active project: that is
    // not a project pick, so a later default change may still replace it.
    useConfigStore.getState().setProvider("claude-code", "auto")
    useConfigStore.getState().setModel("claude-sonnet", "auto")
    expect(useConfigStore.getState().directoryScoped[PROJECT_DIRECTORY].selectionSource).toBe("auto")
  })

  test("picking an agent marks the pick as manual so the cascade leaves it alone", () => {
    seedProject("auto")

    useConfigStore.getState().setAgent("plan")

    const snapshot = useConfigStore.getState().directoryScoped[PROJECT_DIRECTORY]
    expect(snapshot.currentAgentName).toBe("plan")
    expect(snapshot.selectionSource).toBe("manual")
  })
})
