import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"

type Provider = { id: string; models: { id: string; variants?: Record<string, unknown> }[] }

type ConfigState = {
  providers: Provider[]
  currentProviderId: string
  currentModelId: string
  currentVariant: string | undefined
  currentAgentName: string | undefined
  loadProviders: (options?: { directory?: string | null }) => Promise<void>
  loadAgents: (options?: { directory?: string | null }) => Promise<void>
}

const configStore = vi.hoisted(
  (): {
    state: ConfigState
    setState: (patch: Partial<ConfigState>) => void
    subscribe: (listener: () => void) => () => void
    reset: () => void
  } => {
    const listeners = new Set<() => void>()
    const noop = async () => {}
    const state: ConfigState = {
      providers: [],
      currentProviderId: "",
      currentModelId: "",
      currentVariant: "",
      currentAgentName: "",
      loadProviders: noop,
      loadAgents: noop,
    }
    return {
      state,
      setState: (patch) => {
        Object.assign(state, patch)
        for (const listener of listeners) listener()
      },
      subscribe: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      reset: () => {
        Object.assign(state, {
          providers: [],
          currentProviderId: "",
          currentModelId: "",
          currentVariant: "",
          currentAgentName: "",
          loadProviders: noop,
          loadAgents: noop,
        })
        for (const listener of listeners) listener()
      },
    }
  },
)

const agentsStore = vi.hoisted(() => ({ loadAgents: async () => {} }))

vi.mock("@/stores/useConfigStore", async () => {
  const React = await import("react")
  const useConfigStore = (selector: (state: ConfigState) => unknown) =>
    React.useSyncExternalStore(
      configStore.subscribe,
      () => selector(configStore.state),
      () => selector(configStore.state),
    )
  return { useConfigStore }
})

vi.mock("@/stores/useAgentsStore", () => ({
  useAgentsStore: (selector: (state: { loadAgents: () => Promise<void> }) => unknown) => selector(agentsStore),
}))

vi.mock("@/components/ui/dialog", () => {
  const Wrapper = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    Dialog: ({ children, open }: { children?: React.ReactNode; open?: boolean }) => (open ? <div>{children}</div> : null),
    DialogContent: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
  }
})

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    variant,
    size,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
    <button {...props} data-variant={variant ?? ""} data-size={size ?? ""}>
      {children}
    </button>
  ),
}))

vi.mock("@/components/ui/dropdown-menu", () => {
  const Wrapper = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    DropdownMenu: Wrapper,
    DropdownMenuTrigger: Wrapper,
    DropdownMenuContent: Wrapper,
    DropdownMenuItem: Wrapper,
  }
})

vi.mock("@/components/icon/Icon", () => ({ Icon: () => null }))

vi.mock("@/components/sections/agents/ModelSelector", () => ({
  ModelSelector: ({
    providerId,
    modelId,
    onChange,
  }: {
    providerId: string
    modelId: string
    onChange: (providerID: string, modelID: string) => void
  }) => (
    <button
      type="button"
      data-testid="model-selector"
      data-provider={providerId}
      data-model={modelId}
      onClick={() => onChange("p1", "m-user")}
    />
  ),
}))

vi.mock("@/components/sections/commands/AgentSelector", () => ({
  AgentSelector: ({ agentName, onChange }: { agentName: string; onChange: (agent: string) => void }) => (
    <button
      type="button"
      data-testid="agent-selector"
      data-agent={agentName}
      onClick={() => onChange("agent-user")}
    />
  ),
}))

const provider = (): Provider => ({
  id: "p1",
  models: [{ id: "m-first" }, { id: "m-default" }, { id: "m-user" }],
})

const { TodoSendDialog } = await import("./TodoSendDialog")

const selection = (container: HTMLElement): string => {
  const selector = container.querySelector('[data-testid="model-selector"]')
  return `${selector?.getAttribute("data-provider") ?? ""}/${selector?.getAttribute("data-model") ?? ""}`
}

const agentSelection = (container: HTMLElement): string =>
  container.querySelector('[data-testid="agent-selector"]')?.getAttribute("data-agent") ?? ""

const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe("TodoSendDialog late selection resolution", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    configStore.reset()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  const renderDialog = (open: boolean) => {
    act(() => {
      root.render(
        <I18nProvider>
          <TodoSendDialog
            open={open}
            onOpenChange={() => {}}
            target="session"
            projectDirectory="/repo"
            onConfirm={() => {}}
          />
        </I18nProvider>,
      )
    })
  }

  test("uses the store's resolved default instead of the first model after opening", async () => {
    // `activateDirectory` cleared the selection, so the open transition seeds empty values.
    // Providers and the stored default arrive together after the dialog is already open.
    configStore.state.loadProviders = async () => {
      await Promise.resolve()
      configStore.setState({
        providers: [provider()],
        currentProviderId: "p1",
        currentModelId: "m-default",
      })
    }

    renderDialog(false)
    renderDialog(true)
    await flush()

    expect(selection(container)).toBe("p1/m-default")
  })

  test("adopts the agent resolved after the dialog opens", async () => {
    configStore.state.loadProviders = async () => {
      await Promise.resolve()
      configStore.setState({ providers: [provider()], currentProviderId: "p1", currentModelId: "m-default" })
    }
    configStore.state.loadAgents = async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      configStore.setState({ currentAgentName: "build" })
    }

    renderDialog(false)
    renderDialog(true)
    await flush()

    expect(agentSelection(container)).toBe("build")
  })

  test("keeps a model the user picked before the store finishes resolving", async () => {
    configStore.state.loadProviders = async () => {
      await Promise.resolve()
      configStore.setState({ providers: [provider()] })
    }

    renderDialog(false)
    renderDialog(true)
    await flush()
    expect(selection(container)).toBe("p1/m-first")

    const modelSelector = container.querySelector<HTMLButtonElement>('[data-testid="model-selector"]')
    expect(modelSelector).not.toBeNull()
    act(() => modelSelector?.click())
    expect(selection(container)).toBe("p1/m-user")

    act(() => {
      configStore.setState({ currentProviderId: "p1", currentModelId: "m-default" })
    })

    expect(selection(container)).toBe("p1/m-user")
  })

  test("keeps an agent the user picked before the store finishes resolving", async () => {
    configStore.state.loadAgents = async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
      configStore.setState({ currentAgentName: "build" })
    }

    renderDialog(false)
    renderDialog(true)

    const agentSelector = container.querySelector<HTMLButtonElement>('[data-testid="agent-selector"]')
    expect(agentSelector).not.toBeNull()
    act(() => agentSelector?.click())
    expect(agentSelection(container)).toBe("agent-user")

    await flush()

    expect(agentSelection(container)).toBe("agent-user")
  })
})
