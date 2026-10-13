import { describe, expect, test } from "vitest"
import type { Message, Part } from "@defai-digital/ax-code-sdk/v2/client"
import { mergeOptimisticPage } from "../optimistic"

const msg = (id: string): Message => ({ id, sessionID: "ses_1", role: "user", time: { created: 1 } }) as Message
const textPart = (id: string, messageID: string): Part => ({ id, messageID, type: "text", text: "hi" }) as Part

describe("mergeOptimisticPage confirmation", () => {
  test("a page with server-minted parts confirms the optimistic message and drops its stale parts", () => {
    // The server echoes the user message under its own part ids; requiring the
    // client-minted ids kept the shadow entry forever and re-spliced the stale part
    // into every later page load, rendering the prompt twice.
    const page = {
      session: [msg("msg_server")],
      part: [{ id: "msg_server", part: [textPart("prt_server", "msg_server")] }],
      complete: true,
    }
    const items = [{ message: msg("msg_server"), parts: [textPart("prt_client", "msg_server")] }]

    const merged = mergeOptimisticPage(page, items)

    expect(merged.confirmed).toEqual(["msg_server"])
    expect(merged.part.find((entry) => entry.id === "msg_server")?.part.map((p) => p.id)).toEqual(["prt_server"])
  })

  test("an echoed message whose parts are still pending keeps the optimistic parts", () => {
    const page = {
      session: [msg("msg_server")],
      part: [{ id: "msg_server", part: [] as Part[] }],
      complete: true,
    }
    const items = [{ message: msg("msg_server"), parts: [textPart("prt_client", "msg_server")] }]

    const merged = mergeOptimisticPage(page, items)

    expect(merged.confirmed).toEqual([])
    expect(merged.part.find((entry) => entry.id === "msg_server")?.part.map((p) => p.id)).toEqual(["prt_client"])
  })

  test("a message missing from the page is merged in with its parts", () => {
    const page = { session: [] as Message[], part: [] as { id: string; part: Part[] }[], complete: true }
    const items = [{ message: msg("msg_new"), parts: [textPart("prt_client", "msg_new")] }]

    const merged = mergeOptimisticPage(page, items)

    expect(merged.confirmed).toEqual([])
    expect(merged.session.map((m) => m.id)).toEqual(["msg_new"])
    expect(merged.part.find((entry) => entry.id === "msg_new")?.part.map((p) => p.id)).toEqual(["prt_client"])
  })
})
