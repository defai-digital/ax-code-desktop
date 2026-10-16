import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"

const { fetchProviderAuthMethods, fetchProviderJsonWithRetry, openExternalUrl, toastMessage } = vi.hoisted(() => ({
  fetchProviderAuthMethods: vi.fn(),
  fetchProviderJsonWithRetry: vi.fn(),
  openExternalUrl: vi.fn(),
  toastMessage: vi.fn(),
}))

vi.mock("@/lib/ax-code/providerApi", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ax-code/providerApi")>("@/lib/ax-code/providerApi")
  return {
    ...actual,
    fetchProviderAuthMethods,
    fetchProviderJsonWithRetry,
    fetchAvailableProviders: vi.fn(async () => []),
    fetchProviderSources: vi.fn(async () => ({
      auth: { exists: false },
      user: { exists: false },
      project: { exists: false },
    })),
    fetchCustomApiProviders: vi.fn(async () => []),
  }
})

vi.mock("@/lib/url", () => ({ openExternalUrl }))
vi.mock("@/lib/clipboard", () => ({ copyTextToClipboard: vi.fn(async () => true) }))
vi.mock("@/components/ui", () => ({
  toast: { message: toastMessage, success: vi.fn(), error: vi.fn() },
}))

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
    loadProviders: vi.fn(async () => {}),
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

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    fetchProviderAuthMethods.mockReset()
    fetchProviderJsonWithRetry.mockReset()
    openExternalUrl.mockReset()
    toastMessage.mockReset()
    fetchProviderAuthMethods.mockResolvedValue(OAUTH_METHODS)
    fetchProviderJsonWithRetry.mockResolvedValue({ url: "https://example.test/authorize" })
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
})
