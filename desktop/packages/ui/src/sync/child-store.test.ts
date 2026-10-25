import { expect, test } from "vitest"
import type { Event, Message, Session } from "@defai-digital/ax-code-sdk/v2/client"
import { ChildStoreManager } from "./child-store"
import { applyDirectoryEvent, prepareEventDraft } from "./event-reducer"

test.each([
  ["C:/Users/RunnerAdmin/Project", "c:\\users\\runneradmin\\project"],
  ["//Server/Share/Project", "\\\\server\\share\\project"],
])("Windows aliases share one message cache and archive lifecycle: %s", (directory, alias) => {
  const manager = new ChildStoreManager()
  const first = manager.ensureChild(directory, { bootstrap: false })
  first.setState({ message: { session: [] }, sessionTotal: 3 })
  const second = manager.ensureChild(alias, { bootstrap: false })
  expect(second).toBe(first)
  expect(manager.children.size).toBe(1)
  manager.update(alias, () => ({ sessionTotal: 0 }))
  expect(manager.getState(directory)?.sessionTotal).toBe(0)
  manager.pin(alias)
  expect(manager.pinned(directory)).toBe(true)
  expect(manager.disposeDirectory(directory)).toBe(false)
  manager.unpin(directory)
  expect(manager.disposeDirectory(alias)).toBe(true)
  expect(manager.getChild(directory)).toBeUndefined()
})

test("POSIX directories with different case remain separate", () => {
  const manager = new ChildStoreManager()
  expect(manager.ensureChild("/Repo", { bootstrap: false })).not.toBe(manager.ensureChild("/repo", { bootstrap: false }))
  expect(manager.children.size).toBe(2)
})


test("a review opened under a Windows alias retains earlier calls and sees archive events", () => {
  const manager = new ChildStoreManager()
  const directory = "C:/Users/RunnerAdmin/Project"
  const alias = directory.toLowerCase()
  const store = manager.ensureChild(directory, { bootstrap: false })
  const message: Message = {
    id: "msg_1", sessionID: "ses_1", role: "user", time: { created: 1 },
    agent: "build", model: { providerID: "fixture", modelID: "fixture" },
  }
  const session = { id: "ses_1", directory, time: { created: 1, updated: 1 } } as Session
  store.setState({ session: [session], message: { ses_1: [message] } })
  const review = manager.ensureChild(alias, { bootstrap: false })
  expect(review.getState().message.ses_1).toEqual([message])
  const event: Event = { type: "session.updated", properties: {
    info: { ...session, time: { created: 1, updated: 2, archived: 2 } },
  } }
  manager.update(alias, state => {
    const draft = prepareEventDraft(state, event)
    applyDirectoryEvent(draft, event)
    return draft
  })
  expect(store.getState().session).toEqual([])
  expect(Array.from(manager.children.values()).flatMap(child => child.getState().session)).toEqual([])
})
