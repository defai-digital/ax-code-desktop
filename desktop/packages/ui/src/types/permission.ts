export interface PermissionRequest {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  metadata: Record<string, unknown>
  always: string[]
  /**
   * Set by the runtime when this ask will auto-reply "once" at that time (unattended autonomous
   * runs with the sandbox off). Clients only render the countdown; the runtime timer is authoritative.
   */
  autoOnceAt?: number
  tool?: {
    messageID: string
    callID: string
  }
}

export type PermissionResponse = "once" | "always" | "reject"
