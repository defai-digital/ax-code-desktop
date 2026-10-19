import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { WebMcpApprovalRecord } from "@defai-digital/ax-code-sdk/v2"

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

const approvalRecord = (id: string, origin: string): WebMcpApprovalRecord => ({
  server: "server",
  project: "/project",
  scope: { capability: "read", origin },
  id,
  fingerprint: `fp-${id}`,
  revision: "1",
  policyVersion: 1,
  createdAt: 0,
})

const approvalRequests: Array<{
  name: string
  resolve: (result: { data: WebMcpApprovalRecord[] }) => void
}> = []
const approvals = vi.fn(({ name }: { name: string }) => {
  const request = deferred<{ data: WebMcpApprovalRecord[] }>()
  approvalRequests.push({ name, resolve: request.resolve })
  return request.promise
})
const revokeApproval = vi.fn()
const grantApproval = vi.fn()

vi.doMock("@/lib/i18n", () => {
  const t = (key: string) => key
  return { useI18n: () => ({ t }) }
})
vi.doMock("@/components/ui/ConfirmDialog", () => ({
  useConfirmDialog: () => ({ requestConfirm: async () => true, confirmDialog: null }),
}))
vi.doMock("@/stores/useMcpStore", () => ({
  getMcpApiClient: () => ({
    mcp: {
      webMcpApprovals: approvals,
      revokeWebMcpApproval: revokeApproval,
      grantWebMcpApproval: grantApproval,
    },
  }),
}))

const { WebMcpAllowlistSection } = await import("./WebMcpAllowlistSection")

describe("WebMcpAllowlistSection target staleness", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (serverName: string) => {
    act(() => {
      root.render(<WebMcpAllowlistSection serverName={serverName} directory="/project" />)
    })
  }

  const settle = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  const resolveApprovals = async (name: string, records: WebMcpApprovalRecord[]) => {
    const index = approvalRequests.findIndex((request) => request.name === name)
    expect(index).toBeGreaterThanOrEqual(0)
    const [request] = approvalRequests.splice(index, 1)
    request.resolve({ data: records })
    await settle()
  }

  const removeButton = () =>
    Array.from(container.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "webmcp.allowlist.remove",
    )

  beforeEach(() => {
    approvalRequests.length = 0
    approvals.mockClear()
    revokeApproval.mockReset()
    grantApproval.mockReset()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
  })

  test("a mutation finishing after a server switch does not publish the old server's records", async () => {
    const recordA = approvalRecord("a1", "https://a.example")
    const recordB = approvalRecord("b1", "https://b.example")

    render("server-a")
    await settle()
    await resolveApprovals("server-a", [recordA])
    expect(container.textContent).toContain("https://a.example")

    const revoke = deferred<unknown>()
    revokeApproval.mockReturnValueOnce(revoke.promise)

    await act(async () => {
      removeButton()?.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(revokeApproval).toHaveBeenCalledWith({ name: "server-a", id: "a1" }, { throwOnError: true })

    // Switch servers while the revoke is still in flight.
    render("server-b")
    await settle()
    await resolveApprovals("server-b", [recordB])
    expect(container.textContent).toContain("https://b.example")

    // The old mutation completes now. Any refresh it starts still names server-a; settle it with
    // server-a's records so the test sees where those records land.
    revoke.resolve(undefined)
    await settle()
    const staleRequests = approvalRequests.splice(0)
    for (const request of staleRequests) {
      expect(request.name).toBe("server-a")
      request.resolve({ data: [recordA] })
    }
    await settle()

    expect(container.textContent).toContain("https://b.example")
    expect(container.textContent).not.toContain("https://a.example")
  })
})
