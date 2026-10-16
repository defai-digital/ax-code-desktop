/**
 * Reduce arbitrary text to a name the server accepts for an MCP server.
 *
 * The server requires lowercase alphanumerics with hyphens and underscores, and the create form
 * applied that rule as you typed - but a name taken from an imported config did not go through it,
 * so importing `{"mcpServers":{"Roblox_Studio":…}}` failed with a validation error the dialog only
 * reported as "Failed to save". Leading and trailing separators are dropped too: the server's rule
 * requires the name to start and end with an alphanumeric.
 */
export const normalizeMcpServerName = (value: string): string =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
