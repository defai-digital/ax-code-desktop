import { useConfigStore } from "@/stores/useConfigStore"
import { useUIStore } from "@/stores/useUIStore"

/** The Providers page's selection that shows the "add a provider" form instead of a connected provider. */
export const ADD_PROVIDER_ID = "__add_provider__"

/** Open Settings on the form that connects a new model provider. Settings is a dialog, so the view underneath stays. */
export function openAddProviderSettings(): void {
  useConfigStore.getState().setSelectedProvider(ADD_PROVIDER_ID)
  const ui = useUIStore.getState()
  ui.setSettingsPage("providers")
  ui.setSettingsDialogOpen(true)
}
