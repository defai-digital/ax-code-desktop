import type { FilesAPI, RuntimeAPIs } from "./api/types"

export function getRuntimeFilesAPI(): FilesAPI | null {
  if (typeof window === "undefined") return null
  const apis = (window as typeof window & { __AX_CODE_DESKTOP_RUNTIME_APIS__?: RuntimeAPIs })
    .__AX_CODE_DESKTOP_RUNTIME_APIS__
  if (apis?.files) {
    return apis.files
  }
  return null
}
