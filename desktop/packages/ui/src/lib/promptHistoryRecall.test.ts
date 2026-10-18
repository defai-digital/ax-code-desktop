import { describe, expect, test } from "vitest"
import {
  PROMPT_HISTORY_LIMIT,
  appendLocalRecall,
  applyPromptHistoryLoad,
  mergePromptRecall,
  parsePromptHistoryList,
  promptRecallHistoryForNavigation,
  promptTextToRemember,
  reconcilePromptRecall,
  retainUnseenPending,
  stepPromptRecall,
  unseenPendingEntries,
  type PendingPromptRecall,
  type PromptRecallEntry,
} from "./promptHistoryRecall"

const entry = (input: string, mode?: "normal" | "shell", parts: PromptRecallEntry["parts"] = []): PromptRecallEntry => ({
  input,
  ...(mode ? { mode } : {}),
  parts,
})

describe("parsePromptHistoryList", () => {
  test("keeps valid oldest-first rows and drops malformed ones", () => {
    expect(
      parsePromptHistoryList([
        { input: "first", mode: "normal", parts: [] },
        { input: "" },
        { nope: true },
        { input: "ls", mode: "shell", parts: [{ type: "text", text: "ls" }] },
        { input: "bad-mode", mode: "plan", parts: [] },
        { input: "bad-part", parts: [{ text: "x" }] },
      ]),
    ).toEqual([entry("first", "normal"), entry("ls", "shell", [{ type: "text", text: "ls" }])])
  })

  test("a non-array body is a failed load", () => {
    expect(parsePromptHistoryList({ entries: [] })).toBeNull()
  })

  test("keeps the newest 50 when the payload is longer", () => {
    const rows = Array.from({ length: 60 }, (_, index) => ({ input: `p${index}`, parts: [] }))
    const parsed = parsePromptHistoryList(rows)
    expect(parsed).toHaveLength(PROMPT_HISTORY_LIMIT)
    expect(parsed?.[0].input).toBe("p10")
    expect(parsed?.[49].input).toBe("p59")
  })
})

describe("appendLocalRecall", () => {
  test("skips a consecutive duplicate and keeps the same text in another mode", () => {
    const once = appendLocalRecall([], entry("ls", "shell"))
    expect(appendLocalRecall(once, entry("ls", "shell"))).toEqual(once)
    expect(appendLocalRecall(once, entry("ls", "normal"))).toEqual([entry("ls", "shell"), entry("ls", "normal")])
  })

  test("keeps the same text when parts differ", () => {
    const file = entry("look", "normal", [{ type: "file", url: "file:///a" }])
    expect(appendLocalRecall([entry("look", "normal")], file)).toEqual([entry("look", "normal"), file])
  })

  test("drops the oldest past the cap", () => {
    let history: PromptRecallEntry[] = []
    for (let index = 0; index < PROMPT_HISTORY_LIMIT + 2; index += 1) {
      history = appendLocalRecall(history, entry(`p${index}`, "normal"))
    }
    expect(history).toHaveLength(PROMPT_HISTORY_LIMIT)
    expect(history[0].input).toBe("p2")
    expect(history[history.length - 1].input).toBe(`p${PROMPT_HISTORY_LIMIT + 1}`)
  })
})

describe("reconcilePromptRecall", () => {
  test("does not append pending rows the server already returned", () => {
    const server = [entry("A", "normal"), entry("B", "shell")]
    expect(reconcilePromptRecall(server, server)).toEqual({ history: server, pending: [] })
  })

  test("keeps the pending tail the server has not stored yet", () => {
    const result = reconcilePromptRecall([entry("A", "normal")], [entry("A", "normal"), entry("B", "normal")])
    expect(result.history.map((item) => item.input)).toEqual(["A", "B"])
    expect(result.pending.map((item) => item.input)).toEqual(["B"])
  })

  test("appends pending rows that are absent from the server list", () => {
    const result = reconcilePromptRecall([entry("X", "normal")], [entry("A", "normal"), entry("B", "shell")])
    expect(result.history.map((item) => item.input)).toEqual(["X", "A", "B"])
    expect(result.pending).toHaveLength(2)
  })
})

describe("applyPromptHistoryLoad", () => {
  test("ignores a stale generation and a failed load", () => {
    const previous = [entry("local", "normal")]
    const pending = [entry("local", "normal")]
    expect(
      applyPromptHistoryLoad({
        generation: 1,
        currentGeneration: 2,
        ok: true,
        server: [entry("other", "normal")],
        pending,
        previous,
      }),
    ).toEqual({ history: previous, pending })
    expect(
      applyPromptHistoryLoad({
        generation: 2,
        currentGeneration: 2,
        ok: false,
        server: [],
        pending,
        previous,
      }).history,
    ).toEqual(previous)
  })
})

describe("mergePromptRecall", () => {
  test("puts the newest project prompt first and fills with session text that is not stored", () => {
    const merged = mergePromptRecall({
      project: [entry("older", "normal"), entry("ls", "shell")],
      sessionTexts: ["ls", "from-session", ""],
    })
    expect(merged.map((item) => item.input)).toEqual(["ls", "older", "from-session"])
    expect(merged[0].mode).toBe("shell")
  })

  test("the same text in two modes stays recallable, and a trimmed session copy does not repeat it", () => {
    const merged = mergePromptRecall({
      project: [entry("ls", "shell"), entry("ls", "normal")],
      sessionTexts: ["\nls\n"],
    })
    expect(merged.map((item) => [item.input, item.mode])).toEqual([
      ["ls", "normal"],
      ["ls", "shell"],
    ])
  })

  test("session history alone is newest-first when the project store is empty", () => {
    expect(mergePromptRecall({ project: [], sessionTexts: ["new", "new", "old"] }).map((item) => item.input)).toEqual([
      "new",
      "old",
    ])
  })
})

describe("stepPromptRecall", () => {
  const history = [entry("newest", "shell"), entry("older", "normal")]

  test("ArrowUp from the live draft stashes the text and mode", () => {
    expect(
      stepPromptRecall({
        history,
        index: -1,
        direction: "older",
        draft: "",
        draftMode: "normal",
        message: "half typed",
        mode: "normal",
      }),
    ).toMatchObject({
      index: 0,
      draft: "half typed",
      draftMode: "normal",
      message: "newest",
      mode: "shell",
      moved: true,
    })
  })

  test("ArrowDown from the newest entry restores the stashed draft and mode", () => {
    expect(
      stepPromptRecall({
        history,
        index: 0,
        direction: "newer",
        draft: "half typed",
        draftMode: "shell",
        message: "newest",
        mode: "shell",
      }),
    ).toMatchObject({
      index: -1,
      message: "half typed",
      mode: "shell",
      moved: true,
    })
  })

  test("ArrowUp on the oldest entry stays put", () => {
    expect(
      stepPromptRecall({
        history,
        index: 1,
        direction: "older",
        draft: "half typed",
        draftMode: "normal",
        message: "older",
        mode: "normal",
      })?.moved,
    ).toBe(false)
  })

  test("an empty history does not move", () => {
    expect(
      stepPromptRecall({
        history: [],
        index: -1,
        direction: "older",
        draft: "",
        draftMode: "normal",
        message: "",
        mode: "normal",
      }),
    ).toBeNull()
  })
})

describe("promptTextToRemember", () => {
  test("stores typed submit and queue text, including slash and shell, and skips the rest", () => {
    expect(promptTextToRemember({ reason: "submit", typed: "\nfix tests\n" })).toBe("fix tests")
    expect(promptTextToRemember({ reason: "submit", typed: "/undo" })).toBe("/undo")
    expect(promptTextToRemember({ reason: "queue-accept", typed: "hold this" })).toBe("hold this")
    expect(promptTextToRemember({ reason: "submit", typed: "\n  \n" })).toBeNull()
    expect(promptTextToRemember({ reason: "queued-only", typed: "again" })).toBeNull()
    expect(promptTextToRemember({ reason: "queue-refused", typed: "again" })).toBeNull()
  })
})

describe("unseen pending writes", () => {
  const pending: PendingPromptRecall[] = [
    { entry: entry("A", "normal"), settledAt: 2 },
    { entry: entry("B", "shell"), settledAt: null },
  ]

  test("a load keeps only writes it could not have observed", () => {
    expect(unseenPendingEntries(pending, 3).map((item) => item.input)).toEqual(["B"])
    expect(unseenPendingEntries(pending, 1).map((item) => item.input)).toEqual(["A", "B"])
  })

  test("a settled write that the server did not return is not resurrected", () => {
    expect(retainUnseenPending(pending, 3, [])).toEqual([])
    expect(retainUnseenPending(pending, 1, [entry("B", "shell")])).toEqual([pending[1]])
  })
})

describe("promptRecallHistoryForNavigation", () => {
  test("freezes the list that was visible when browsing started", () => {
    const live = [entry("later", "normal")]
    const browsing = [entry("then", "normal")]
    expect(promptRecallHistoryForNavigation({ live, browsing, index: 0 })).toBe(browsing)
    expect(promptRecallHistoryForNavigation({ live, browsing, index: -1 })).toBe(live)
  })
})
