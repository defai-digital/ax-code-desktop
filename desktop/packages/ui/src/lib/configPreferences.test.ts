import { expect, test } from "vitest"
import type { ProviderWithModelList } from "@/types/providerModels"
import { useConfigStore } from "@/stores/useConfigStore"
import { configPreferencePersistence, restoreConfigDirectories } from "./configPreferences"

test("writes directory choices without provider catalogues and preserves manual selection metadata", () => {
  const current = useConfigStore.getState()
  const restored = restoreConfigDirectories(
    { "/repo": { currentProviderId: "p", currentModelId: "m", selectionSource: "manual" } },
    {},
  )
  // Provider internals are irrelevant to this boundary: the serializer must drop the entire list.
  const provider: ProviderWithModelList = {
    id: "p",
    name: "Provider",
    options: {},
    env: [],
    source: "config",
    models: [],
  }
  const live = { ...current, directoryScoped: { "/repo": { ...restored["/repo"], providers: [provider] } } }
  const saved = configPreferencePersistence.partialize(live)
  expect(saved.directoryScoped?.["/repo"]).toMatchObject({
    providers: [],
    currentProviderId: "p",
    currentModelId: "m",
    selectionSource: "manual",
  })
  for (const key of ["providers", "modelsMetadata", "activeDirectoryKey", "loadProviders"])
    expect(saved).not.toHaveProperty(key)
  expect(live.directoryScoped["/repo"].providers).toEqual([provider])
})
test("malformed old migration is nonmutating and flows through the same directory validator", async () => {
  const snapshot = Object.freeze({ providers: ["retired"], agents: ["retired"], currentProviderId: "p" })
  const saved = Object.freeze({ directoryScoped: Object.freeze({ "/repo": snapshot, "/bad": null }) })
  const migrated = await useConfigStore.persist.getOptions().migrate?.(saved, 0)
  const restored = useConfigStore.persist.getOptions().merge?.(migrated, useConfigStore.getState())
  expect(restored?.directoryScoped["/repo"].providers).toEqual([])
  expect(restored?.directoryScoped["/repo"]).not.toHaveProperty("agents")
  expect(saved.directoryScoped["/repo"].agents).toEqual(["retired"])
})
