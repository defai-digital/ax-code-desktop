import { describe, expect, test } from "vitest"

import {
  MULTI_RUN_ID_MAX_LENGTH,
  buildMultiRunIdentity,
  createMultiRunGroupId,
  isMultiRunId,
  readMultiRunIdentity,
  withMultiRunIdentity,
} from "./identity"

describe("readMultiRunIdentity", () => {
  test("returns the validated identity with known optional fields", () => {
    expect(
      readMultiRunIdentity({
        metadata: {
          multiRun: {
            groupId: "mr_1",
            variantId: "mr_1.1",
            model: "anthropic/claude",
            agent: "build",
            worktree: "/repo/.worktrees/a",
          },
          queue: { source: "multi-run" },
        },
      }),
    ).toEqual({
      groupId: "mr_1",
      variantId: "mr_1.1",
      model: "anthropic/claude",
      agent: "build",
      worktree: "/repo/.worktrees/a",
    })
    expect(readMultiRunIdentity({ metadata: { multiRun: { groupId: "g", variantId: "v" } } })).toEqual({
      groupId: "g",
      variantId: "v",
    })
  })

  test("returns null for missing metadata", () => {
    expect(readMultiRunIdentity(null)).toBeNull()
    expect(readMultiRunIdentity(undefined)).toBeNull()
    expect(readMultiRunIdentity({})).toBeNull()
    expect(readMultiRunIdentity({ metadata: null })).toBeNull()
    expect(readMultiRunIdentity({ metadata: { queue: {} } })).toBeNull()
  })

  test("returns null for malformed metadata", () => {
    const tooLong = "x".repeat(MULTI_RUN_ID_MAX_LENGTH + 1)
    const malformed: unknown[] = [
      { metadata: "multiRun" },
      { metadata: [] },
      { metadata: { multiRun: [] } },
      { metadata: { multiRun: "mr_1" } },
      { metadata: { multiRun: { variantId: "v" } } },
      { metadata: { multiRun: { groupId: "", variantId: "v" } } },
      { metadata: { multiRun: { groupId: 1, variantId: "v" } } },
      { metadata: { multiRun: { groupId: tooLong, variantId: "v" } } },
      { metadata: { multiRun: { groupId: "g", variantId: "v", model: "" } } },
      { metadata: { multiRun: { groupId: "g", variantId: "v", agent: 5 } } },
      { metadata: { multiRun: { groupId: "g", variantId: "v", worktree: null } } },
    ]
    for (const session of malformed) {
      expect(readMultiRunIdentity(session)).toBeNull()
    }
  })

  test("never throws on hostile input", () => {
    const hostile = {
      get metadata(): unknown {
        throw new Error("boom")
      },
    }
    expect(() => readMultiRunIdentity(hostile)).not.toThrow()
    expect(readMultiRunIdentity(hostile)).toBeNull()
  })
})

describe("buildMultiRunIdentity", () => {
  test("omits unknown or out-of-contract optional fields", () => {
    expect(
      buildMultiRunIdentity({ groupId: "g", variantId: "v", model: "x".repeat(161), agent: "", worktree: null }),
    ).toEqual({ groupId: "g", variantId: "v" })
    expect(buildMultiRunIdentity({ groupId: "", variantId: "v" })).toBeNull()
  })
})

describe("withMultiRunIdentity", () => {
  test("preserves other metadata namespaces and keys", () => {
    const identity = { groupId: "g", variantId: "v" }
    expect(withMultiRunIdentity({ queue: { source: "multi-run" }, custom: 1 }, identity)).toEqual({
      queue: { source: "multi-run" },
      custom: 1,
      multiRun: identity,
    })
    expect(withMultiRunIdentity(undefined, identity)).toEqual({ multiRun: identity })
  })
})

describe("createMultiRunGroupId", () => {
  test("generates distinct IDs within the runtime ID rule", () => {
    const first = createMultiRunGroupId()
    const second = createMultiRunGroupId()
    expect(first).not.toBe(second)
    expect(isMultiRunId(first)).toBe(true)
    expect(first.length).toBeLessThanOrEqual(64)
  })
})
