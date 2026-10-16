import { describe, expect, test } from "vitest"
import { buildSessionContextUsage, findLatestAssistantTokenUsage, findLatestStepTokenUsage } from "./assistantTokens"

describe("findLatestStepTokenUsage", () => {
  test("returns null when no step-finish part exists", () => {
    expect(findLatestStepTokenUsage([])).toBeNull()
    expect(
      findLatestStepTokenUsage([
        { type: "step-start" },
        { type: "text", text: "hello" },
      ]),
    ).toBeNull()
  })

  test("returns the tokens of the LAST step-finish part", () => {
    expect(
      findLatestStepTokenUsage([
        { type: "step-start" },
        { type: "step-finish", tokens: { input: 10_000, output: 100, reasoning: 0, cache: { read: 0, write: 0 } } },
        { type: "step-start" },
        { type: "step-finish", tokens: { input: 30_000, output: 250, reasoning: 40, cache: { read: 20_000, write: 0 } } },
      ]),
    ).toEqual({
      input: 30_000,
      output: 250,
      reasoning: 40,
      cache: { read: 20_000, write: 0 },
    })
  })

  test("defaults missing reasoning/cache fields to zero", () => {
    expect(findLatestStepTokenUsage([{ type: "step-finish", tokens: { input: 500, output: 50 } }])).toEqual({
      input: 500,
      output: 50,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    })
  })

  test("returns null for a malformed step-finish tokens payload", () => {
    expect(findLatestStepTokenUsage([{ type: "step-finish", tokens: { output: 50 } }])).toBeNull()
    expect(findLatestStepTokenUsage([{ type: "step-finish" }])).toBeNull()
  })
})

describe("findLatestStepTokenUsage and placeholder usage", () => {
  const stepFinish = (tokens: Record<string, unknown>) => ({ type: "step-finish", tokens })

  test("skips a step-finish that reports no usage", () => {
    // A provider that reports nothing leaves zeros, which are not a measurement: the meter dropped
    // to nothing for the rest of the turn instead of using the step that did report.
    const parts = [
      stepFinish({ input: 12_000, output: 40, reasoning: 0, cache: { read: 0, write: 0 } }),
      stepFinish({ input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }),
    ]

    expect(findLatestStepTokenUsage(parts)?.input).toBe(12_000)
  })

  test("answers null when no step reported usage", () => {
    expect(findLatestStepTokenUsage([stepFinish({ input: 0, output: 0 })])).toBeNull()
  })
})

describe("findLatestAssistantTokenUsage", () => {
  test("defaults the fields a provider omits instead of returning a NaN total", () => {
    // The step-level path above already guards the same omission. Summing the message's
    // fields unguarded made the total NaN, and the `total <= 0` guard reads NaN as a
    // measurement, so the message was admitted and the context meter rendered NaN%.
    expect(
      findLatestAssistantTokenUsage([{ id: "m1", role: "assistant", tokens: { input: 12_000, output: 40 } }]),
    ).toEqual({
      tokens: { input: 12_000, output: 40, reasoning: 0, cache: { read: 0, write: 0 } },
      messageId: "m1",
    })
  })

  test("keeps the context usage finite for a partial tokens payload", () => {
    const usage = findLatestAssistantTokenUsage([
      { id: "m1", role: "assistant", tokens: { input: 12_000, output: 40 } },
    ])
    expect(usage).not.toBeNull()

    const context = buildSessionContextUsage(usage!.tokens, { contextLimit: 200_000, outputLimit: 8_000 })
    expect(context.totalTokens).toBe(12_040)
    expect(context.percentage).toBe(6)
    expect(context.normalizedOutput).toBe(1)
  })

  test("skips a message whose tokens carry no usable number", () => {
    expect(findLatestAssistantTokenUsage([{ id: "m1", role: "assistant", tokens: {} }])).toBeNull()
    // A payload the provider never filled serializes as nulls, not numbers.
    expect(findLatestAssistantTokenUsage([{ id: "m1", role: "assistant", tokens: { input: null, output: null } }])).toBeNull()
    expect(
      findLatestAssistantTokenUsage([
        { id: "m1", role: "assistant", tokens: { input: Number.NaN, output: Number.POSITIVE_INFINITY } },
      ]),
    ).toBeNull()
    expect(findLatestAssistantTokenUsage([{ id: "m1", role: "assistant", tokens: 12_000 }])).toBeNull()
  })

  test("falls back to the previous assistant message when the newest carries no usage", () => {
    expect(
      findLatestAssistantTokenUsage([
        { id: "m1", role: "assistant", tokens: { input: 1_000, output: 10 } },
        { id: "m2", role: "assistant", tokens: { input: null, output: null } },
      ]),
    ).toEqual({
      tokens: { input: 1_000, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
      messageId: "m1",
    })
  })
})
