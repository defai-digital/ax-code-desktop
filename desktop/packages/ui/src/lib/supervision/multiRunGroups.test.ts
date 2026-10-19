import { describe, expect, test } from "vitest"

import { parseMultiRunSessionTitle } from "@/lib/multirun/title"
import {
  MULTI_RUN_METADATA_KEY_PREFIX,
  groupMultiRunRows,
  multiRunGroupKeyForRow,
  multiRunGroupKeyFromParsed,
} from "./multiRunGroups"

const row = (sessionId: string, title: string) => ({ sessionId, title })

describe("groupMultiRunRows", () => {
  test("groups lanes by slug and labels them with the model from the title", () => {
    const groups = groupMultiRunRows(
      [row("b", "bench/openai/gpt/2"), row("a", "bench/anthropic/claude"), row("other", "plain session")],
      parseMultiRunSessionTitle,
    )

    expect([...groups.keys()]).toEqual(["bench"])
    const group = groups.get("bench")
    expect(group?.label).toBe("bench")
    expect(group?.lanes.map((lane) => lane.sessionId)).toEqual(["a", "b"])
    expect(group?.lanes.map((lane) => lane.laneLabel)).toEqual(["anthropic/claude", "openai/gpt #2"])
  })

  test("keeps an optional run group as its own compare key and drops fusion sessions", () => {
    const groups = groupMultiRunRows(
      [
        row("lane", "bench/g2/anthropic/claude"),
        row("fusion", "bench/g2/anthropic/claude/fusion"),
        row("other-batch", "bench/g1/openai/gpt"),
        row("legacy", "bench/google/gemini"),
      ],
      parseMultiRunSessionTitle,
    )

    expect([...groups.keys()]).toEqual(["bench/g2", "bench/g1", "bench"])
    expect(groups.get("bench/g2")?.label).toBe("bench · g2")
    expect(groups.get("bench/g2")?.lanes.map((lane) => lane.sessionId)).toEqual(["lane"])
    expect(groups.get("bench")?.lanes.map((lane) => lane.sessionId)).toEqual(["legacy"])
  })

  test("returns an empty map when nothing parses as a lane", () => {
    expect(groupMultiRunRows([row("a", "notes")], parseMultiRunSessionTitle).size).toBe(0)
    expect(multiRunGroupKeyFromParsed(parseMultiRunSessionTitle("bench/anthropic/claude/fusion"))).toBeNull()
    expect(multiRunGroupKeyFromParsed(parseMultiRunSessionTitle("bench/g2/anthropic/claude"))).toBe("bench/g2")
  })
})

type MetadataRow = {
  sessionId: string
  title: string
  multiRun?: { groupId: string; variantId: string; model?: string }
}

const laneWith = (
  sessionId: string,
  title: string,
  groupId: string,
  variantId: string,
  model?: string,
): MetadataRow => ({
  sessionId,
  title,
  multiRun: { groupId, variantId, ...(model ? { model } : {}) },
})

describe("groupMultiRunRows with metadata identity", () => {
  test("keys lanes by metadata groupId and labels them with the metadata model", () => {
    const groups = groupMultiRunRows<MetadataRow>(
      [
        laneWith("a", "bench/anthropic/claude", "mr_1", "mr_1.1", "anthropic/claude-opus"),
        laneWith("b", "bench/openai/gpt", "mr_1", "mr_1.2", "openai/gpt-5"),
      ],
      parseMultiRunSessionTitle,
    )

    expect([...groups.keys()]).toEqual([`${MULTI_RUN_METADATA_KEY_PREFIX}mr_1`])
    const group = groups.get("multirun:mr_1")
    expect(group?.label).toBe("bench")
    expect(group?.lanes.map((lane) => lane.laneLabel)).toEqual(["anthropic/claude-opus", "openai/gpt-5"])
  })

  test("keeps a renamed lane in its group", () => {
    const groups = groupMultiRunRows<MetadataRow>(
      [
        laneWith("a", "bench/anthropic/claude", "mr_1", "mr_1.1", "anthropic/claude"),
        laneWith("b", "My favourite attempt", "mr_1", "mr_1.2", "openai/gpt"),
      ],
      parseMultiRunSessionTitle,
    )

    expect([...groups.keys()]).toEqual(["multirun:mr_1"])
    expect(groups.get("multirun:mr_1")?.lanes.map((lane) => lane.sessionId)).toEqual(["a", "b"])
  })

  test("keeps two launches with the same name apart", () => {
    const groups = groupMultiRunRows<MetadataRow>(
      [
        laneWith("first", "bench/anthropic/claude", "mr_1", "mr_1.1", "anthropic/claude"),
        laneWith("second", "bench/anthropic/claude", "mr_2", "mr_2.1", "anthropic/claude"),
      ],
      parseMultiRunSessionTitle,
    )

    expect([...groups.keys()]).toEqual(["multirun:mr_1", "multirun:mr_2"])
    expect(groups.get("multirun:mr_1")?.lanes.map((lane) => lane.sessionId)).toEqual(["first"])
    expect(groups.get("multirun:mr_2")?.lanes.map((lane) => lane.sessionId)).toEqual(["second"])
  })

  test("groups metadata lanes and legacy title lanes side by side", () => {
    const groups = groupMultiRunRows<MetadataRow>(
      [
        laneWith("new", "bench/anthropic/claude", "mr_1", "mr_1.1", "anthropic/claude"),
        row("legacy-a", "bench/anthropic/claude"),
        row("legacy-b", "bench/openai/gpt"),
      ],
      parseMultiRunSessionTitle,
    )

    expect([...groups.keys()]).toEqual(["multirun:mr_1", "bench"])
    expect(groups.get("multirun:mr_1")?.lanes.map((lane) => lane.sessionId)).toEqual(["new"])
    expect(groups.get("bench")?.lanes.map((lane) => lane.sessionId)).toEqual(["legacy-a", "legacy-b"])
  })

  test("falls back to the title label without a metadata model and numbers duplicate models", () => {
    const groups = groupMultiRunRows<MetadataRow>(
      [
        laneWith("no-model", "bench/google/gemini", "mr_1", "mr_1.3"),
        laneWith("dup-2", "renamed", "mr_1", "mr_1.2", "openai/gpt"),
        laneWith("dup-1", "bench/openai/gpt/1", "mr_1", "mr_1.1", "openai/gpt"),
      ],
      parseMultiRunSessionTitle,
    )

    expect(groups.get("multirun:mr_1")?.lanes.map((lane) => [lane.sessionId, lane.laneLabel])).toEqual([
      ["no-model", "google/gemini"],
      ["dup-1", "openai/gpt #1"],
      ["dup-2", "openai/gpt #2"],
    ])
  })

  test("labels a group whose lanes were all renamed with a lane title", () => {
    const groups = groupMultiRunRows<MetadataRow>(
      [laneWith("a", "Renamed run", "mr_1", "mr_1.1", "anthropic/claude")],
      parseMultiRunSessionTitle,
    )
    expect(groups.get("multirun:mr_1")?.label).toBe("Renamed run")
  })

  test("still drops fusion sessions when they carry metadata", () => {
    const groups = groupMultiRunRows<MetadataRow>(
      [laneWith("fusion", "bench/anthropic/claude/fusion", "mr_1", "mr_1.9", "anthropic/claude")],
      parseMultiRunSessionTitle,
    )
    expect(groups.size).toBe(0)
  })

  test("multiRunGroupKeyForRow prefers metadata and falls back to the title", () => {
    expect(multiRunGroupKeyForRow(laneWith("a", "Renamed", "mr_1", "mr_1.1"), parseMultiRunSessionTitle)).toBe(
      "multirun:mr_1",
    )
    expect(multiRunGroupKeyForRow({ title: "bench/g2/anthropic/claude" }, parseMultiRunSessionTitle)).toBe("bench/g2")
    expect(multiRunGroupKeyForRow({ title: "notes", multiRun: null }, parseMultiRunSessionTitle)).toBeNull()
  })
})
