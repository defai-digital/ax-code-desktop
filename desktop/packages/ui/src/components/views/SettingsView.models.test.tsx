import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { loadDictionary, useI18nStore } from "@/lib/i18n/store"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useUIStore } from "@/stores/useUIStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { axCodeClient } from "@/lib/ax-code/client"
import { useRouter } from "@/hooks/useRouter"
import { useSkillsStore } from "@/stores/useSkillsStore"
import { SettingsView } from "./SettingsView"

const viewport = vi.hoisted(() => ({ mobile: false }))
vi.mock("@/lib/device", async (original) => {
  const device = await original<typeof import("@/lib/device")>()
  return { ...device, useDeviceInfo: () => ({ ...device.useDeviceInfo(), isMobile: viewport.mobile }) }
})
vi.mock("@/components/sections/skills/SkillsSidebar", async () => {
  const { useSkillsStore } = await import("@/stores/useSkillsStore")
  const select = (name: string, onItemSelect?: () => void) => () => {
    useSkillsStore.getState().setSelectedSkill(name)
    onItemSelect?.()
  }
  return {
    SkillsSidebar: ({ onItemSelect, onOpenCatalog }: { onItemSelect?: () => void; onOpenCatalog?: () => void }) => (
      <>
        <button onClick={select("alpha", onItemSelect)}>Example skill</button>
        <button onClick={select("beta", onItemSelect)}>Other skill</button>
        <button onClick={onOpenCatalog}>Example catalog</button>
      </>
    ),
  }
})
vi.mock("@/components/sections/commands/CommandsSidebar", () => ({
  CommandsSidebar: ({ onItemSelect }: { onItemSelect?: () => void }) => (
    <button onClick={() => onItemSelect?.()}>Example command</button>
  ),
}))
vi.mock("@/components/sections/skills/SkillsPage", () => ({
  SkillsPage: ({ view, onShowInstalled }: { view: string; onShowInstalled?: () => void }) => (
    <div data-test-skills-pane={view}>
      {view === "catalog" ? <button onClick={onShowInstalled}>Catalog back</button> : null}
    </div>
  ),
}))

let container: HTMLDivElement
let root: Root
let supported: boolean
let attached: boolean
let failed: boolean
let pending: Promise<Response> | null
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input)
  if (url.includes("/provider/ax-engine/models")) {
    // Directory updates can overlap requests; each fetch must receive its own readable body.
    if (pending) return (await pending).clone()
    if (failed) return json({ error: "Runtime unavailable" }, 500)
    return json({
      eligibility: { supported, platform: supported ? "darwin" : "linux", arch: "arm64", blockers: [], warnings: [] },
      dependency: { available: false, blockers: [], warnings: [] },
      server: { running: false, ready: false, blockers: [] },
      diskRoot: { path: "/cache", blockers: [] },
      models: [],
      jobs: [],
    })
  }
  if (url.includes("/provider/ax-engine/connection"))
    return json({
      mode: attached ? "attach" : "managed",
      baseURL: "http://localhost:31418/v1",
      ready: false,
      models: [],
      toolcall: false,
      hasApiKey: false,
    })
  return json({})
})
const flush = async () => {
  for (let i = 0; i < 6; i++)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
}
const render = async () => {
  await act(async () =>
    root.render(
      <I18nProvider>
        <TooltipProvider>
          <SettingsView isWindowed />
        </TooltipProvider>
      </I18nProvider>,
    ),
  )
  await flush()
}
const navButton = (label: string) =>
  [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === label)
const previous = {
  page: useUIStore.getState().settingsPage,
  open: useUIStore.getState().isSettingsDialogOpen,
  project: useProjectsStore.getState().activeProjectId,
  directory: axCodeClient.getDirectory(),
}

beforeEach(() => {
  viewport.mobile = false
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  supported = false
  attached = false
  failed = false
  pending = null
  fetchMock.mockClear()
  vi.stubGlobal("fetch", fetchMock)
  useUIStore.setState({ settingsPage: "home" })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

// The app's router, which pushes a history entry for every settings page change, and Settings shown only while open.
const RoutedSettings = () => {
  useRouter()
  const open = useUIStore((state) => state.isSettingsDialogOpen)
  return open ? <SettingsView isWindowed /> : null
}
const renderRouted = async () => {
  await act(async () =>
    root.render(
      <I18nProvider>
        <TooltipProvider>
          <RoutedSettings />
        </TooltipProvider>
      </I18nProvider>,
    ),
  )
  await flush()
}
// A real history traversal: popstate arrives on its own task after back() or forward().
const traverse = async (direction: "back" | "forward") => {
  const popped = new Promise<void>((resolve) => window.addEventListener("popstate", () => resolve(), { once: true }))
  window.history[direction]()
  await act(async () => popped)
  await flush()
}
const skillsPane = () => container.querySelector("[data-test-skills-pane]")?.getAttribute("data-test-skills-pane")
const originalLoadSkills = useSkillsStore.getState().loadSkills
const withMobileHistory = async (run: () => Promise<void>) => {
  viewport.mobile = true
  useUIStore.setState({ settingsPage: "skills.installed", isSettingsDialogOpen: false })
  useSkillsStore.setState({
    selectedSkillName: null,
    skills: [{ name: "alpha" }, { name: "beta" }, { name: "alpha-renamed" }] as never,
    isLoading: false,
    skillDraft: null,
    // The page loads skills on open; this fixture's fetch has none, which would empty the seeded list.
    loadSkills: async () => true,
  })
  const previousHistory = window.history.state
  const previousHref = window.location.href
  try {
    await renderRouted()
    // Opened through the store, so the router writes the Settings route into history.
    await act(async () => useUIStore.setState({ isSettingsDialogOpen: true }))
    await flush()
    expect(new URL(window.location.href).searchParams.get("settings")).toBe("skills.installed")
    await run()
  } finally {
    act(() => root.unmount())
    root = createRoot(container)
    window.history.replaceState(previousHistory, "", previousHref)
    useUIStore.setState({ isSettingsDialogOpen: previous.open })
    useSkillsStore.setState({ loadSkills: originalLoadSkills })
  }
}

test.each(["installed", "catalog"] as const)(
  "mobile Back from a sibling page returns to the Skills %s detail it was opened from",
  async (pane) =>
    withMobileHistory(async () => {
      await act(async () => navButton(pane === "catalog" ? "Example catalog" : "Example skill")!.click())
      expect(skillsPane()).toBe(pane)
      await act(async () => navButton("Commands")!.click())
      expect(useUIStore.getState().settingsPage).toBe("commands")

      await traverse("back")

      expect(useUIStore.getState().isSettingsDialogOpen).toBe(true)
      expect(useUIStore.getState().settingsPage).toBe("skills.installed")
      expect(skillsPane()).toBe(pane)

      await traverse("forward")

      expect(useUIStore.getState().settingsPage).toBe("commands")
    }),
)

test("the catalog's own Back button is what history returns to", async () =>
  withMobileHistory(async () => {
    await act(async () => navButton("Example catalog")!.click())
    await act(async () => navButton("Catalog back")!.click())
    expect(skillsPane()).toBe("installed")
    await act(async () => navButton("Commands")!.click())

    await traverse("back")

    expect(useUIStore.getState().settingsPage).toBe("skills.installed")
    expect(skillsPane()).toBe("installed")

    // One detail entry: the next Back reaches the Skills list.
    await traverse("back")

    expect(skillsPane()).toBeUndefined()
    expect(navButton("Example skill")).toBeDefined()
  }))

test("history returns to the skill its detail showed, not the one selected since", async () =>
  withMobileHistory(async () => {
    await act(async () => navButton("Example skill")!.click())
    await act(async () => navButton("Commands")!.click())
    await act(async () => navButton("Skills")!.click())
    await act(async () => navButton("Other skill")!.click())
    expect(useSkillsStore.getState().selectedSkillName).toBe("beta")

    // Back through the second detail, the Skills list and Commands to the first detail.
    await traverse("back")
    await traverse("back")
    await traverse("back")

    expect(useUIStore.getState().settingsPage).toBe("skills.installed")
    expect(skillsPane()).toBe("installed")
    expect(useSkillsStore.getState().selectedSkillName).toBe("alpha")
  }))

test("a detail whose skill was deleted returns to the Skills list, also when no skill is left", async () =>
  withMobileHistory(async () => {
    await act(async () => navButton("Example skill")!.click())
    await act(async () => navButton("Commands")!.click())
    // The list loaded again without the skill, and without any skill at all.
    useSkillsStore.setState({ skills: [], isLoading: false })

    await traverse("back")

    expect(useUIStore.getState().settingsPage).toBe("skills.installed")
    expect(skillsPane()).toBeUndefined()
    expect(navButton("Example skill")).toBeDefined()
  }))

test("history returns to the skill a save renamed while its detail was open", async () =>
  withMobileHistory(async () => {
    await act(async () => navButton("Example skill")!.click())
    // Saving the skill under another name selects it under that name.
    await act(async () => useSkillsStore.getState().setSelectedSkill("alpha-renamed"))
    await act(async () => navButton("Commands")!.click())
    useSkillsStore.getState().setSelectedSkill("beta")

    await traverse("back")

    expect(skillsPane()).toBe("installed")
    expect(useSkillsStore.getState().selectedSkillName).toBe("alpha-renamed")
  }))

test("Settings reopened by history on a detail entry shows that detail", async () =>
  withMobileHistory(async () => {
    await act(async () => navButton("Example catalog")!.click())
    // Closing Settings unmounts the view; Back returns to the catalog's entry and the router reopens Settings.
    await act(async () => useUIStore.setState({ isSettingsDialogOpen: false }))
    await flush()
    expect(container.querySelector("[data-settings-navigation]")).toBeNull()

    await traverse("back")

    expect(useUIStore.getState().isSettingsDialogOpen).toBe(true)
    expect(skillsPane()).toBe("catalog")
  }))

test("Back to Settings after history restored a Skills detail stays on the settings list", async () =>
  withMobileHistory(async () => {
    await act(async () => navButton("Example skill")!.click())
    await act(async () => navButton("Commands")!.click())
    await traverse("back")
    await traverse("back")
    expect(navButton("Example skill")).toBeDefined()

    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Back to Settings"]')!.click())
    await flush()

    expect(container.querySelector("[data-settings-navigation]")).not.toBeNull()
    expect(navButton("Example skill")).toBeUndefined()
  }))

const DETAIL_KEY = "__openchamberSettingsDetail"
const detailMarker = () => (window.history.state as Record<string, unknown> | null)?.[DETAIL_KEY]
// List loads the test settles by hand, all at once: `true` once they loaded, `false` when they failed.
const deferSkillsLoad = () => {
  const pendingLoads: Array<(loaded: boolean) => void> = []
  useSkillsStore.setState({
    loadSkills: () => new Promise<boolean>((resolve) => pendingLoads.push(resolve)),
  })
  return (loaded: boolean) =>
    act(async () => {
      expect(pendingLoads.length).toBeGreaterThan(0)
      pendingLoads.splice(0).forEach((resolve) => resolve(loaded))
    })
}

test("a restored detail whose skill a later load no longer lists falls back to the list and leaves history", async () =>
  withMobileHistory(async () => {
    await act(async () => navButton("Example skill")!.click())
    await act(async () => navButton("Commands")!.click())
    const settle = deferSkillsLoad()

    await traverse("back")
    // Still loading: the list cannot say yet that the skill is gone.
    expect(skillsPane()).toBe("installed")
    expect(useSkillsStore.getState().selectedSkillName).toBe("alpha")

    useSkillsStore.setState({ skills: [{ name: "beta" }] as never })
    await settle(true)
    await flush()

    expect(skillsPane()).toBeUndefined()
    expect(navButton("Example skill")).toBeDefined()
    expect(useSkillsStore.getState().selectedSkillName).toBeNull()
    // The entry is the list's now, so Back and Forward do not land on the missing detail again.
    expect(detailMarker()).toBeUndefined()
  }))

test("a restored detail stays when the list failed to load", async () =>
  withMobileHistory(async () => {
    await act(async () => navButton("Example skill")!.click())
    await act(async () => navButton("Commands")!.click())
    const settle = deferSkillsLoad()

    await traverse("back")
    // A failed load put back what it had, which says nothing about the skill.
    useSkillsStore.setState({ skills: [] as never })
    await settle(false)
    await flush()

    expect(skillsPane()).toBe("installed")
    expect(useSkillsStore.getState().selectedSkillName).toBe("alpha")
  }))

test.each([
  ["of that skill keeps its detail", "alpha", "installed"],
  ["of another skill does not keep a deleted skill's detail", "unsaved", undefined],
] as const)("a draft %s", async (_label, draftName, pane) =>
  withMobileHistory(async () => {
    await act(async () => navButton("Example skill")!.click())
    await act(async () => navButton("Commands")!.click())
    useSkillsStore.setState({ skills: [] as never, skillDraft: { name: draftName } as never })

    await traverse("back")

    expect(skillsPane()).toBe(pane)
    useSkillsStore.setState({ skillDraft: null })
  }),
)

test("a detail that showed no skill restores no skill, not the one selected since", async () =>
  withMobileHistory(async () => {
    // The catalog's Back makes an installed entry with nothing selected.
    await act(async () => navButton("Example catalog")!.click())
    await act(async () => navButton("Catalog back")!.click())
    await act(async () => navButton("Commands")!.click())
    await act(async () => navButton("Skills")!.click())
    await act(async () => navButton("Other skill")!.click())

    // Back through beta's detail, the Skills list and Commands to the empty detail.
    await traverse("back")
    await traverse("back")
    await traverse("back")

    expect(skillsPane()).toBe("installed")
    expect(useSkillsStore.getState().selectedSkillName).toBeNull()
    // The entry still names no skill: following the selection did not rewrite it to beta.
    expect(detailMarker()).toMatchObject({ skillName: null })
  }))

test("Back to a Skills page entry from a sibling page's detail shows the Skills list", async () =>
  withMobileHistory(async () => {
    expect(navButton("Example skill")).toBeDefined()
    await act(async () => navButton("Commands")!.click())
    await act(async () => navButton("Example command")!.click())
    expect(navButton("Example command")).toBeUndefined()

    await traverse("back")

    // The Skills entry carries no detail: it opens at the Skills list, not at the Commands detail's stage.
    expect(useUIStore.getState().settingsPage).toBe("skills.installed")
    expect(skillsPane()).toBeUndefined()
    expect(navButton("Example skill")).toBeDefined()
  }))

test("selecting an installed skill on mobile opens its detail after returning from the catalog", async () => {
  viewport.mobile = true
  useUIStore.setState({ settingsPage: "skills.installed" })
  const previousHistory = window.history.state
  try {
    await render()
    await act(async () => navButton("Example catalog")!.click())
    expect(container.querySelector('[data-test-skills-pane="catalog"]')).not.toBeNull()
    await act(async () => window.dispatchEvent(new PopStateEvent("popstate", { state: null })))
    expect(navButton("Example skill")).toBeDefined()

    await act(async () => navButton("Example skill")!.click())

    expect(container.querySelector('[data-test-skills-pane="installed"]')).not.toBeNull()
  } finally {
    window.history.replaceState(previousHistory, "")
  }
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  useUIStore.setState({ settingsPage: previous.page, isSettingsDialogOpen: previous.open })
  useProjectsStore.setState({ activeProjectId: previous.project })
  axCodeClient.setDirectory(previous.directory ?? undefined)
  vi.unstubAllGlobals()
})

test("hides only Local Models on a confirmed unsupported runtime and keeps direct links explanatory", async () => {
  await render()
  expect(navButton("Local Models")).toBeUndefined()
  expect(navButton("Providers")).toBeDefined()
  await act(async () => useUIStore.setState({ settingsPage: "models" }))
  await flush()
  expect(container.textContent).toContain("Local models are unavailable on this host")
  expect(navButton("Open Providers")).toBeDefined()
  // Opening the page reuses the same host check rather than starting a second catalog scan.
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/ax-engine/models"))).toHaveLength(1)
})

test("grouped navigation stays stable through page selection, search and clear", async () => {
  supported = true
  await render()
  const inventory = () => [...container.querySelectorAll('[data-settings-group]')].map(group => ({
    id: group.getAttribute("data-settings-group"),
    pages: [...group.querySelectorAll("button")].map(button => button.textContent?.trim()),
  }))
  const baseline = inventory()
  expect(baseline).toEqual([
    { id: "general", pages: ["Appearance", "Sessions", "Shortcuts"] },
    { id: "projects", pages: ["Projects"] },
    { id: "models", pages: ["Providers", "Local Models"] },
    { id: "coding", pages: ["Agents", "Commands", "MCP"] },
  ])
  await act(async () => navButton("Appearance")?.click())
  await flush()
  // Chat shares the Appearance entry and is one tab away.
  const tabs = () => [...container.querySelectorAll('[data-settings-family-tabs] button')]
  expect(tabs().map(tab => [tab.textContent, tab.getAttribute("aria-current")])).toEqual([
    ["Appearance", "page"], ["Chat", null],
  ])
  await act(async () => (tabs()[1] as HTMLElement).click())
  await flush()
  expect(useUIStore.getState().settingsPage).toBe("chat")
  expect(container.querySelector('[data-settings-group="general"] [aria-current="page"]')?.textContent).toBe("Appearance")
  expect(inventory()).toEqual(baseline)
  const search = container.querySelector<HTMLInputElement>('[data-settings-navigation] input')!
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
  const filter = async (query: string) => {
    await act(async () => { setValue.call(search, query); search.dispatchEvent(new Event("input", { bubbles: true })) })
    await flush()
  }
  // A search lists every page, so nothing hides behind a tab.
  await filter("coding")
  expect(inventory()).toEqual([{ id: "coding", pages: ["Agents", "Behavior", "Hooks", "Commands", "Skills", "MCP"] }])
  expect(useUIStore.getState().settingsPage).toBe("chat")
  await act(async () => navButton("Hooks")?.click())
  await flush()
  expect(useUIStore.getState().settingsPage).toBe("hooks")
  await filter("")
  expect(inventory()).toEqual(baseline)
  expect(container.querySelector('[data-settings-group="coding"] [aria-current="page"]')?.textContent).toBe("Agents")
  expect(container.querySelector('[data-settings-family-tabs] [aria-current="page"]')?.textContent).toBe("Hooks")
  for (const group of container.querySelectorAll('[data-settings-group]')) {
    expect(document.getElementById(group.getAttribute("aria-labelledby")!)?.tagName).toBe("H2")
  }
})

test("translated Coding group search finds the same destinations", async () => {
  const original = useI18nStore.getState()
  try {
    const dictionary = await loadDictionary("zh-TW")
    await act(async () => useI18nStore.setState({ locale: "zh-TW", dictionary }))
    await render()
    const search = container.querySelector<HTMLInputElement>('[data-settings-navigation] input')!
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
    await act(async () => { setValue.call(search, dictionary["settings.view.nav.group.coding"]); search.dispatchEvent(new Event("input", { bubbles: true })) })
    await flush()
    const groups = container.querySelectorAll('[data-settings-group]')
    expect(groups).toHaveLength(1)
    expect(groups[0].getAttribute("data-settings-group")).toBe("coding")
    expect(groups[0].querySelector("h2")?.textContent).toBe(dictionary["settings.view.nav.group.coding"])
    expect([...groups[0].querySelectorAll("button")].map(button => button.textContent)).toEqual([
      dictionary["settings.page.agents.title"], dictionary["settings.page.behavior.title"],
      dictionary["settings.page.hooks.title"], dictionary["settings.page.commands.title"],
      dictionary["settings.page.skills.title"], dictionary["settings.page.mcp.title"],
    ])
  } finally { await act(async () => useI18nStore.setState(original)) }
})

test("does not probe a closed settings dialog and checks the host when it opens", async () => {
  useUIStore.setState({ isSettingsDialogOpen: false })
  await act(async () =>
    root.render(
      <I18nProvider>
        <TooltipProvider>
          <SettingsView />
        </TooltipProvider>
      </I18nProvider>,
    ),
  )
  await flush()
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/ax-engine/"))).toHaveLength(0)
  await act(async () => useUIStore.setState({ isSettingsDialogOpen: true }))
  await flush()
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/ax-engine/models"))).toHaveLength(1)
  expect(navButton("Local Models")).toBeUndefined()
})

test.each(["supported", "attached", "failed"])("keeps navigation for a %s runtime state", async (state) => {
  supported = state === "supported"
  attached = state === "attached"
  failed = state === "failed"
  await render()
  expect(navButton("Local Models")).toBeDefined()
})

test("does not classify a pending check as unsupported", async () => {
  let release!: (response: Response) => void
  pending = new Promise((resolve) => {
    release = resolve
  })
  await render()
  expect(navButton("Local Models")).toBeDefined()
  const order = () => [...container.querySelectorAll('[data-settings-group] button')].map(button => button.textContent)
  const initialOrder = order()
  await act(async () =>
    release(
      json({
        eligibility: { supported: false },
        server: { running: false },
        models: [],
        jobs: [],
      }),
    ),
  )
  await flush()
  expect(navButton("Local Models")).toBeUndefined()
  expect(order()).toEqual(initialOrder.filter(label => label !== "Local Models"))
})

test("search can explain an unavailable feature without restoring its ordinary navigation entry", async () => {
  await render()
  const search = container.querySelector<HTMLInputElement>("input")!
  expect(search).not.toBeNull()
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
  await act(async () => {
    setValue.call(search, "local models")
    search.dispatchEvent(new Event("input", { bubbles: true }))
  })
  expect(navButton("Local Models")).toBeDefined()
  await act(async () => navButton("Local Models")?.click())
  await flush()
  expect(container.textContent).toContain("Local models are unavailable on this host")
  await act(async () => {
    setValue.call(search, "")
    search.dispatchEvent(new Event("input", { bubbles: true }))
  })
  expect(navButton("Local Models")).toBeUndefined()
  expect(navButton("Providers")).toBeDefined()
})

test("clears the previous host's controls immediately while a new directory is loading", async () => {
  supported = true
  useUIStore.setState({ settingsPage: "models" })
  axCodeClient.setDirectory("/supported")
  useProjectsStore.setState({ activeProjectId: "supported" })
  await render()
  expect(navButton("Managed local")).toBeDefined()
  let release!: (response: Response) => void
  pending = new Promise((resolve) => {
    release = resolve
  })
  axCodeClient.setDirectory("/pending")
  await act(async () => useProjectsStore.setState({ activeProjectId: "pending" }))
  expect(navButton("Managed local")).toBeUndefined()
  expect(container.textContent).not.toContain("Local models are unavailable")
  await act(async () =>
    release(
      json({
        eligibility: { supported: false, blockers: [] },
        dependency: { available: false, blockers: [], warnings: [] },
        diskRoot: { path: "/cache", blockers: [] },
        server: { running: false },
        models: [],
        jobs: [],
      }),
    ),
  )
  await flush()
  expect(container.textContent).toContain("Local models are unavailable on this host")
})

test("a late previous-project response cannot hide the new host's navigation", async () => {
  let release!: (response: Response) => void
  pending = new Promise((resolve) => {
    release = resolve
  })
  axCodeClient.setDirectory("/old")
  useProjectsStore.setState({ activeProjectId: "old" })
  await render()
  pending = null
  supported = true
  axCodeClient.setDirectory("/new")
  await act(async () => useProjectsStore.setState({ activeProjectId: "new" }))
  await flush()
  await act(async () =>
    release(
      json({
        eligibility: { supported: false },
        server: { running: false },
        models: [],
        jobs: [],
      }),
    ),
  )
  await flush()
  expect(navButton("Local Models")).toBeDefined()
})
