import React from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, test, vi } from "vitest"

import { applySessionRetentionAction } from "./useSessionAutoCleanup"

const scopedSdk = (overrides: { update?: unknown; delete?: unknown } = {}) =>
  ({
    session: {
      update: vi.fn(async () => ({ data: {} })),
      delete: vi.fn(async () => ({ data: true })),
      ...overrides,
    },
  }) as never

describe("applySessionRetentionAction", () => {
  test("reports a rejected archive as not completed", async () => {
    // The generated SDK resolves with `{ error }` instead of throwing, so a
    // rejected cleanup used to be counted as completed.
    const sdk = scopedSdk({ update: vi.fn(async () => ({ error: { message: "Internal error" } })) })

    await expect(applySessionRetentionAction(sdk, "ses_1", "/repo", "archive")).resolves.toBe(false)
  })

  test("reports a rejected delete as not completed", async () => {
    const sdk = scopedSdk({ delete: vi.fn(async () => ({ error: { message: "Internal error" } })) })

    await expect(applySessionRetentionAction(sdk, "ses_1", "/repo", "delete")).resolves.toBe(false)
  })

  test("reports a confirmed cleanup as completed", async () => {
    await expect(applySessionRetentionAction(scopedSdk(), "ses_1", "/repo", "delete")).resolves.toBe(true)
  })

  test("rethrows a transport error so the caller records the failure", async () => {
    const sdk = scopedSdk({
      delete: vi.fn(async () => {
        throw new Error("offline")
      }),
    })

    await expect(applySessionRetentionAction(sdk, "ses_1", "/repo", "delete")).rejects.toThrow("offline")
  })
})

describe("runCleanup re-entry guard", () => {
  test("a concurrent run bounces off while the first is still loading sessions", async () => {
    vi.resetModules()
    let releaseLoad: ((value: { activeSessions: never[] }) => void) | null = null
    vi.doMock("@/stores/useGlobalSessionsStore", async () => {
      const actual = await vi.importActual<typeof import("@/stores/useGlobalSessionsStore")>(
        "@/stores/useGlobalSessionsStore",
      )
      return {
        ...actual,
        ensureGlobalSessionsLoaded: vi.fn(
          () =>
            new Promise<{ activeSessions: never[] }>((resolve) => {
              releaseLoad = resolve
            }),
        ),
      }
    })

    const { useSessionAutoCleanup } = await import("./useSessionAutoCleanup")
    const { useUIStore } = await import("@/stores/useUIStore")
    useUIStore.setState({
      autoDeleteEnabled: true,
      autoDeleteAfterDays: 30,
      sessionRetentionAction: "delete",
      autoDeleteLastRunAt: 0,
    })

    let hook: ReturnType<typeof useSessionAutoCleanup> | null = null
    const Probe = (): null => {
      hook = useSessionAutoCleanup({ autoRun: false })
      return null
    }

    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    try {
      await React.act(async () => {
        root.render(React.createElement(Probe))
      })

      // The first run reaches the pending session load with the guard held.
      const first = hook!.runCleanup({ force: true })
      const second = await hook!.runCleanup({ force: true })
      expect(second.skippedReason).toBe("running")

      await React.act(async () => {
        releaseLoad?.({ activeSessions: [] })
        await first
      })
      await expect(first).resolves.toMatchObject({ skippedReason: "no-candidates" })
    } finally {
      await React.act(async () => {
        root.unmount()
      })
      container.remove()
      vi.doUnmock("@/stores/useGlobalSessionsStore")
      vi.resetModules()
    }
  })
})
