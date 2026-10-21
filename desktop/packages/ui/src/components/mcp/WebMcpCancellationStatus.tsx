import { webMcpDisplayText as redactWebMcpText } from "../../../../../shared/webmcp-redaction.mjs"
import { useI18n } from "@/lib/i18n"

export type WebMcpCancellation = { requestID: string; state: "stopped" | "still-finishing" }

/** Fixed result metadata only; page output and arguments never enter these acknowledgements. */
export function WebMcpCancellationStatus({ calls }: { calls: WebMcpCancellation[] }) {
  const { t } = useI18n()
  if (!calls.length) return null
  return (
    <ul role="status" aria-live="polite" className="w-full typography-micro">
      {calls.map((call) => (
        <li key={call.requestID}>
          {t(call.state === "stopped" ? "webmcp.browser.callStopped" : "webmcp.browser.callStillFinishing", {
            call: redactWebMcpText(call.requestID),
          })}
        </li>
      ))}
    </ul>
  )
}
