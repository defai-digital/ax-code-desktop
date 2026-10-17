// Runtime MCP status presentation: the description, card tone and when the full status card shows.

export const getStatusDescription = (
  status: string | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
  error?: string,
  name?: string,
): string => {
  switch (status) {
    case "connected":
      return t("settings.mcp.page.status.description.connected")
    case "failed":
      return error?.trim() || t("settings.mcp.page.status.description.failedDefault")
    case "needs_auth":
      return t("settings.mcp.page.status.description.needsAuth")
    case "needs_client_registration":
      return error?.trim() || t("settings.mcp.page.status.description.needsClientRegistrationDefault")
    case "needs_trust":
      // Project-configured servers run arbitrary commands; the runtime only trusts them from its CLI.
      return t("settings.mcp.page.status.description.needsTrust", { name: name ?? "" })
    case "disabled":
      return t("settings.mcp.page.status.description.disabled")
    default:
      return t("settings.mcp.page.status.description.default")
  }
}

export const statusCardClass = (status: string | undefined): string => {
  switch (status) {
    case "failed":
      return "border-[var(--status-error-border)] bg-[var(--status-error-background)]"
    case "needs_auth":
    case "needs_client_registration":
    case "needs_trust":
      return "border-[var(--status-warning-border)] bg-[var(--status-warning-background)]"
    default:
      return "border-[var(--interactive-border)] bg-[var(--surface-elevated)]"
  }
}

export const shouldShowFullStatusCard = (
  status: string | undefined,
  authUrl: string | null,
  needsAuthorization: boolean,
  isAuthPolling: boolean,
): boolean => {
  // Only show full card for error/warning states or when auth is in progress
  if (
    status === "failed" ||
    status === "needs_auth" ||
    status === "needs_client_registration" ||
    status === "needs_trust"
  )
    return true
  if (authUrl) return true
  if (needsAuthorization || isAuthPolling) return true
  return false
}
