import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ warning: vi.fn(), open: vi.fn() }))

vi.mock("@/components/ui", () => ({ toast: { warning: mocks.warning, error: vi.fn(), success: vi.fn() } }))
vi.mock("@/lib/supervision/openSession", () => ({ openSupervisedSession: mocks.open }))
vi.mock("@/contexts/runtimeAPIRegistry", () => ({ getRegisteredRuntimeAPIs: () => null }))
vi.mock("@/hooks/useSupervisionRows", () => ({ useSupervisionRows: () => [] }))

const { publishRunTransition } = await import("./useRunTransitionNotifications")
const { useNotificationStore } = await import("@/stores/useNotificationStore")
const { useUIStore } = await import("@/stores/useUIStore")
const { dict } = await import("@/lib/i18n/messages/en")

type Key = keyof typeof dict
const t = ((key: Key, vars?: Record<string, string>) =>
  Object.entries(vars ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, value), dict[key] as string)) as never

const row = {
  sessionId: "ses_1",
  title: "PDF gateway retention",
  projectId: "proj_trust",
  directory: "/work/ax-trust",
} as never

describe("publishing a run transition", () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [], isOpen: false })
    useUIStore.setState({
      notifyOnCompletion: true,
      notifyOnError: true,
      notifyOnQuestion: true,
      nativeNotificationsEnabled: false,
    })
  })

  afterEach(() => vi.clearAllMocks())

  test("a blocked goal says it needs a decision, stays out of the follow-ups and opens its session", () => {
    publishRunTransition({ sessionId: "ses_1", kind: "goal", from: "running", to: "goal" }, [row], t)

    expect(mocks.warning).toHaveBeenCalledTimes(1)
    const [title, options] = mocks.warning.mock.calls[0] as [string, { description: string; action: { onClick: () => void } }]
    expect(title).toBe(dict["supervision.state.goal"])
    expect(options.description).toBe("PDF gateway retention is waiting for your decision on its goal")
    expect(title).not.toBe(dict["supervision.notify.failed.title"])
    // The bell lists follow-ups; the goal waits in Needs you.
    expect(useNotificationStore.getState().notifications).toEqual([])

    options.action.onClick()
    expect(mocks.open).toHaveBeenCalledWith({ sessionId: "ses_1", projectId: "proj_trust", directory: "/work/ax-trust" })
  })

  test("an error is still a failed run in the follow-ups, with where its session lives", () => {
    publishRunTransition({ sessionId: "ses_1", kind: "failed", from: "running", to: "error" }, [row], t)

    expect(mocks.warning).not.toHaveBeenCalled()
    expect(useNotificationStore.getState().notifications).toMatchObject([
      {
        title: dict["supervision.notify.failed.title"],
        sessionId: "ses_1",
        projectId: "proj_trust",
        directory: "/work/ax-trust",
      },
    ])
  })

  test("two sessions with the same title are told apart by their project", () => {
    publishRunTransition(
      { sessionId: "ses_1", kind: "failed", from: "running", to: "error" },
      [{ ...(row as object), projectLabel: "ax-trust" } as never],
      t,
    )

    expect(useNotificationStore.getState().notifications[0]?.projectLabel).toBe("ax-trust")
  })
})
