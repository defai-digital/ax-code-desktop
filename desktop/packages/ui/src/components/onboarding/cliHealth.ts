import { API_ENDPOINTS, HTTP_DEFAULTS } from "@/lib/http"
import { isPlainRecord } from "@/lib/record"

export const checkCliAvailability = async (): Promise<boolean> => {
  try {
    const response = await fetch(API_ENDPOINTS.debug.rootHealth, { method: HTTP_DEFAULTS.method.get })
    if (!response.ok) return false
    const data: unknown = await response.json()
    return isPlainRecord(data) && (data.axCodeRunning === true || data.isAxCodeReady === true)
  } catch {
    return false
  }
}
