import type { DesktopSettings } from "@/lib/desktop"
import { readDirectoryPath } from "@/lib/pathValues"

type UpdateDesktopSettings = (changes: Partial<DesktopSettings>) => Promise<void>

type ReloadAxCodeConfiguration = (options?: { message?: string; mode?: "projects"; scopes?: ["all"] }) => Promise<void>

type SaveAxCodeCliSettingsResult = { status: "saved" } | { status: "failed"; error: unknown }

export const saveAxCodeCliSettings = async ({
  binaryPath,
  reloadMessage,
  updateDesktopSettings,
  reloadAxCodeConfiguration,
}: {
  binaryPath: string
  reloadMessage: string
  updateDesktopSettings: UpdateDesktopSettings
  reloadAxCodeConfiguration: ReloadAxCodeConfiguration
}): Promise<SaveAxCodeCliSettingsResult> => {
  try {
    await updateDesktopSettings({ axCodeBinary: readDirectoryPath(binaryPath) ?? "" })
    await reloadAxCodeConfiguration({
      message: reloadMessage,
      mode: "projects",
      scopes: ["all"],
    })
    return { status: "saved" }
  } catch (error) {
    return { status: "failed", error }
  }
}
