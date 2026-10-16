import React from "react"
import { Button } from "@/components/ui/button"
import { useMcpStore } from "@/stores/useMcpStore"
import { parseMcpOAuthCallbackStateKey } from "@/components/sections/mcp/mcpOAuth"
import { API_ENDPOINTS } from "@/lib/http"

const parseQueryParam = (params: URLSearchParams, key: string): string | null => {
  const value = params.get(key)
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed || null
}

const resolveMcpOAuthCallbackCode = (params: URLSearchParams): string => {
  const code = parseQueryParam(params, "code")
  if (!code) {
    throw new Error(
      "Missing OAuth authorization code. Start authorization again from MCP Settings or paste the returned code into AX Code manually.",
    )
  }
  return code
}

const normalizeMcpAuthErrorMessage = (error: unknown, fallback: string): string => {
  const message = error instanceof Error ? error.message : fallback
  if (/oauth state required/i.test(message)) {
    return "Authorization session expired or was cleared during reload. Return to AX Code and click Authorize again."
  }
  return message
}

const buildPendingAuthContextUrl = (stateKey: string): string =>
  `${API_ENDPOINTS.mcp.authPending}?state=${encodeURIComponent(stateKey)}`

type PendingAuthContextRef = {
  url: string
}

const resolvePendingAuthContextRef = (params: URLSearchParams): PendingAuthContextRef => {
  const stateKey = parseMcpOAuthCallbackStateKey(params)
  if (!stateKey) {
    throw new Error(
      "Authorization session details were not available. Start authorization again from MCP Settings or paste the returned code into AX Code manually.",
    )
  }
  return { url: buildPendingAuthContextUrl(stateKey) }
}

const clearPendingAuthContext = async (ref: PendingAuthContextRef): Promise<void> => {
  await fetch(ref.url, { method: "DELETE" }).catch(() => undefined)
}

const fetchPendingAuthContext = async (
  ref: PendingAuthContextRef,
): Promise<{
  name: string
  directory: string | null
}> => {
  const response = await fetch(ref.url)
  if (!response.ok) {
    throw new Error(
      "Authorization session details were not available. Start authorization again from MCP Settings or paste the returned code into AX Code manually.",
    )
  }

  const payload = (await response.json().catch(() => null)) as {
    name?: string
    directory?: string | null
  } | null
  if (!payload?.name?.trim()) {
    throw new Error(
      "Authorization session details were not available. Start authorization again from MCP Settings or paste the returned code into AX Code manually.",
    )
  }

  return {
    name: payload.name.trim(),
    directory: typeof payload.directory === "string" && payload.directory.trim() ? payload.directory.trim() : null,
  }
}

/**
 * The codes this page has exchanged, so one is exchanged once. An OAuth authorization code is
 * single-use: a second exchange fails at the provider, and the failure would replace the success
 * the page had just shown. That second run is not hypothetical — React's development StrictMode
 * invokes the effect twice, and the page can remount. A reload starts a new module instance and
 * does retry; the provider then answers that the code was already used, which is what the page
 * reports.
 */
const exchangedCodes = new Map<string, "running" | "done">()

export const McpOAuthCallbackPage: React.FC = () => {
  const completeAuth = useMcpStore((state) => state.completeAuth)
  const [status, setStatus] = React.useState<"working" | "success" | "error">("working")
  const [message, setMessage] = React.useState("Completing MCP authorization...")

  React.useEffect(() => {
    if (typeof window === "undefined") {
      setStatus("error")
      setMessage("Browser context unavailable.")
      return
    }

    const params = new URLSearchParams(window.location.search)
    const error = parseQueryParam(params, "error")
    const errorDescription = parseQueryParam(params, "error_description")
    let pendingAuthContextRef: PendingAuthContextRef

    try {
      pendingAuthContextRef = resolvePendingAuthContextRef(params)
    } catch (stateError) {
      setStatus("error")
      setMessage(normalizeMcpAuthErrorMessage(stateError, "Failed to complete MCP authorization."))
      return
    }

    if (error) {
      setStatus("error")
      setMessage(errorDescription ?? error)
      return
    }

    let code: string
    try {
      code = resolveMcpOAuthCallbackCode(params)
    } catch (codeError) {
      setStatus("error")
      setMessage(normalizeMcpAuthErrorMessage(codeError, "Failed to complete MCP authorization."))
      return
    }

    const exchangeState = exchangedCodes.get(code)
    if (exchangeState === "done") {
      setStatus("success")
      setMessage("Authorization completed. You can close this tab and return to AX Code.")
      return
    }
    if (exchangeState === "running") {
      // Already being exchanged by this session; leave the outcome to that run.
      return
    }
    exchangedCodes.set(code, "running")

    void (async () => {
      try {
        const pendingContext = await fetchPendingAuthContext(pendingAuthContextRef)

        await completeAuth(pendingContext.name, code, pendingContext.directory)
        await clearPendingAuthContext(pendingAuthContextRef)
        exchangedCodes.set(code, "done")
        setStatus("success")
        setMessage("Authorization completed. You can close this tab and return to AX Code.")
      } catch (authError) {
        // A failed exchange released nothing, so the code may still work: let a retry try again.
        exchangedCodes.delete(code)
        await clearPendingAuthContext(pendingAuthContextRef)
        setStatus("error")
        setMessage(normalizeMcpAuthErrorMessage(authError, "Failed to complete MCP authorization."))
      }
    })()
  }, [completeAuth])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-xl rounded-xl border border-[var(--interactive-border)] bg-[var(--surface-elevated)] p-8 shadow-sm">
        <div className="space-y-3 text-center">
          <div
            className={
              status === "error"
                ? "text-[var(--status-error)]"
                : status === "success"
                  ? "text-[var(--status-success)]"
                  : "text-[var(--status-info)]"
            }
          >
            <h1 className="typography-ui-header font-semibold">
              {status === "working"
                ? "Completing Authorization"
                : status === "success"
                  ? "Authorization Complete"
                  : "Authorization Failed"}
            </h1>
          </div>
          <p className="typography-markdown text-muted-foreground">{message}</p>
        </div>

        {status !== "working" && (
          <div className="mt-8 flex justify-center">
            <Button
              type="button"
              onClick={() => {
                if (typeof window === "undefined") {
                  return
                }
                window.location.replace("/")
              }}
            >
              Return to AX Code
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
