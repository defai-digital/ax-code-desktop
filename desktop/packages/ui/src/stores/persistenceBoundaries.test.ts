import { describe, expect, test } from "vitest"

// Adapt heterogeneous store APIs only in this shared behavioral probe; each merge receives its own live state.
interface RestoreProbe {
  getState: () => Record<string, unknown>
  persist: {
    getOptions: () => { merge?: (saved: unknown, current: Record<string, unknown>) => Record<string, unknown> }
  }
}
const stores = [
  ["queue", () => import("./messageQueueStore").then((m) => m.useMessageQueueStore)],
  ["permission", () => import("./permissionStore").then((m) => m.usePermissionStore)],
  ["activity", () => import("./useActivityFeedStore").then((m) => m.useActivityFeedStore)],
  ["team", () => import("./useAgentTeamStore").then((m) => m.useAgentTeamStore)],
  ["agents", () => import("./useAgentsStore").then((m) => m.useAgentsStore)],
  ["branch review", () => import("./useBranchReviewBaseStore").then((m) => m.useBranchReviewBaseStore)],
  ["commands", () => import("./useCommandsStore").then((m) => m.useCommandsStore)],
  ["config", () => import("./useConfigStore-impl").then((m) => m.useConfigStore)],
  ["files", () => import("./useFilesViewTabsStore").then((m) => m.useFilesViewTabsStore)],
  ["pull requests", () => import("./useGitHubPrStatusStore").then((m) => m.useGitHubPrStatusStore)],
  ["identities", () => import("./useGitIdentitiesStore").then((m) => m.useGitIdentitiesStore)],
  ["inline drafts", () => import("./useInlineCommentDraftStore").then((m) => m.useInlineCommentDraftStore)],
  ["MCP", () => import("./useMcpConfigStore").then((m) => m.useMcpConfigStore)],
  ["repository hints", () => import("./useRepositoryHintStore").then((m) => m.useRepositoryHintStore)],
  ["review progress", () => import("./useReviewProgressStore").then((m) => m.useReviewProgressStore)],
  ["review threads", () => import("./useReviewThreadStore").then((m) => m.useReviewThreadStore)],
  ["session display", () => import("./useSessionDisplayStore").then((m) => m.useSessionDisplayStore)],
  ["skills", () => import("./useSkillsStore").then((m) => m.useSkillsStore)],
  ["terminal", () => import("./useTerminalStore").then((m) => m.useTerminalStore)],
  ["todos", () => import("./useTodosPersistStore").then((m) => m.useTodosPersistStore)],
  ["UI", () => import("./useUIStore-impl").then((m) => m.useUIStore)],
  ["work mode", () => import("./useWorkModeStore").then((m) => m.useWorkModeStore)],
] as const

describe("persisted data/action boundary", () => {
  test.each(stores)("%s ignores stored actions and unknown fields", async (_name, load) => {
    const store = (await load()) as unknown as RestoreProbe
    const current = store.getState()
    const actions = Object.entries(current).filter(([, value]) => typeof value === "function")
    expect(actions.length).toBeGreaterThan(0)
    const saved = Object.fromEntries(actions.map(([key]) => [key, "legacy JSON field"]))
    saved.__staleRestoreMarker = "not declared as persisted data"
    const merge = store.persist.getOptions().merge ?? ((value, state) => ({ ...state, ...(value as object) }))
    const restored = merge(saved, current)
    for (const [key, action] of actions) expect(restored[key], key).toBe(action)
    expect(restored).not.toHaveProperty("__staleRestoreMarker")
  })
  test.each(stores)("%s preserves live state when there is no saved snapshot", async (_name, load) => {
    const store = (await load()) as unknown as RestoreProbe
    const current = store.getState()
    const merge = store.persist.getOptions().merge
    expect(merge?.(undefined, current)).toBe(current)
  })
  test.each(stores)("%s ignores an unrelated snapshot without changing live state", async (_name, load) => {
    const store = (await load()) as unknown as RestoreProbe
    const current = store.getState()
    expect(store.persist.getOptions().merge?.({ unrelatedLegacyValue: 42 }, current)).toBe(current)
  })
})

test("UI restores preferences without reviving transient navigation, dialogs or malformed collections", async () => {
  const { useUIStore } = await import("./useUIStore-impl")
  const current = useUIStore.getState()
  const restored = useUIStore.persist.getOptions().merge?.(
    {
      activeMainTab: "git",
      isSettingsDialogOpen: true,
      isSessionCreateDialogOpen: true,
      isSessionSwitcherOpen: true,
      sidebarWidth: "wide",
      favoriteModels: [null, { providerID: "p", modelID: "m" }, { providerID: 42 }],
      notificationTemplates: { completion: null },
    },
    current,
  )
  expect(restored?.activeMainTab).toBe(current.activeMainTab)
  expect(restored?.isSettingsDialogOpen).toBe(current.isSettingsDialogOpen)
  expect(restored?.isSessionCreateDialogOpen).toBe(false)
  expect(restored?.isSessionSwitcherOpen).toBe(false)
  expect(restored?.sidebarWidth).toBe(current.sidebarWidth)
  expect(restored?.favoriteModels).toEqual([{ providerID: "p", modelID: "m" }])
  expect(restored?.notificationTemplates.completion).toEqual(current.notificationTemplates.completion)
})

test("Config restores valid directory choices without restoring server metadata or the previous active directory", async () => {
  const { useConfigStore } = await import("./useConfigStore-impl")
  const current = useConfigStore.getState()
  const payload = {
    activeDirectoryKey: "/foreign",
    providers: [{ id: "stale" }],
    modelsMetadata: {},
    directoryScoped: {
      "/bad": null,
      "/chosen": {
        currentProviderId: "p",
        currentModelId: "m",
        selectionSource: "manual",
        providers: [{ id: "stale" }],
        agents: ["retired"],
        agentModelSelections: { good: { providerId: "p", modelId: "m" }, bad: 42 },
        defaultProviders: { good: "m", bad: 42 },
      },
    },
  }
  const merge = useConfigStore.persist.getOptions().merge ?? ((saved, state) => ({ ...state, ...(saved as object) }))
  const restored = merge(payload, current)
  expect(restored.activeDirectoryKey).toBe(current.activeDirectoryKey)
  expect(restored.providers).toBe(current.providers)
  expect(restored.modelsMetadata).toBe(current.modelsMetadata)
  expect(restored.directoryScoped["/bad"]).toBeUndefined()
  expect(restored.directoryScoped["/chosen"]).toMatchObject({
    currentProviderId: "p",
    currentModelId: "m",
    selectionSource: "manual",
    providers: [],
    agentModelSelections: { good: { providerId: "p", modelId: "m" } },
    defaultProviders: { good: "m" },
  })
  expect(restored.directoryScoped["/chosen"]).not.toHaveProperty("agents")
})

test("Config migration accepts malformed old directory snapshots without throwing", async () => {
  const { useConfigStore } = await import("./useConfigStore-impl")
  const migrate = useConfigStore.persist.getOptions().migrate
  await expect(Promise.resolve().then(() => migrate?.({ directoryScoped: { "/bad": null } }, 0))).resolves.toBeDefined()
})

test("activating a directory with no saved selection clears the previous project's variant", async () => {
  const { useConfigStore } = await import("./useConfigStore-impl")
  const current = useConfigStore.getState()
  try {
    useConfigStore.setState({ currentVariant: "previous-project-effort", directoryScoped: {} })
    await useConfigStore.getState().activateDirectory("/brand-new-restore-test")
    expect(useConfigStore.getState().currentVariant).toBeUndefined()
  } finally {
    useConfigStore.setState(current)
  }
})

test("malformed cached PR fields cannot reach rendering or suppress a fresh read", async () => {
  const { useGitHubPrStatusStore } = await import("./useGitHubPrStatusStore")
  const current = useGitHubPrStatusStore.getState()
  const restored = useGitHubPrStatusStore.persist.getOptions().merge?.(
    {
      entries: {
        bad: {
          status: {
            connected: true,
            pr: {
              number: 1,
              title: {},
              url: "https://example.com/pull/1",
              state: "open",
              draft: false,
              base: "main",
              head: "feature",
            },
          },
          lastRefreshAt: "future",
          lastDiscoveryPollAt: 42,
          isInitialStatusResolved: true,
          identity: { directory: 42, branch: "feature", remoteName: null },
          watchers: 99,
          params: { credential: "not restored" },
        },
      },
    },
    current,
  )
  expect(restored?.entries.bad.status).toBeNull()
  expect(restored?.entries.bad.isInitialStatusResolved).toBe(false)
  expect(restored?.entries.bad.lastRefreshAt).toBe(0)
  expect(restored?.entries.bad.identity).toBeNull()
  expect(restored?.entries.bad.watchers).toBe(0)
  expect(restored?.entries.bad.params).toBeNull()
})

test.each([
  ["agents", "selectedAgentName"],
  ["commands", "selectedCommandName"],
  ["skills", "selectedSkillName"],
  ["identities", "selectedProfileId"],
  ["MCP", "selectedMcpName"],
])("%s restores only its nullable editor selection", async (name, key) => {
  const entry = stores.find(([storeName]) => storeName === name)
  if (!entry) throw new Error("Missing selection store")
  const store = (await entry[1]()) as unknown as RestoreProbe
  const current = store.getState()
  const merge = store.persist.getOptions().merge!
  const selected = merge(
    { [key]: "opaque selection ", isLoading: true, providers: [{ private: "not restored" }] },
    current,
  )
  expect(selected).toEqual({ ...current, [key]: "opaque selection " })
  expect(merge({ [key]: null }, current)[key]).toBeNull()
  expect(merge({ [key]: 42 }, current)[key]).toBe(current[key])
})

test("current-version inline draft restore rejects unscoped and malformed rows", async () => {
  const { useInlineCommentDraftStore } = await import("./useInlineCommentDraftStore")
  const draft = {
    id: "kept",
    sessionKey: "ses_kept",
    source: "file",
    fileLabel: "file.ts ",
    startLine: 1,
    endLine: 2,
    code: "code",
    text: "Keep this draft",
    language: "ts",
    createdAt: 1,
  }
  const restored = useInlineCommentDraftStore.persist.getOptions().merge?.(
    {
      drafts: {
        ses_kept: [draft, null, { ...draft, sessionKey: "foreign" }],
        draft: [{ ...draft, sessionKey: "draft" }],
        malformed: "bad",
      },
    },
    useInlineCommentDraftStore.getState(),
  )
  expect(restored?.drafts).toEqual({ ses_kept: [expect.objectContaining(draft)] })
})

test("repository hints validate row shapes and retain only the last 200 folders", async () => {
  const { useRepositoryHintStore, isChildHintDismissed } = await import("./useRepositoryHintStore")
  const children = Object.fromEntries(Array.from({ length: 205 }, (_, index) => [`/repo-${index}`, ["kept", 42]]))
  const restored = useRepositoryHintStore.persist
    .getOptions()
    .merge?.(
      { dismissedChildren: children, dismissedParent: { "/bad": 42, "/good": "/parent" } },
      useRepositoryHintStore.getState(),
    )
  expect(Object.keys(restored?.dismissedChildren ?? {})).toHaveLength(200)
  expect(restored?.dismissedChildren["/repo-0"]).toBeUndefined()
  expect(restored?.dismissedChildren["/repo-204"]).toEqual(["kept"])
  expect(restored?.dismissedParent).toEqual({ "/good": "/parent" })
  expect(isChildHintDismissed(restored!.dismissedChildren, "/repo-204", ["kept"])).toBe(true)
})

test("session display validates persisted booleans and leaves its focus counter live", async () => {
  const { useSessionDisplayStore } = await import("./useSessionDisplayStore")
  const current = useSessionDisplayStore.getState()
  const restored = useSessionDisplayStore.persist
    .getOptions()
    .merge?.(
      { displayMode: "future", showRecentSection: false, showScheduledSection: "false", scheduledRevealRequest: 99 },
      current,
    )
  expect(restored).toMatchObject({
    displayMode: current.displayMode,
    showRecentSection: false,
    showScheduledSection: current.showScheduledSection,
    scheduledRevealRequest: current.scheduledRevealRequest,
  })
})

test("a future persisted PR refresh timestamp cannot suppress revalidation after a clock change", async () => {
  const { useGitHubPrStatusStore } = await import("./useGitHubPrStatusStore")
  const future = Date.now() + 86_400_000
  const restored = useGitHubPrStatusStore.persist.getOptions().merge?.(
    {
      entries: {
        future: {
          status: { connected: true, pr: null },
          isInitialStatusResolved: true,
          lastRefreshAt: future,
          lastDiscoveryPollAt: future,
        },
      },
    },
    useGitHubPrStatusStore.getState(),
  )
  expect(restored?.entries.future.lastRefreshAt).toBe(0)
  expect(restored?.entries.future.lastDiscoveryPollAt).toBe(0)
})
