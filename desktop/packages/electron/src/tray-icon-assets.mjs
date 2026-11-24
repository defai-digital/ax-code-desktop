import path from "node:path"

export const resolveTrayIconAssets = (resourcesRoot) => {
  const dir = path.join(resourcesRoot, "icons", "tray")
  const statusDir = path.join(dir, "status")
  const TRAY_BREATH_FRAME_COUNT = 16
  return {
    idleIconPath: path.join(dir, "trayTemplate-idle.png"),
    unseenIconPath: path.join(dir, "trayTemplate-unseen.png"),
    breathIconPaths: Array.from({ length: TRAY_BREATH_FRAME_COUNT }, (_, i) =>
      path.join(dir, `trayTemplate-breath-${String(i).padStart(2, "0")}.png`),
    ),
    statusIconPaths: {
      busy: path.join(statusDir, "busy.png"),
      retry: path.join(statusDir, "retry.png"),
      error: path.join(statusDir, "error.png"),
      unseen: path.join(statusDir, "unseen.png"),
      blank: path.join(statusDir, "blank.png"),
    },
  }
}
