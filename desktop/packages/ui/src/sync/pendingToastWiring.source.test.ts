import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

// `handleEvent` is private to the sync provider and mounting it needs the child stores, the runtime APIs and the
// event pipeline, so its wiring is asserted against the source, as the config editors' and PlanView's contracts are.
// The tracker's own semantics ("a session's keys are dropped") are covered by `pendingToastTracker.test.ts`.
const readSource = () => readFile(path.resolve(__dirname, "sync-context-impl.tsx"), "utf8")

describe("pending toast wiring", () => {
  test("drops a session's pending toasts before every branch that returns", async () => {
    // The clear sat inside the `session.deleted` branch, which is after the `if (!store) … return` that a directory
    // with no loaded child store hits: a session deleted there kept its keys for the life of the renderer. Moving
    // it above the store lookup was not enough — the global branch above that one returns first for a
    // `directory === "global"` lifecycle event, which is where a session no child store knows resolves to.
    const source = await readSource()

    const clearIndex = source.indexOf("clearPendingToastsForGoneSession(payload)")
    // The global branch and the store lookup, in the order the handler reaches them — matched on the branches
    // themselves inside the handler, since a comment edit is not a behaviour change and the file has other copies
    // of both shapes.
    const handlerIndex = source.indexOf("function handleEvent(")
    const globalBranchIndex = source.indexOf('if (directory === "global" || !directory) {', handlerIndex)
    const storeLookupIndex = source.indexOf("if (!store) {", handlerIndex)
    expect(handlerIndex).toBeGreaterThan(-1)
    expect(clearIndex).toBeGreaterThan(-1)
    expect(globalBranchIndex).toBeGreaterThan(-1)
    expect(storeLookupIndex).toBeGreaterThan(-1)
    expect(clearIndex).toBeGreaterThan(source.indexOf("applySessionLifecycleEventToGlobalStore(payload)"))
    expect(clearIndex).toBeLessThan(globalBranchIndex)
    expect(clearIndex).toBeLessThan(storeLookupIndex)
  })

  test("treats an archived session like a deleted one", async () => {
    // Archiving arrives as `session.updated` with `time.archived` — the same "the session is gone" signal
    // `event-reducer` reads — and the clear handled only `session.deleted`, though its own comment and test said
    // "(or archived)".
    const source = await readSource()

    expect(source).toContain('payload.type !== "session.updated"')
    expect(source).toContain('typeof info.time?.archived === "number"')
  })
})
