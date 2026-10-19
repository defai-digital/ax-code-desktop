import { createContext, useContext } from "react"
import type {
  AxEngineConnectionView,
  AxEngineModelsResponse,
  DesktopAxCodeRuntimeIdentity,
} from "@/lib/ax-code/axEngineModelsApi"

export function hasLocalModelResources(data: AxEngineModelsResponse | null): boolean {
  return Boolean(
    data?.server.running ||
      data?.models.some((model) => model.local.present) ||
      data?.jobs.some((job) => job.status === "queued" || job.status === "running"),
  )
}

// Unknown or failed capability checks are not evidence of an unsupported host.
// Preserve existing connections and resources even when local execution is unavailable.
export function showLocalModelsNavigation(
  data: AxEngineModelsResponse | null,
  connection: AxEngineConnectionView | null,
  error: string | null,
): boolean {
  return Boolean(
    error ||
      data?.eligibility.supported !== false ||
      !connection ||
      connection.mode === "attach" ||
      hasLocalModelResources(data),
  )
}

export interface LocalModelsState {
  directory: string | null
  data: AxEngineModelsResponse | null
  connection: AxEngineConnectionView | null
  runtimeIdentity: DesktopAxCodeRuntimeIdentity | null
  loading: boolean
  error: string | null
  load: () => Promise<void>
  setData: (data: AxEngineModelsResponse) => void
  setConnection: (connection: AxEngineConnectionView) => void
}

export const LocalModelsContext = createContext<LocalModelsState | null>(null)

export function useLocalModelsState(): LocalModelsState {
  const state = useContext(LocalModelsContext)
  if (!state) throw new Error("Local models require LocalModelsProvider")
  return state
}
