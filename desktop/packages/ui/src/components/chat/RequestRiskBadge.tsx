import { Icon } from "@/components/icon/Icon"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { permissionRiskLevel } from "@/lib/supervision/requestRisk"
import type { PermissionRequest } from "@/types/permission"

/**
 * Badge for the runtime's classification of a permission request (AX Code ADR-212). Only the two
 * levels that need attention get one; safe and unclassified requests show nothing.
 */
export function RequestRiskBadge({
  request,
  className,
}: {
  request: Pick<PermissionRequest, "riskClass" | "interactiveOnly">
  className?: string
}) {
  const { t } = useI18n()
  const level = permissionRiskLevel(request)
  if (level !== "decide" && level !== "risk") return null
  const decide = level === "decide"
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 typography-micro font-medium",
        decide ? "bg-status-error/10 text-status-error" : "bg-status-warning/10 text-status-warning",
        className,
      )}
      title={decide ? t("permissionRisk.decide.description") : t("permissionRisk.risk.description")}
      data-request-risk={level}
    >
      <Icon name={decide ? "error-warning" : "alert"} className="h-3 w-3" aria-hidden="true" />
      {decide ? t("permissionRisk.decide.label") : t("permissionRisk.risk.label")}
    </span>
  )
}
