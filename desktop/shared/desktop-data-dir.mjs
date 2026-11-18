import os from "node:os"
import path from "node:path"

export function getDesktopDataDir() {
  const directory = process.env.AX_CODE_DESKTOP_DATA_DIR
  return directory ? path.resolve(directory) : path.join(os.homedir(), ".config", "openchamber")
}
