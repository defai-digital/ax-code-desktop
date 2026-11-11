import React from "react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/icon/Icon"
import {
  ModelPickerList,
  type ModelPickerEntry,
  type ModelPickerProvider,
} from "@/components/model-picker/ModelPickerList"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useModelLists } from "@/hooks/useModelLists"
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

const ROLE_LABEL_KEYS: Record<AgentTeamRole, I18nKey> = {
  coder: "chat.agentTeam.coder",
  qa: "chat.agentTeam.qa",
}

const EMPTY_TEAM = emptyAgentTeam()

interface RoleControlProps {
  role: AgentTeamRole
  team: AgentTeamState
  selfReview: AgentTeamModelRef[]
  compact: boolean
  nameOf: (model: AgentTeamModelRef) => string
  onToggleModel: (role: AgentTeamRole, model: AgentTeamModelRef) => void
  onSetEnabled: (role: AgentTeamRole, enabled: boolean) => void
}

const RoleControl: React.FC<RoleControlProps> = (props) => {
  const { role, team, selfReview, compact, nameOf, onToggleModel, onSetEnabled } = props
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const providers = useConfigStore((s) => s.providers)
  const hiddenModels = useUIStore((s) => s.hiddenModels)
  const toggleFavoriteModel = useUIStore((s) => s.toggleFavoriteModel)
  const isFavoriteModel = useUIStore((s) => s.isFavoriteModel)
  const { favoriteModelsList, recentModelsList } = useModelLists()
  const { enabled, models } = team[role]
  const max = AGENT_TEAM_LIMITS[role]
  const label = t(ROLE_LABEL_KEYS[role])
  const atLimit = models.length >= max
  const names = models.map(nameOf).join(", ")
  const count = t("chat.agentTeam.selectedCount", { count: models.length, max })
  const menuTitle = t("chat.agentTeam.menuTitle", { role: label })
  const upTo = t("chat.agentTeam.upTo", { max })

  const isSelected = React.useCallback(
    (entry: AgentTeamModelRef) => models.some((model) => isSameAgentTeamModel(model, entry)),
    [models],
  )
  // Options past the limit stay visible but inert, so the user can see what a swap would offer.
  const isRowDisabled = React.useCallback(
    (entry: ModelPickerEntry) => atLimit && !isSelected(entry),
    [atLimit, isSelected],
  )

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setSearchQuery("")
  }

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

  // The same labels as the composer's model picker: it is the same list, with the same favorites.
  const pickerLabels = {
    searchPlaceholder: t("chat.modelControls.searchModels"),
    noResults: t("chat.modelControls.noModelsFound"),
    favorites: t("chat.modelControls.favorites"),
    recent: t("chat.modelControls.recent"),
    keyboardHint: t("chat.modelControls.keyboardHintNavigate"),
    favorite: t("chat.modelControls.favoriteAria"),
    unfavorite: t("chat.modelControls.unfavoriteAria"),
    capabilities: t("chat.modelControls.capabilities"),
    capabilityToolCalling: t("chat.modelControls.capability.toolCalling"),
    capabilityReasoning: t("chat.modelControls.capability.reasoning"),
    input: t("chat.modelControls.input"),
    output: t("chat.modelControls.output"),
    costPerMillion: t("chat.modelControls.costPerMillion"),
    local: t("chat.modelControls.local"),
    localTooltip: t("chat.modelControls.localTooltip"),
  }

  return (
    <div
      data-agent-team-role={role}
      data-enabled={enabled ? "true" : "false"}
      className={cn(
        "inline-flex h-7 min-w-0 flex-shrink-0 items-center rounded-md border typography-micro transition-colors",
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
          "inline-flex h-full flex-shrink-0 items-center gap-1.5 rounded-l-md pl-2 pr-1.5 font-semibold",
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
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <Tooltip delayDuration={350}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={models.length > 0 ? `${menuTitle}: ${names}` : menuTitle}
                className={cn(
                  "inline-flex h-full min-w-0 items-center gap-1.5 rounded-r-md border-l border-[var(--interactive-border)] pl-2 pr-1.5",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]",
                  enabled ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {enabled ? (
                  // One readable name beats several clipped ones; the rest are in the tooltip and menu.
                  <>
                    {compact ? null : <span className="max-w-[11rem] truncate">{nameOf(models[0]!)}</span>}
                    {compact || models.length === 1 ? null : (
                      <span className="flex-shrink-0 text-muted-foreground">+{models.length - 1}</span>
                    )}
                    {compact ? (
                      <span className="flex-shrink-0 tabular-nums text-muted-foreground">
                        {models.length}/{max}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="flex-shrink-0">{upTo}</span>
                )}
                <Icon name="arrow-down-s" className="h-3.5 w-3.5 flex-shrink-0" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[18rem] typography-micro">
            <p className="font-medium">
              {menuTitle} · {models.length > 0 ? count : upTo}
            </p>
            {models.map((model) => (
              <p key={`${model.providerID}/${model.modelID}`} className="text-muted-foreground">
                {nameOf(model)}
              </p>
            ))}
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="flex w-[min(380px,calc(100vw-2rem))] flex-col p-0">
          <div className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-1.5 typography-meta">
            <span className="font-medium">{menuTitle}</span>
            <span className="text-muted-foreground">{upTo}</span>
          </div>
          <ModelPickerList
            providers={providers as ModelPickerProvider[]}
            favoriteModels={favoriteModelsList}
            recentModels={recentModelsList}
            modelsMetadata={useConfigStore.getState().modelsMetadata}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onSelect={(entry) => onToggleModel(role, entry)}
            labels={pickerLabels}
            hiddenModels={hiddenModels}
            isRowDisabled={isRowDisabled}
            isFavorite={(entry) => isFavoriteModel(entry.providerID, entry.modelID)}
            onToggleFavorite={(entry) => toggleFavoriteModel(entry.providerID, entry.modelID)}
            onEscape={() => handleOpenChange(false)}
            tooltipsEnabled={open}
            isRowSelected={isSelected}
            renderRowEnd={(entry) =>
              selfReview.some((model) => isSameAgentTeamModel(model, entry)) ? (
                <span className="flex-shrink-0 typography-micro text-[var(--status-warning)]">
                  {t("chat.agentTeam.selfReview")}
                </span>
              ) : null
            }
            footerContent={
              <span aria-live="polite" className={atLimit ? "text-foreground" : undefined}>
                {atLimit ? `${count} · ${t("chat.agentTeam.limitReached")}` : count}
              </span>
            }
          />
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
  const providers = useConfigStore((s) => s.providers)
  const leadProviderId = useConfigStore((s) => s.currentProviderId)
  const leadModelId = useConfigStore((s) => s.currentModelId)

  const nameOf = React.useCallback(
    (ref: AgentTeamModelRef) => {
      const provider = providers.find((entry) => entry.id === ref.providerID)
      return provider?.models.find((model) => model.id === ref.modelID)?.name || ref.modelID
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

  // The row states only the cost; what each role does is one hover away.
  const details: string[] = []
  if (coders.length === 1) details.push(t("chat.agentTeam.hint.coderSingle", { model: nameOf(coders[0]!) }))
  if (coders.length >= 2) details.push(t("chat.agentTeam.hint.coderArena"))
  if (qa.length > 0) details.push(t("chat.agentTeam.hint.qa"))
  const hint = extra > 0 ? t("chat.agentTeam.hint.extraModels", { count: extra }) : (details[0] ?? "")
  const warning = selfReview.length > 0 ? t("chat.agentTeam.selfReview") : ""

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
          selfReview={role === "qa" ? selfReview : []}
          compact={compact}
          nameOf={nameOf}
          onToggleModel={onToggleModel}
          onSetEnabled={onSetEnabled}
        />
      ))}
      {hint && !compact ? (
        <Tooltip delayDuration={350}>
          <TooltipTrigger asChild>
            <span
              data-agent-team-hint
              data-warning={warning ? "true" : undefined}
              aria-label={warning ? `${warning}. ${hint}` : undefined}
              tabIndex={0}
              className={cn(
                "ml-auto flex min-w-0 items-center gap-1 rounded typography-micro",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]",
                warning ? "text-[var(--status-warning)]" : "text-muted-foreground",
              )}
            >
              {warning ? <Icon name="error-warning" className="h-3.5 w-3.5 flex-shrink-0" /> : null}
              <span className="truncate">{hint}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[20rem] typography-micro">
            {details.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {warning ? <p className="text-[var(--status-warning)]">{warning}</p> : null}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}
