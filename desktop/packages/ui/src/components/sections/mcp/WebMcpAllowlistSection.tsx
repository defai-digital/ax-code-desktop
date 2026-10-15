import React from "react"
import type { WebMcpApprovalRecord } from "@defai-digital/ax-code-sdk/v2"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Icon } from "@/components/icon/Icon"
import { useConfirmDialog } from "@/components/ui/ConfirmDialog"
import { useI18n } from "@/lib/i18n"
import { getMcpApiClient } from "@/stores/useMcpStore"
import {
  buildGrantScopes,
  describeWebMcpScope,
  grantableOrigin,
  sortWebMcpApprovals,
  webMcpAllowlistErrorKey,
  WEBMCP_ALL_CAPABILITIES,
  type WebMcpAllowlistCapability,
} from "@/lib/webmcp/allowlist"

type Props = {
  serverName: string
  directory: string | null
}

/**
 * Per-project WebMCP approvals for one Chrome-bridge server. The runtime is
 * the only writer of the approvals store; this section lists, grants and
 * revokes through the MCP API and never touches managed config.
 */
export const WebMcpAllowlistSection: React.FC<Props> = ({ serverName, directory }) => {
  const { t } = useI18n()
  const tKey = React.useCallback(
    (key: string, params?: Record<string, unknown>) => t(key as never, params as never),
    [t],
  )
  const { requestConfirm, confirmDialog } = useConfirmDialog()
  const [records, setRecords] = React.useState<WebMcpApprovalRecord[] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [originInput, setOriginInput] = React.useState("")
  const [selected, setSelected] = React.useState<ReadonlySet<WebMcpAllowlistCapability>>(
    () => new Set<WebMcpAllowlistCapability>(["navigate", "read"]),
  )
  const mountedRef = React.useRef(true)
  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Only the newest request may publish: switching servers while a slow list is in flight must not show
  // (and later revoke by id against) another server's records.
  const requestGenerationRef = React.useRef(0)
  const refresh = React.useCallback(async () => {
    const generation = ++requestGenerationRef.current
    const isCurrent = () => mountedRef.current && generation === requestGenerationRef.current
    setLoading(true)
    try {
      const api = getMcpApiClient(directory)
      const result = await api.mcp.webMcpApprovals({ name: serverName }, { throwOnError: true })
      if (!isCurrent()) return
      setRecords(result.data ?? [])
      setLoadError(null)
    } catch (error) {
      if (!isCurrent()) return
      setLoadError(tKey(webMcpAllowlistErrorKey(error)))
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [directory, serverName, tKey])

  React.useEffect(() => {
    setRecords(null)
  }, [directory, serverName])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const sorted = React.useMemo(() => sortWebMcpApprovals(records ?? []), [records])
  const typedOrigin = React.useMemo(() => grantableOrigin(originInput), [originInput])
  const originTouched = originInput.trim().length > 0
  const needsOrigin = [...selected].some((capability) => capability !== "list_pages")
  const grantScopes = React.useMemo(
    () => buildGrantScopes({ originInput, capabilities: [...selected], existing: records ?? [] }),
    [originInput, selected, records],
  )
  const canAdd = !busy && selected.size > 0 && (!needsOrigin || typedOrigin !== undefined) && grantScopes.length > 0

  /** Runs a mutation and always reloads the list, so a partly applied change is never hidden. */
  const runMutation = React.useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      setBusy(true)
      setActionError(null)
      let succeeded = false
      try {
        await action()
        succeeded = true
      } catch (error) {
        if (mountedRef.current) setActionError(tKey(webMcpAllowlistErrorKey(error)))
      } finally {
        await refresh()
        if (mountedRef.current) setBusy(false)
      }
      return succeeded
    },
    [refresh, tKey],
  )

  const handleAdd = async () => {
    if (!canAdd) return
    const scopes = grantScopes
    const granted = await runMutation(async () => {
      const api = getMcpApiClient(directory)
      for (const scope of scopes) {
        await api.mcp.grantWebMcpApproval({ name: serverName, scope }, { throwOnError: true })
      }
    })
    if (granted && mountedRef.current) setOriginInput("")
  }

  const handleRemove = async (record: WebMcpApprovalRecord) => {
    const description = describeWebMcpScope(record.scope)
    const label =
      description.origin === null ? tKey(description.labelKey) : `${tKey(description.labelKey)} · ${description.origin}`
    const confirmed = await requestConfirm(tKey("webmcp.allowlist.confirmRemove", { scope: label }), {
      destructive: true,
    })
    if (!confirmed) return
    await runMutation(async () => {
      const api = getMcpApiClient(directory)
      await api.mcp.revokeWebMcpApproval({ name: serverName, id: record.id }, { throwOnError: true })
    })
  }

  const handleClearAll = async () => {
    const confirmed = await requestConfirm(tKey("webmcp.allowlist.confirmClearAll"), { destructive: true })
    if (!confirmed) return
    await runMutation(async () => {
      const api = getMcpApiClient(directory)
      await api.mcp.revokeWebMcpApproval({ name: serverName }, { throwOnError: true })
    })
  }

  const toggleCapability = (capability: WebMcpAllowlistCapability, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(capability)
      else next.delete(capability)
      return next
    })
  }

  return (
    <div className="mb-6">
      <div className="mb-1 px-1">
        <h3 className="typography-ui-header font-medium text-foreground">{tKey("webmcp.allowlist.title")}</h3>
      </div>
      <section className="px-2 pb-2 pt-0 space-y-3">
        <p className="typography-meta text-muted-foreground">{tKey("webmcp.allowlist.description")}</p>

        {loading && records === null ? (
          <p className="typography-meta text-muted-foreground">{tKey("webmcp.allowlist.loading")}</p>
        ) : loadError && records === null ? (
          <div className="space-y-2">
            <p className="typography-meta text-[var(--status-error)]">{loadError}</p>
            <Button variant="outline" size="xs" className="!font-normal" onClick={() => void refresh()}>
              {tKey("webmcp.allowlist.retry")}
            </Button>
          </div>
        ) : (
          <>
            {sorted.length === 0 ? (
              <p className="typography-meta text-muted-foreground">{tKey("webmcp.allowlist.empty")}</p>
            ) : (
              <div className="space-y-1.5">
                {sorted.map((record) => {
                  const description = describeWebMcpScope(record.scope)
                  return (
                    <div
                      key={record.id}
                      className="flex items-center gap-2 rounded-md border border-[var(--interactive-border)] bg-[var(--surface-elevated)] px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="typography-ui-label text-foreground">{tKey(description.labelKey)}</div>
                        <div className="typography-micro text-muted-foreground truncate">
                          {description.origin ?? tKey("webmcp.allowlist.allPages")}
                          {" · "}
                          {tKey("webmcp.allowlist.created", {
                            date: new Date(record.createdAt).toLocaleDateString(),
                          })}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 px-0 text-muted-foreground hover:text-[var(--status-error)]"
                        onClick={() => void handleRemove(record)}
                        disabled={busy}
                        aria-label={tKey("webmcp.allowlist.remove")}
                      >
                        <Icon name="delete-bin" className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )
                })}
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="xs"
                    className="!font-normal text-muted-foreground"
                    onClick={() => void handleClearAll()}
                    disabled={busy}
                  >
                    {tKey("webmcp.allowlist.clearAll")}
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2 rounded-md border border-[var(--interactive-border)] px-3 py-3">
              <span className="typography-ui-label text-foreground">{tKey("webmcp.allowlist.addTitle")}</span>
              <Input
                value={originInput}
                onChange={(event) => setOriginInput(event.target.value)}
                placeholder={tKey("webmcp.allowlist.originPlaceholder")}
                className="font-mono typography-meta"
                spellCheck={false}
              />
              {originTouched && needsOrigin && typedOrigin === undefined ? (
                <p className="typography-micro text-[var(--status-error)]">{tKey("webmcp.allowlist.invalidOrigin")}</p>
              ) : (
                <p className="typography-micro text-muted-foreground">{tKey("webmcp.allowlist.originHint")}</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {WEBMCP_ALL_CAPABILITIES.map((capability) => (
                  <label key={capability} className="flex cursor-pointer items-center gap-1.5">
                    <Checkbox
                      checked={selected.has(capability)}
                      onChange={(checked) => toggleCapability(capability, checked)}
                      ariaLabel={tKey(
                        `webmcp.allowlist.capability.${capability === "list_pages" ? "listPages" : capability}`,
                      )}
                    />
                    <span className="typography-ui-label text-foreground">
                      {tKey(`webmcp.allowlist.capability.${capability === "list_pages" ? "listPages" : capability}`)}
                    </span>
                  </label>
                ))}
              </div>
              {selected.size === 0 && (
                <p className="typography-micro text-[var(--status-error)]">
                  {tKey("webmcp.allowlist.selectCapability")}
                </p>
              )}
              <Button size="xs" className="!font-normal" onClick={() => void handleAdd()} disabled={!canAdd}>
                {busy ? tKey("webmcp.allowlist.adding") : tKey("webmcp.allowlist.add")}
              </Button>
            </div>
          </>
        )}

        {actionError && <p className="typography-meta text-[var(--status-error)]">{actionError}</p>}
        {loadError && records !== null && <p className="typography-meta text-[var(--status-error)]">{loadError}</p>}
      </section>
      {confirmDialog}
    </div>
  )
}
