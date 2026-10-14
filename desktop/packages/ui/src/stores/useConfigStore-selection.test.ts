import { describe, expect, test } from "vitest"
import type { ProviderWithModelList } from "@/types/providerModels"
import { shouldKeepCurrentSelection } from "./useConfigStore-impl"

const providers = [
  {
    id: "claude-code",
    models: [{ id: "claude-sonnet", limit: { context: 200_000, output: 8_000 } }],
  },
  {
    id: "defai",
    models: [{ id: "deepseek-flash", limit: { context: 200_000, output: 8_000 } }],
  },
] as unknown as ProviderWithModelList[]

describe("shouldKeepCurrentSelection", () => {
  test("keeps a still-selectable selection when only the last-resort default resolved", () => {
    // Regression: loadAgents ran on every startup/refresh and moved the composer to
    // the first selectable provider (claude-code) even though the user's choice was
    // still valid.
    expect(shouldKeepCurrentSelection(true, providers, "defai", "deepseek-flash")).toBe(true)
  })

  test("lets a configured default or agent preference apply", () => {
    expect(shouldKeepCurrentSelection(false, providers, "defai", "deepseek-flash")).toBe(false)
  })

  test("does not keep a selection the fresh provider list no longer offers", () => {
    expect(shouldKeepCurrentSelection(true, providers, "defai", "removed-model")).toBe(false)
    expect(shouldKeepCurrentSelection(true, providers, "removed-provider", "deepseek-flash")).toBe(false)
  })

  test("does not keep an empty selection", () => {
    expect(shouldKeepCurrentSelection(true, providers, "", "")).toBe(false)
  })

  test("treats an empty provider list as the discovery window, not proof of removal", () => {
    // The jump happens later, once the list returns: nothing may be resolved against
    // an empty list. Here the empty list simply cannot confirm the selection.
    expect(shouldKeepCurrentSelection(true, [], "defai", "deepseek-flash")).toBe(false)
  })
})
