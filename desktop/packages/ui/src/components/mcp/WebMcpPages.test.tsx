import React, { act } from "react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { cleanup, render, fireEvent, within } from "@/test/dom"
import { dict } from "@/lib/i18n/messages/en"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import type { Session } from "@defai-digital/ax-code-sdk/v2"
import { useUIStore } from "@/stores/useUIStore"
import { viewKeyFor } from "@/lib/webMcpViewKey"
import { countSessionsWithWaitingPages } from "@/lib/webMcpViewKey"
import { WebMcpPageSwitcher, WebMcpTrustSummary, WebMcpSessionPage } from "./WebMcpPages"
import { NeedsYouPopover } from "@/components/supervision/NeedsYouPopover"
import { SessionGrid } from "@/components/sessionGrid/SessionGrid"
import { MissionControlRow } from "@/components/supervision/missionControl/MissionControlRow"
import type { SupervisionRow } from "@/lib/supervision/rows"

const { invoke, openSession } = vi.hoisted(() => ({ invoke: vi.fn(), openSession: vi.fn() }))
vi.mock("@/lib/desktopBridge", () => ({ getDesktopBridge: () => ({ invoke }) }))
vi.mock("@/lib/supervision/openSession", () => ({ openSupervisedSession: openSession }))
vi.mock("@/sync/sync-context", () => ({ useAllPendingRequests: () => [] }))
vi.mock("@/contexts/useThemeSystem", () => ({ useThemeSystem: () => ({ themeMode: "dark" }) }))
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      Object.entries(params ?? {}).reduce(
        (text, [key, value]) => text.replace(`{${key}}`, String(value)),
        dict[key as keyof typeof dict] ?? key,
      ),
    number: String,
  }),
}))
const initial = useWebMcpBrowserStore.getState()
const ui = useUIStore.getState()
const projects = useProjectsStore.getState()
const sessions = useGlobalSessionsStore.getState()
const supervision = useSupervisionStore.getState()
const a = viewKeyFor("/project-a", "ses_same")
const b = viewKeyFor("/project-b", "ses_same")
const row = (directory: string, title: string): SupervisionRow => ({
  sessionId: "ses_same",
  directory,
  title,
  projectId: null,
  projectLabel: directory,
  state: "idle",
  treeSessionIds: ["ses_same"],
  updatedAt: 0,
  evidence: null,
  goal: null,
})
beforeEach(() => {
  vi.clearAllMocks()
  invoke.mockResolvedValue({ revoked: true })
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  )
  const store = useWebMcpBrowserStore.getState()
  store.selectView("/project-b", "ses_same")
  store.updateView(a, {
    browserId: "page-a",
    directory: "/project-a",
    sessionID: "ses_same",
    origin: "https://a.test",
    phase: "ready",
    enabled: true,
    waiting: true,
    visible: false,
    idle: false,
  })
  store.updateView(b, {
    browserId: "page-b",
    directory: "/project-b",
    sessionID: "ses_same",
    origin: "https://b.test",
    phase: "ready",
    enabled: true,
    visible: true,
    idle: true,
  })
  useSupervisionStore.setState({ rows: [row("/project-a", "Task A"), row("/project-b", "Task B")] })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useWebMcpBrowserStore.setState(initial, true)
  useUIStore.setState(ui, true)
  useSupervisionStore.setState(supervision, true)
  useProjectsStore.setState(projects, true)
  useGlobalSessionsStore.setState(sessions, true)
})

test("switcher identifies every page and revokes the clicked project/session while the shown session survives", async () => {
  const { container } = render(<WebMcpPageSwitcher selectedKey={b} onRetry={vi.fn()} />)
  fireEvent.click(container.querySelector("summary")!)
  expect(container.textContent).toContain("Task A · https://a.test · /project-a")
  expect(container.textContent).toContain("Access waiting")
  const buttons = within(container)
  const target = buttons.getByRole("button", {
    name: "Revoke agent access: Task A · https://a.test · /project-a · ses_same",
  })
  target.focus()
  await act(async () => {
    fireEvent.click(target)
  })
  expect(invoke).toHaveBeenCalledExactlyOnceWith("desktop_webmcp_browser", {
    action: "revokeSession",
    directory: "/project-a",
    sessionID: "ses_same",
  })
  expect(useWebMcpBrowserStore.getState().views[a]).toMatchObject({ enabled: false, waiting: false })
  expect(useWebMcpBrowserStore.getState().views[b]).toMatchObject({ enabled: true, visible: true })
  expect(document.activeElement).toBe(
    buttons.getByRole("button", { name: "Show page: Task A · https://a.test · /project-a · ses_same · Access off" }),
  )
  expect(
    buttons
      .getByRole("button", { name: "Show page: Task B · https://b.test · /project-b · ses_same · Access on" })
      .getAttribute("aria-current"),
  ).toBe("page")
})

test("choosing a waiting page navigates to its owner without a grant; trust is display only", () => {
  const { container } = render(
    <>
      <WebMcpSessionPage directory="/project-a" sessionID="ses_same" />
      <WebMcpTrustSummary viewKey={a} />
    </>,
  )
  fireEvent.click(container.querySelector("button")!)
  expect(openSession).toHaveBeenCalledWith({ sessionId: "ses_same", directory: "/project-a", projectId: undefined })
  expect(useWebMcpBrowserStore.getState().activeKey).toBe(a)
  expect(useWebMcpBrowserStore.getState().views[a].enableRequests).toBe(0)
  expect(container.querySelector("[data-webmcp-trust]")?.textContent).toContain("Pause keeps the page")
  expect(container.querySelector("[data-webmcp-trust]")?.textContent).toContain("Other sessions keep their access")
  expect(container.querySelector("[data-webmcp-trust] button")).toBeNull()
  expect(invoke).not.toHaveBeenCalled()
})

test("names a full pool, lists live views, closes only an idle hidden page and retries", async () => {
  useWebMcpBrowserStore.setState({ capacity: { liveViews: 2, maxLiveViews: 2 } })
  useWebMcpBrowserStore.getState().updateView(a, { idle: true, waiting: false })
  const retry = vi.fn()
  const { container } = render(<WebMcpPageSwitcher selectedKey={b} onRetry={retry} />)
  expect(container.querySelector("summary")?.textContent).toContain("Browser pool full")
  fireEvent.click(container.querySelector("summary")!)
  const close = within(container).getByRole("button", {
    name: "Close idle page: Task A · https://a.test · /project-a · ses_same",
  })
  expect(
    within(container).queryByRole("button", {
      name: "Close idle page: Task B · https://b.test · /project-b · ses_same",
    }),
  ).toBeNull()
  await act(async () => {
    fireEvent.click(close)
  })
  expect(invoke).toHaveBeenCalledWith("desktop_webmcp_browser", { action: "close", id: "page-a" })
  expect(retry).toHaveBeenCalledOnce()
  expect(useWebMcpBrowserStore.getState().views[b].browserId).toBe("page-b")
})

test("failed revoke does not claim success and unloaded pages are clearly off", async () => {
  invoke.mockRejectedValueOnce(new Error("offline"))
  useWebMcpBrowserStore.getState().updateView(b, { enabled: false, unloaded: true })
  const { container } = render(<WebMcpPageSwitcher selectedKey={b} onRetry={vi.fn()} />)
  fireEvent.click(container.querySelector("summary")!)
  await act(async () => {
    fireEvent.click(
      within(container).getByRole("button", {
        name: "Revoke agent access: Task A · https://a.test · /project-a · ses_same",
      }),
    )
  })
  expect(within(container).getByRole("alert").textContent).toContain("failed")
  expect(useWebMcpBrowserStore.getState().views[a].enabled).toBe(true)
  expect(container.textContent).toContain("Unloaded; reloads with access off")
})

test("Needs you surfaces a hidden waiting page even without a runtime approval", () => {
  const { container } = render(<NeedsYouPopover onClose={vi.fn()} />)
  expect(container.querySelector("[data-webmcp-waiting]")?.textContent).toContain("Task A")
  expect(container.querySelector("[data-webmcp-waiting]")?.textContent).not.toContain("Task B")
  fireEvent.click(container.querySelector("[data-webmcp-session-page]")!)
  expect(openSession).toHaveBeenCalledWith(expect.objectContaining({ directory: "/project-a" }))
})

test("session grid shows waiting on only the owning slot and opens its page", () => {
  useUIStore.setState({
    sessionGrid: {
      layout: 2,
      ratios: { columns: 0.5, rows: 0.5 },
      slots: [
        { directory: "/project-a", sessionId: "ses_same" },
        { directory: "/project-b", sessionId: "ses_same" },
      ],
    },
  })
  const { container } = render(<SessionGrid />)
  const controls = container.querySelectorAll("[data-webmcp-session-page]")
  expect(controls).toHaveLength(2)
  expect(controls[0].textContent).toContain("Access waiting")
  expect(controls[1].textContent).toContain("Access on")
  fireEvent.click(controls[0])
  expect(openSession).toHaveBeenCalledWith(expect.objectContaining({ directory: "/project-a" }))
})

test("Mission Control row exposes its own waiting page without selecting the row", () => {
  const select = vi.fn()
  const { container } = render(
    <MissionControlRow
      row={row("/project-a", "Task A")}
      selected={false}
      bulkSelected={false}
      onToggleSelection={vi.fn()}
      expanded={false}
      activeWorkingSetId={null}
      primaryLabel="Open"
      onToggleDetails={vi.fn()}
      onSelect={select}
      onOpen={vi.fn()}
      onPrimary={vi.fn()}
      onRemoveFromSet={vi.fn()}
    />,
  )
  const control = container.querySelector("[data-webmcp-session-page]")!
  expect(control.textContent).toContain("https://a.test · Access waiting")
  fireEvent.click(control)
  expect(select).not.toHaveBeenCalled()
  expect(openSession).toHaveBeenCalledWith(expect.objectContaining({ directory: "/project-a" }))
})

test.each([
  ["C:\\Users\\Ada\\Project", "c:/users/ada/project", "row"],
  ["\\\\Server\\Share\\Team\\Project", "//server/share/team/project", "session"],
])("shared identity resolves labels, titles and navigation for %s", (path, nativePath, source) => {
  const key = viewKeyFor(nativePath, "ses_windows")
  useWebMcpBrowserStore.setState({ views: {} })
  useWebMcpBrowserStore.getState().updateView(key, {
    browserId: "windows-page",
    directory: nativePath,
    sessionID: "ses_windows",
    origin: "https://windows.test",
  })
  useProjectsStore.setState({ projects: [{ id: "windows-project", path, label: "Windows project" }] })
  useSupervisionStore.setState({
    rows: source === "row" ? [{ ...row(path, "Windows task"), sessionId: "ses_windows" }] : [],
  })
  useGlobalSessionsStore.setState({
    activeSessions:
      source === "session" ? [{ id: "ses_windows", directory: path, title: "Windows task" } as Session] : [],
  })
  const { container } = render(
    <>
      <WebMcpPageSwitcher selectedKey={key} onRetry={vi.fn()} />
      <WebMcpTrustSummary viewKey={key} />
    </>,
  )
  fireEvent.click(container.querySelector("summary")!)
  expect(container.querySelector("[data-webmcp-trust]")?.textContent).toContain("Windows task")
  expect(container.querySelector("[data-webmcp-trust]")?.textContent).toContain("Windows project")
  fireEvent.click(
    within(container).getByRole("button", {
      name: `Show page: Windows task · https://windows.test · Windows project · ${nativePath} · ses_windows · Access off`,
    }),
  )
  expect(openSession).toHaveBeenCalledWith({
    sessionId: "ses_windows",
    directory: nativePath,
    projectId: "windows-project",
  })
})

test("full pool in another window offers owner focus and keeps announcements outside the closed disclosure", async () => {
  useWebMcpBrowserStore.setState({
    capacity: { liveViews: 2, maxLiveViews: 2, otherWindows: [{ id: "foreign-page", pageCount: 2 }] },
  })
  const { container } = render(<WebMcpPageSwitcher selectedKey={b} onRetry={vi.fn()} />)
  const disclosure = container.querySelector("details")!
  expect(disclosure.open).toBe(false)
  const status = within(container).getByRole("status")
  expect(status.closest("details")).toBeNull()
  expect(status.textContent).toContain("Other AX Code windows")
  expect(status.textContent).toContain("Task A")
  expect(status.textContent).toContain("Access waiting")
  fireEvent.click(disclosure.querySelector("summary")!)
  expect(disclosure.textContent).not.toContain("The pages below show their owners")
  await act(async () => {
    fireEvent.click(within(container).getByRole("button", { name: "Focus owner window 1 (2 pages)" }))
  })
  expect(invoke).toHaveBeenCalledExactlyOnceWith("desktop_webmcp_browser", { action: "focusOwner", id: "foreign-page" })
})

test("equal session titles still have distinct accessible action names", () => {
  const secondKey = viewKeyFor("/project-a", "ses_duplicate")
  useWebMcpBrowserStore.getState().updateView(secondKey, {
    ...useWebMcpBrowserStore.getState().views[a],
    browserId: "duplicate",
    sessionID: "ses_duplicate",
  })
  useSupervisionStore.setState({
    rows: [row("/project-a", "Task A"), { ...row("/project-a", "Task A"), sessionId: "ses_duplicate" }],
  })
  const { container } = render(<WebMcpPageSwitcher selectedKey={b} onRetry={vi.fn()} />)
  fireEvent.click(container.querySelector("summary")!)
  expect(
    within(container).getByRole("button", {
      name: "Revoke agent access: Task A · https://a.test · /project-a · ses_same",
    }),
  ).toBeTruthy()
  expect(
    within(container).getByRole("button", {
      name: "Revoke agent access: Task A · https://a.test · /project-a · ses_duplicate",
    }),
  ).toBeTruthy()
})

test("interrupted access is announced while collapsed and still allows revocation", async () => {
  useWebMcpBrowserStore.getState().updateView(a, { enabled: false, waiting: false, interrupted: true })
  const { container } = render(<WebMcpPageSwitcher selectedKey={b} onRetry={vi.fn()} />)
  expect(within(container).getByRole("status").textContent).toContain("Access interrupted")
  fireEvent.click(container.querySelector("summary")!)
  await act(async () => {
    fireEvent.click(
      within(container).getByRole("button", {
        name: "Revoke agent access: Task A · https://a.test · /project-a · ses_same",
      }),
    )
  })
  expect(invoke).toHaveBeenCalledWith("desktop_webmcp_browser", {
    action: "revokeSession",
    directory: "/project-a",
    sessionID: "ses_same",
  })
})

test("waiting session counts deduplicate null-directory runtime rows without merging distinct projects", () => {
  expect(
    countSessionsWithWaitingPages([{ sessionId: "ses_same", directory: null }], [{ key: a, sessionID: "ses_same" }]),
  ).toBe(1)
  expect(
    countSessionsWithWaitingPages(
      [{ sessionId: "ses_same", directory: "/project-b" }],
      [{ key: a, sessionID: "ses_same" }],
    ),
  ).toBe(2)
})

test("revoke reports each acknowledged or still-finishing call on its own page", async () => {
  let finish!: (result: unknown) => void
  invoke.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const { container } = render(<WebMcpPageSwitcher selectedKey={b} onRetry={vi.fn()} />)
  fireEvent.click(container.querySelector("summary")!)
  fireEvent.click(
    within(container).getByRole("button", {
      name: "Revoke agent access: Task A · https://a.test · /project-a · ses_same",
    }),
  )
  expect(container.textContent).not.toContain("stop requested, still finishing")
  await act(async () =>
    finish({
      cancellations: [
        { requestID: "call-a", state: "stopped" },
        { requestID: "call-b", state: "still-finishing" },
      ],
    }),
  )
  const row = Array.from(container.querySelectorAll("[data-webmcp-page]")).find(
    (element) => element.getAttribute("data-webmcp-page") === a,
  )!
  expect(row.textContent).toContain("Call call-a: stopped. Changes already made on the page stay.")
  expect(row.textContent).toContain("Call call-b: stop requested, still finishing.")
  expect(useWebMcpBrowserStore.getState().views[b].enabled).toBe(true)
})

test("page identities redact agent titles and origins in visible and accessible labels", () => {
  const secret = "ghp_" + "c".repeat(36)
  useSupervisionStore.setState({ rows: [row("/project-a", secret)] })
  useWebMcpBrowserStore.getState().updateView(a, { origin: `https://${secret}.test` })
  const { container } = render(<>
    <WebMcpPageSwitcher selectedKey={a} onRetry={vi.fn()} />
    <WebMcpTrustSummary viewKey={a} />
    <WebMcpSessionPage directory="/project-a" sessionID="ses_same" />
  </>)
  expect(container.innerHTML).not.toContain(secret)
  expect(container.textContent).toContain("[redacted]")
})
