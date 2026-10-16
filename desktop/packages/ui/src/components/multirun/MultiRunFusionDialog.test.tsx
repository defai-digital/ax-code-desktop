import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"

type SessionStub = { id: string; title: string; time?: { created?: number; updated?: number } }

// `useAllLiveSessions` is re-read on every render, so the test mutates this array
// in place to simulate live session updates arriving from the sync layer.
const { liveSessions } = vi.hoisted(() => ({ liveSessions: { current: [] as SessionStub[] } }))

vi.mock("@/components/ui", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open = true }: React.PropsWithChildren<{ open?: boolean }>) => (open ? <>{children}</> : null),
  DialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogDescription: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  DialogFooter: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
}))

vi.mock("@/components/icon/Icon", () => ({ Icon: ({ name }: { name: string }) => <i data-icon={name} /> }))
vi.mock("@/components/ui/ProviderLogo", () => ({ ProviderLogo: () => null }))
vi.mock("./AgentSelector", () => ({ AgentSelector: () => null }))
vi.mock("./ModelMultiSelect", () => ({
  ModelMultiSelect: () => null,
  generateInstanceId: () => "instance-1",
}))

vi.mock("@/lib/ax-code/client", () => ({
  axCodeClient: {
    getDirectory: () => undefined,
    getSdkClient: () => ({}),
    withDirectory: (_directory: unknown, fn: () => unknown) => fn(),
    sendMessage: vi.fn(),
  },
}))
vi.mock("@/sync/sync-context", () => ({ useAllLiveSessions: () => liveSessions.current }))
vi.mock("@/sync/sync-refs", () => ({ getSyncMessages: () => [], getSyncParts: () => [] }))

vi.mock("@/stores/useGlobalSessionsStore", () => {
  const state = { activeSessions: [] as SessionStub[], archivedSessions: [] as SessionStub[] }
  const useGlobalSessionsStore = ((selector?: (value: typeof state) => unknown) =>
    selector ? selector(state) : state) as unknown as {
    (selector?: (value: typeof state) => unknown): unknown
    getState: () => typeof state
  }
  useGlobalSessionsStore.getState = () => state
  return { useGlobalSessionsStore, resolveGlobalSessionDirectory: () => null }
})

vi.mock("@/stores/useConfigStore", () => {
  const state = {
    providers: [] as { id: string; models: { id: string }[] }[],
    currentProviderId: undefined as string | undefined,
    currentModelId: undefined as string | undefined,
    currentAgentName: undefined as string | undefined,
  }
  const useConfigStore = ((selector?: (value: typeof state) => unknown) =>
    selector ? selector(state) : state) as unknown as {
    (selector?: (value: typeof state) => unknown): unknown
    getState: () => typeof state
  }
  useConfigStore.getState = () => state
  return { useConfigStore }
})

vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: {
    getState: () => ({
      getDirectoryForSession: () => null,
      getWorktreeMetadata: () => undefined,
      createSession: vi.fn(),
      setCurrentSession: vi.fn(),
    }),
  },
}))

const { MultiRunFusionDialog } = await import("./MultiRunFusionDialog")

const sourceRowTitles = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('[data-icon="close"]')).map(
    (icon) => icon.closest("div")?.querySelector("span")?.textContent ?? "",
  )

const excludeButtons = (container: HTMLElement): HTMLButtonElement[] =>
  Array.from(container.querySelectorAll('[data-icon="close"]')).flatMap((icon) => {
    const button = icon.closest("button")
    return button ? [button] : []
  })

describe("MultiRunFusionDialog excluded sources", () => {
  let container: HTMLDivElement
  let root: Root
  let primary: SessionStub
  let sibling: SessionStub
  let onOpenChange: (open: boolean) => void

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    primary = { id: "s1", title: "demo/p1/m1/1", time: { created: 1 } }
    sibling = { id: "s2", title: "demo/p2/m2/2", time: { created: 2 } }
    liveSessions.current = [primary, sibling]
    onOpenChange = vi.fn()
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
          <MultiRunFusionDialog session={primary as never} open={open} onOpenChange={onOpenChange} />
        </I18nProvider>,
      )
    })
  }

  test("a source excluded by the user stays excluded when live sessions update", () => {
    renderDialog(true)
    expect(sourceRowTitles(container)).toHaveLength(2)

    act(() => excludeButtons(container)[1].click())
    expect(sourceRowTitles(container)).toHaveLength(1)

    // Any session event replaces the live session array; the dismissed source must not
    // reappear (and must not silently re-enter the fusion prompt).
    liveSessions.current = [primary, { ...sibling, time: { created: 2, updated: 99 } }]
    renderDialog(true)

    expect(sourceRowTitles(container)).toHaveLength(1)
  })

  test("closing the dialog clears exclusions for the next open", () => {
    renderDialog(true)
    act(() => excludeButtons(container)[1].click())
    expect(sourceRowTitles(container)).toHaveLength(1)

    renderDialog(false)
    renderDialog(true)

    expect(sourceRowTitles(container)).toHaveLength(2)
  })
})
