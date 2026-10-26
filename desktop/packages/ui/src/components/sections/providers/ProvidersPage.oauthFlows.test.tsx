import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"

const {
  fetchAvailableProviders,
  fetchCustomApiProviders,
  upsertCustomApiProvider,
  fetchProviderAuthMethods,
  fetchProviderJsonWithRetry,
  loadProviders,
  openExternalUrl,
  reloadAxCodeConfiguration,
  toastError,
  toastMessage,
  toastWarning,
} = vi.hoisted(() => ({
  fetchAvailableProviders: vi.fn(),
  fetchCustomApiProviders: vi.fn(),
  upsertCustomApiProvider: vi.fn(),
  fetchProviderAuthMethods: vi.fn(),
  fetchProviderJsonWithRetry: vi.fn(),
  loadProviders: vi.fn(async () => {}),
  openExternalUrl: vi.fn(),
  reloadAxCodeConfiguration: vi.fn(async () => {}),
  toastError: vi.fn(),
  toastMessage: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock("@/lib/ax-code/providerApi", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ax-code/providerApi")>("@/lib/ax-code/providerApi")
  return {
    ...actual,
    fetchProviderAuthMethods,
    fetchProviderJsonWithRetry,
    fetchAvailableProviders,
    upsertCustomApiProvider,
    fetchProviderSources: vi.fn(async () => ({
      auth: { exists: false },
      user: { exists: false },
      project: { exists: false },
    })),
    fetchCustomApiProviders,
  }
})

vi.mock("@/lib/url", () => ({ openExternalUrl }))
vi.mock("@/lib/clipboard", () => ({ copyTextToClipboard: vi.fn(async () => true) }))
vi.mock("@/components/ui", () => ({
  toast: { message: toastMessage, success: vi.fn(), error: toastError, warning: toastWarning },
}))

vi.mock("@/stores/useAgentsStore", () => ({ reloadAxCodeConfiguration, waitForQueuedAxCodeReload: vi.fn() }))

const stubStore = <State,>(state: State) => {
  const useStore = ((selector?: (value: State) => unknown) => (selector ? selector(state) : state)) as unknown as {
    (selector?: (value: State) => unknown): unknown
    getState: () => State
  }
  useStore.getState = () => state
  return useStore
}

const provider = { id: "demo", name: "Demo", models: [] }

vi.mock("@/stores/useConfigStore", () => ({
  useConfigStore: stubStore({
    providers: [provider],
    providersLoading: false,
    providersError: null,
    selectedProviderId: "demo",
    invalidateAllProviderCaches: vi.fn(),
    loadProviders,
    setSelectedProvider: vi.fn(),
    getModelMetadata: vi.fn(() => undefined),
  }),
}))
vi.mock("@/stores/useProjectsStore", () => ({ useProjectsStore: stubStore({ activeProjectId: null }) }))
vi.mock("@/stores/useUIStore", () => ({
  useUIStore: stubStore({
    hiddenModels: [] as string[],
    toggleHiddenModel: vi.fn(),
    hideAllModels: vi.fn(),
    showAllModels: vi.fn(),
  }),
}))

const { ProvidersPage } = await import("./ProvidersPage")

const OAUTH_METHODS = {
  demo: [
    { type: "api", label: "API key" },
    { type: "oauth", label: "OAuth first" },
    { type: "oauth", label: "OAuth second" },
  ],
}

describe("ProvidersPage OAuth flows", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    fetchAvailableProviders.mockReset().mockResolvedValue({ all: [], connected: [], default: {} })
    fetchCustomApiProviders.mockReset().mockResolvedValue([])
    upsertCustomApiProvider.mockReset()
    fetchProviderAuthMethods.mockReset()
    fetchProviderJsonWithRetry.mockReset()
    loadProviders.mockClear()
    openExternalUrl.mockReset()
    reloadAxCodeConfiguration.mockReset()
    reloadAxCodeConfiguration.mockResolvedValue(undefined)
    toastError.mockReset()
    toastMessage.mockReset()
    toastWarning.mockReset()
    fetchProviderAuthMethods.mockResolvedValue(OAUTH_METHODS)
    fetchProviderJsonWithRetry.mockResolvedValue({ url: "https://example.test/authorize" })
    const configState = (await import("@/stores/useConfigStore")).useConfigStore.getState() as unknown as {
      providers: unknown[]
      selectedProviderId: string
    }
    configState.providers = [provider]
    configState.selectedProviderId = "demo"
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  const renderPage = async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <ProvidersPage />
        </I18nProvider>,
      )
    })
  }

  const buttonByText = (label: string) =>
    Array.from(container.querySelectorAll("button")).find((button) => button.textContent === label)

  const revealAuthPanel = async () => {
    await act(async () => {
      buttonByText(dict["settings.providers.page.actions.reconnect"])?.click()
    })
  }

  const connectButtons = () =>
    Array.from(container.querySelectorAll("button")).filter(
      (button) => button.textContent === dict["settings.providers.page.actions.connect"],
    )

  const codeInputs = () =>
    container.querySelectorAll(
      `input[placeholder="${dict["settings.providers.page.auth.pasteAuthorizationCodePlaceholder"]}"]`,
    )

  const openTrustSetup = async () => {
    const state = (await import("@/stores/useConfigStore")).useConfigStore.getState()
    state.selectedProviderId = "__add_provider__"
    await renderPage()
    await act(async () => {
      buttonByText(dict["settings.providers.page.connect.type.api"])?.click()
    })
    const trust = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (item) => item.textContent?.trim() === "AX Trust",
    )
    expect(trust).toBeTruthy()
    await act(async () => {
      trust?.click()
    })
    await act(async () => {
      buttonByText(dict["settings.providers.page.connect.selectProviderPlaceholder"])?.click()
    })
  }

  test("offers AX Trust setup without any AX Trust runtime catalog entry", async () => {
    await openTrustSetup()
    const setup = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (item) => item.textContent?.trim() === "AX Trust",
    )
    expect(setup).toBeTruthy()
    await act(async () => {
      setup?.click()
    })
    expect(container.querySelector('input[placeholder="https://api.example.com/v1"]')).toBeTruthy()
    expect(container.querySelector('input[type="password"]')).toBeTruthy()

    const setInput = async (input: HTMLInputElement, value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value)
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })
    }
    await setInput(
      container.querySelector('input[placeholder="https://api.example.com/v1"]')!,
      "https://gateway.example/v1",
    )
    await setInput(container.querySelector('input[type="password"]')!, "fixture-token")
    upsertCustomApiProvider.mockRejectedValueOnce(new Error("Fixture discovery unavailable"))
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(upsertCustomApiProvider).toHaveBeenCalledWith(
      "gateway-example",
      expect.objectContaining({
        management: "ax-trust",
        baseURL: "https://gateway.example/v1",
        apiKey: "fixture-token",
      }),
      null,
    )
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Fixture discovery unavailable")
    upsertCustomApiProvider.mockResolvedValueOnce({
      providerID: "gateway-example",
      name: "gateway.example",
      management: "ax-trust",
      protocol: "openai-compatible",
      baseURL: "https://gateway.example/v1",
      hasApiKey: true,
      models: [],
    })
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(loadProviders).toHaveBeenCalledWith({ directory: null })
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  test("reuses an existing endpoint and token when connecting it as AX Trust", async () => {
    const existing = {
      providerID: "original-gateway",
      name: "Original Gateway",
      management: "custom-api",
      protocol: "anthropic-compatible",
      baseURL: "https://gateway.example/v1",
      hasApiKey: true,
      models: [],
    }
    fetchCustomApiProviders.mockResolvedValue([existing])
    upsertCustomApiProvider.mockResolvedValue({ ...existing, management: "ax-trust" })
    await openTrustSetup()
    const setup = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (item) => item.textContent?.trim() === "AX Trust",
    )
    await act(async () => {
      setup?.click()
    })
    const url = container.querySelector<HTMLInputElement>('input[placeholder="https://api.example.com/v1"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(url, existing.baseURL)
      url.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(upsertCustomApiProvider).toHaveBeenCalledWith(
      existing.providerID,
      expect.objectContaining({
        name: existing.name,
        protocol: existing.protocol,
        management: "ax-trust",
        baseURL: existing.baseURL,
      }),
      null,
    )
    expect(upsertCustomApiProvider.mock.calls[0]?.[1]).not.toHaveProperty("apiKey")
  })

  test("classifies hostname-derived AX Trust providers using persisted management metadata", async () => {
    fetchAvailableProviders.mockResolvedValue({ all: [{ id: "enterprise-gateway", name: "Enterprise Gateway" }] })
    fetchCustomApiProviders.mockResolvedValue([
      {
        providerID: "enterprise-gateway",
        name: "Enterprise Gateway",
        management: "ax-trust",
        protocol: "openai-compatible",
        baseURL: "https://gateway.example/v1",
        hasApiKey: true,
        models: [],
      },
    ])
    await openTrustSetup()
    expect(
      Array.from(document.querySelectorAll('[role="menuitem"]')).some((item) =>
        item.textContent?.includes("Enterprise Gateway"),
      ),
    ).toBe(true)
  })

  test("keeps a code field for every flow that was started", async () => {
    await renderPage()
    await revealAuthPanel()
    expect(connectButtons()).toHaveLength(2)

    await act(async () => {
      connectButtons()[0].click()
    })
    expect(codeInputs()).toHaveLength(1)

    // Starting the second method used to replace the first flow's pending slot, so the first provider's
    // paste field and Complete button disappeared although its URL and code were still on screen.
    await act(async () => {
      connectButtons()[1].click()
    })

    expect(codeInputs()).toHaveLength(2)
    expect(fetchProviderJsonWithRetry).toHaveBeenCalledTimes(2)
  })

  test("reloads the provider list after an OAuth completion whose reload fails", async () => {
    // The caches are dropped before the reload, which clears every project's provider list. Before this, a reload
    // that threw left the page showing an empty list with no error and no selection; the sibling API-key path
    // reloads the providers in its catch for exactly that reason.
    reloadAxCodeConfiguration.mockRejectedValue(new Error("reload refused"))
    await renderPage()
    await revealAuthPanel()
    await act(async () => {
      connectButtons()[0].click()
    })

    const complete = buttonByText(dict["settings.providers.page.actions.complete"])
    expect(complete).toBeTruthy()
    await act(async () => {
      complete?.click()
    })

    expect(reloadAxCodeConfiguration).toHaveBeenCalledTimes(1)
    expect(loadProviders).toHaveBeenCalled()
    expect(toastWarning).toHaveBeenCalled()
  })

  test("does not refetch providers after a reload that refreshed them", async () => {
    // The reload already loads the providers for the active directory; fetching them again afterwards doubles a
    // retrying read and keeps the Complete button disabled through both.
    await renderPage()
    await revealAuthPanel()
    await act(async () => {
      connectButtons()[0].click()
    })

    const complete = buttonByText(dict["settings.providers.page.actions.complete"])
    await act(async () => {
      complete?.click()
    })

    expect(reloadAxCodeConfiguration).toHaveBeenCalledTimes(1)
    expect(loadProviders).not.toHaveBeenCalled()
  })

  test("reads the providers back when the reload left the list empty", async () => {
    // The other half of the guard: a reload whose own refresh failed quietly leaves the list empty, and that is
    // exactly when the read-back has to run.
    await renderPage()
    await revealAuthPanel()
    await act(async () => {
      connectButtons()[0].click()
    })
    const configState = (await import("@/stores/useConfigStore")).useConfigStore.getState() as unknown as {
      providers: unknown[]
    }
    configState.providers = []

    const complete = buttonByText(dict["settings.providers.page.actions.complete"])
    await act(async () => {
      complete?.click()
    })

    expect(reloadAxCodeConfiguration).toHaveBeenCalledTimes(1)
    expect(loadProviders).toHaveBeenCalledTimes(1)
  })
})
