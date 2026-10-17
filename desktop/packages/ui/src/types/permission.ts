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
  /** Present only on bridge WebMCP requests that may be saved to the allowlist. */
  webmcpAllowlist?: {
    server: string
    project: string
    scope: { capability: "list_pages" } | { capability: "navigate" | "read" | "close"; origin: string }
  }
  autoOnceAt?: number
  /**
   * The runtime's own classification (AX Code ADR-212, runtime 7.26.4 and later). Descriptive only:
   * it orders and badges approvals and never decides one. Absent from older runtimes.
   */
  riskClass?: "safe" | "risk" | "unknown"
  /** No rule or autonomous policy may answer this request, and the runtime refuses an "always" reply. */
  interactiveOnly?: boolean
  tool?: {
    messageID: string
    callID: string
  }
}

export type PermissionResponse = "once" | "always" | "reject"
