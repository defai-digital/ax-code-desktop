import React from "react"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/icon/Icon"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  AGENT_TEAM_LIMITS,
  AGENT_TEAM_ROLES,
  activeAgentTeamModels,
  agentTeamExtraModelCount,
  agentTeamSelfReviewModels,
  emptyAgentTeam,
  isSameAgentTeamModel,
  type AgentTeamModelRef,
  type AgentTeamRole,
  type AgentTeamState,
} from "@/lib/agentTeam"
import { useI18n, type I18nKey } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { parseWorkMode } from "@/lib/workMode"
import { useAgentTeamStore } from "@/stores/useAgentTeamStore"
import { useConfigStore } from "@/stores/useConfigStore"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useUIStore } from "@/stores/useUIStore"
import { useWorkModeStore } from "@/stores/useWorkModeStore"
import { normalizeDirectoryKey } from "@/stores/utils/directoryKey"

interface AgentTeamRowProps {
  /** Narrow composer: show counts instead of model names so the row never wraps. */
  compact?: boolean
  className?: string
}

interface ModelOption extends AgentTeamModelRef {
  name: string
}

interface ProviderOptions {
  id: string
  name: string
  models: ModelOption[]
}

const ROLE_LABEL_KEYS: Record<AgentTeamRole, I18nKey> = {
  coder: "chat.agentTeam.coder",
  qa: "chat.agentTeam.qa",
}

const EMPTY_TEAM = emptyAgentTeam()

/** Names shown on the collapsed control before the rest fold into "+N". */
const MAX_VISIBLE_NAMES = 2

interface RoleControlProps {
  role: AgentTeamRole
  team: AgentTeamState
  providers: ProviderOptions[]
  selfReview: AgentTeamModelRef[]
  compact: boolean
  nameOf: (model: AgentTeamModelRef) => string
  onToggleModel: (role: AgentTeamRole, model: AgentTeamModelRef) => void
  onSetEnabled: (role: AgentTeamRole, enabled: boolean) => void
}

const RoleControl: React.FC<RoleControlProps> = (props) => {
  const { role, team, providers, selfReview, compact, nameOf, onToggleModel, onSetEnabled } = props
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)
  const { enabled, models } = team[role]
  const max = AGENT_TEAM_LIMITS[role]
  const label = t(ROLE_LABEL_KEYS[role])
  const atLimit = models.length >= max
  const visible = enabled ? models.slice(0, MAX_VISIBLE_NAMES) : []
  const hidden = enabled ? models.length - visible.length : 0
  const names = models.map(nameOf).join(", ")
  const count = t("chat.agentTeam.selectedCount", { count: models.length, max })
  const menuTitle = t("chat.agentTeam.menuTitle", { role: label })

  const handleCheckbox = () => {
    if (enabled) {
      onSetEnabled(role, false)
      return
    }
    // A role cannot be on without a model, so the first tick opens the picker instead.
    if (models.length === 0) {
      setOpen(true)
      return
    }
    onSetEnabled(role, true)
  }

  return (
    <div
      data-agent-team-role={role}
      data-enabled={enabled ? "true" : "false"}
      className={cn(
        "inline-flex h-7 min-w-0 items-center rounded-md border typography-micro transition-colors",
        enabled
          ? "border-emerald-500/35 bg-emerald-500/10 dark:border-emerald-400/40"
          : "border-[var(--interactive-border)]",
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={enabled}
        aria-label={t("chat.agentTeam.toggle", { role: label })}
        onClick={handleCheckbox}
        className={cn(
          "inline-flex h-full flex-shrink-0 items-center gap-1.5 rounded-l-md pl-1.5 pr-1 font-semibold",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]",
          enabled ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border",
            enabled
              ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-black"
              : "border-current",
          )}
        >
          {enabled ? <Icon name="check" className="h-3 w-3" /> : null}
        </span>
        <span>{label}</span>
      </button>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <Tooltip delayDuration={350}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={models.length > 0 ? `${menuTitle}: ${names}` : menuTitle}
                className={cn(
                  "inline-flex h-full min-w-0 items-center gap-1 rounded-r-md border-l border-[var(--interactive-border)] pl-1.5 pr-1",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]",
                  enabled ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {!compact &&
                  visible.map((model) => (
                    <span
                      key={`${model.providerID}/${model.modelID}`}
                      className="max-w-[9rem] truncate rounded bg-[var(--interactive-hover)] px-1"
                    >
                      {nameOf(model)}
                    </span>
                  ))}
                {!compact && hidden > 0 ? <span className="text-muted-foreground">+{hidden}</span> : null}
                {enabled ? (
                  <span className="tabular-nums text-muted-foreground">
                    {models.length}/{max}
                  </span>
                ) : (
                  <span>{t("chat.agentTeam.upTo", { max })}</span>
                )}
                <Icon name="arrow-down-s" className="h-3.5 w-3.5 flex-shrink-0" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[18rem] typography-micro">
            <p className="font-medium">{menuTitle}</p>
            <p className="text-muted-foreground">{models.length > 0 ? names : t("chat.agentTeam.upTo", { max })}</p>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="max-h-[360px] min-w-[280px] overflow-y-auto">
          <DropdownMenuLabel className="flex items-center justify-between gap-3 typography-meta">
            <span>{menuTitle}</span>
            <span className="text-muted-foreground">{t("chat.agentTeam.upTo", { max })}</span>
          </DropdownMenuLabel>
          {providers.length === 0 ? (
            <p className="px-2 py-1 typography-micro text-muted-foreground">{t("chat.agentTeam.noModels")}</p>
          ) : null}
          {providers.map((provider) => (
            <DropdownMenuGroup key={provider.id}>
              <DropdownMenuLabel className="typography-micro text-muted-foreground">{provider.name}</DropdownMenuLabel>
              {provider.models.map((model) => {
                const checked = models.some((selected) => isSameAgentTeamModel(selected, model))
                const reviewsOwnWork = checked && selfReview.some((entry) => isSameAgentTeamModel(entry, model))
                return (
                  <DropdownMenuCheckboxItem
                    key={model.modelID}
                    checked={checked}
                    // Options past the limit stay visible so the user can see what a swap would offer.
                    disabled={!checked && atLimit}
                    closeOnClick={false}
                    onCheckedChange={() => onToggleModel(role, model)}
                    className="pr-7"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{model.name}</span>
                      {reviewsOwnWork ? (
                        <span className="typography-micro text-[var(--status-warning)]">
                          {t("chat.agentTeam.selfReview")}
                        </span>
                      ) : null}
                    </span>
                  </DropdownMenuCheckboxItem>
                )
              })}
            </DropdownMenuGroup>
          ))}
          <DropdownMenuSeparator />
          <p className="px-2 py-1 typography-micro text-muted-foreground" aria-live="polite">
            {atLimit ? `${count} · ${t("chat.agentTeam.limitReached")}` : count}
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/**
 * Optional Coder and QA model selection for the next message. Off by default; a send with neither
 * role ticked is unchanged. Only offered in Agent work mode: Council and Arena already route the
 * whole message to one ensemble tool.
 */
export const AgentTeamRow: React.FC<AgentTeamRowProps> = ({ compact = false, className }) => {
  const { t } = useI18n()
  const currentDirectory = useDirectoryStore((s) => s.currentDirectory)
  const dirKey = normalizeDirectoryKey(currentDirectory)
  const workMode = useWorkModeStore((s) => parseWorkMode(s.modeByDirectory[dirKey]))
  const team = useAgentTeamStore((s) => s.teamByDirectory[dirKey] ?? EMPTY_TEAM)
  const toggleModel = useAgentTeamStore((s) => s.toggleModel)
  const setRoleEnabled = useAgentTeamStore((s) => s.setRoleEnabled)
  const configProviders = useConfigStore((s) => s.providers)
  const leadProviderId = useConfigStore((s) => s.currentProviderId)
  const leadModelId = useConfigStore((s) => s.currentModelId)
  const hiddenModels = useUIStore((s) => s.hiddenModels)

  const providers = React.useMemo<ProviderOptions[]>(
    () =>
      configProviders
        .map((provider) => ({
          id: provider.id,
          name: provider.name || provider.id,
          models: provider.models
            .filter((model) => !hiddenModels.some((h) => h.providerID === provider.id && h.modelID === model.id))
            .map((model) => ({ providerID: provider.id, modelID: model.id, name: model.name || model.id })),
        }))
        .filter((provider) => provider.models.length > 0),
    [configProviders, hiddenModels],
  )

  const nameOf = React.useCallback(
    (ref: AgentTeamModelRef) => {
      const provider = providers.find((entry) => entry.id === ref.providerID)
      return provider?.models.find((model) => model.modelID === ref.modelID)?.name ?? ref.modelID
    },
    [providers],
  )

  const onToggleModel = React.useCallback(
    (role: AgentTeamRole, model: AgentTeamModelRef) =>
      toggleModel(currentDirectory, role, { providerID: model.providerID, modelID: model.modelID }),
    [currentDirectory, toggleModel],
  )
  const onSetEnabled = React.useCallback(
    (role: AgentTeamRole, enabled: boolean) => setRoleEnabled(currentDirectory, role, enabled),
    [currentDirectory, setRoleEnabled],
  )

  if (workMode !== "agent") return null

  const lead = leadProviderId && leadModelId ? { providerID: leadProviderId, modelID: leadModelId } : null
  const selfReview = agentTeamSelfReviewModels(team, lead)
  const coders = activeAgentTeamModels(team, "coder")
  const qa = activeAgentTeamModels(team, "qa")
  const extra = agentTeamExtraModelCount(team)

  const hints: string[] = []
  if (coders.length === 1) hints.push(t("chat.agentTeam.hint.coderSingle", { model: nameOf(coders[0]!) }))
  if (coders.length >= 2) hints.push(t("chat.agentTeam.hint.coderArena"))
  if (qa.length > 0) hints.push(t("chat.agentTeam.hint.qa"))
  if (extra > 0) hints.push(t("chat.agentTeam.hint.extraModels", { count: extra }))
  const hint = hints.join(" ")

  return (
    <div
      role="group"
      aria-label={t("chat.agentTeam.groupLabel")}
      data-agent-team-row
      className={cn("flex min-w-0 items-center gap-1.5", className)}
    >
      {AGENT_TEAM_ROLES.map((role) => (
        <RoleControl
          key={role}
          role={role}
          team={team}
          providers={providers}
          selfReview={role === "qa" ? selfReview : []}
          compact={compact}
          nameOf={nameOf}
          onToggleModel={onToggleModel}
          onSetEnabled={onSetEnabled}
        />
      ))}
      {hint && !compact ? (
        <span
          data-agent-team-hint
          title={hint}
          className={cn(
            "ml-auto min-w-0 truncate typography-micro",
            selfReview.length > 0 ? "text-[var(--status-warning)]" : "text-muted-foreground",
          )}
        >
          {selfReview.length > 0 ? `${t("chat.agentTeam.selfReview")} · ${hint}` : hint}
        </span>
      ) : null}
    </div>
  )
}
