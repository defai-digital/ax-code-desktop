import React from "react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/icon/Icon"
import {
  ModelPickerList,
  type ModelPickerEntry,
  type ModelPickerProvider,
} from "@/components/model-picker/ModelPickerList"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useModelLists } from "@/hooks/useModelLists"
import {
  AGENT_TEAM_LIMITS,
  AGENT_TEAM_MINIMUMS,
  AGENT_TEAM_ROLES,
  COUNCIL_DEFAULT_MAX_MEMBERS,
  activeAgentTeamModels,
  agentTeamBlockedReason,
  agentTeamExtraModelCount,
  agentTeamRunner,
  agentTeamSelfReviewModels,
  emptyAgentTeam,
  isAgentTeamRoleIncomplete,
  isSameAgentTeamModel,
  toggleAgentTeamModel,
  usableAgentTeam,
  type AgentTeamModelRef,
  type AgentTeamRole,
  type AgentTeamState,
} from "@/lib/agentTeam"
import {
  applyAgentTeamSuggestion,
  suggestAgentTeam,
  type AgentTeamCandidate,
  type AgentTeamSuggestionReason,
  type SuggestedAgentTeamModel,
} from "@/lib/agentTeamSuggest"
import { useI18n, type I18nKey } from "@/lib/i18n"
import { getProviderModelDisabledReason } from "@/lib/providerModelAvailability"
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

const SUGGESTION_REASON_KEYS: Record<AgentTeamSuggestionReason, I18nKey> = {
  favorite: "chat.modelControls.favorites",
  recent: "chat.modelControls.recent",
  lead: "chat.agentTeam.suggest.reason.lead",
  otherProvider: "chat.agentTeam.suggest.reason.otherProvider",
  available: "chat.agentTeam.suggest.reason.available",
}

const EMPTY_TEAM = emptyAgentTeam()

const sameTeam = (a: AgentTeamState, b: AgentTeamState) => JSON.stringify(a) === JSON.stringify(b)

interface SuggestControlProps {
  team: AgentTeamState
  lead: AgentTeamModelRef | null
  compact: boolean
  nameOf: (model: AgentTeamModelRef) => string
  onSetTeam: (team: AgentTeamState) => void
}

/**
 * Proposes a Coder and QA team from the user's favorites, recent models and the catalog. The
 * proposal is shown before it changes anything, and applying it can be undone.
 */
const SuggestControl: React.FC<SuggestControlProps> = ({ team, lead, compact, nameOf, onSetTeam }) => {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)
  // The team before the last Apply, and the team that Apply produced. Undo is offered only while
  // the current team is still that result, so it never discards a later manual change.
  const [applied, setApplied] = React.useState<{ before: AgentTeamState; after: AgentTeamState } | null>(null)
  const providers = useConfigStore((s) => s.providers)
  const hiddenModels = useUIStore((s) => s.hiddenModels)
  const favorites = useUIStore((s) => s.favoriteModels)
  const recents = useUIStore((s) => s.recentModels)

  const suggestion = React.useMemo(() => {
    const candidates: AgentTeamCandidate[] = []
    for (const provider of providers) {
      for (const model of provider.models) {
        if (hiddenModels.some((h) => h.providerID === provider.id && h.modelID === model.id)) continue
        candidates.push({
          providerID: provider.id,
          modelID: model.id,
          toolCall: model.capabilities?.toolcall === true,
          reasoning: model.capabilities?.reasoning === true,
          releaseDate: model.release_date || undefined,
          unavailable: Boolean(getProviderModelDisabledReason(model, provider.id)),
        })
      }
    }
    return suggestAgentTeam({ candidates, favorites, recents, lead })
  }, [providers, hiddenModels, favorites, recents, lead])

  const next = applyAgentTeamSuggestion(team, suggestion)
  const hasSuggestion = suggestion.coder.length > 0 || suggestion.qa.length > 0
  const alreadyApplied = sameTeam(next, team)
  const canUndo = applied !== null && sameTeam(applied.after, team)

  const renderModels = (models: readonly SuggestedAgentTeamModel[], emptyKey: I18nKey) =>
    models.length === 0 ? (
      <p className="typography-micro text-[var(--status-warning)]">{t(emptyKey)}</p>
    ) : (
      models.map((model) => (
        <p key={`${model.providerID}/${model.modelID}`} className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate typography-meta">{nameOf(model)}</span>
          <span className="flex-shrink-0 typography-micro text-muted-foreground">
            {t(SUGGESTION_REASON_KEYS[model.reason])}
          </span>
        </p>
      ))
    )

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-agent-team-suggest
          aria-label={t("chat.agentTeam.suggest")}
          title={t("chat.agentTeam.suggest")}
          className={cn(
            // Framed like the role controls beside it, so it reads as a button and not as a caption.
            "inline-flex h-7 flex-shrink-0 items-center gap-1.5 rounded-md border px-2 typography-micro font-semibold",
            "border-[var(--interactive-border)] text-foreground hover:bg-[var(--interactive-hover)]",
            "aria-expanded:bg-[var(--interactive-hover)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-focus-ring)]",
          )}
        >
          <Icon name="sparkling" className="h-3.5 w-3.5 flex-shrink-0" />
          {compact ? null : <span>{t("chat.agentTeam.suggest")}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="flex w-[min(340px,calc(100vw-2rem))] flex-col gap-2 p-3">
        <p className="typography-meta font-medium">{t("chat.agentTeam.suggest.title")}</p>
        <div data-agent-team-suggestion="coder" className="flex flex-col gap-0.5">
          <p className="typography-micro font-semibold text-muted-foreground">{t("chat.agentTeam.coder")}</p>
          {renderModels(suggestion.coder, "chat.agentTeam.suggest.noCoder")}
        </div>
        <div data-agent-team-suggestion="qa" className="flex flex-col gap-0.5">
          <p className="typography-micro font-semibold text-muted-foreground">{t("chat.agentTeam.qa")}</p>
          {renderModels(suggestion.qa, "chat.agentTeam.suggest.noQa")}
        </div>
        <p className="typography-micro text-muted-foreground">{t("chat.agentTeam.suggest.note")}</p>
        <div className="flex items-center justify-end gap-2">
          {canUndo ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                onSetTeam(applied.before)
                setApplied(null)
              }}
            >
              {t("chat.agentTeam.suggest.undo")}
            </Button>
          ) : null}
          <Button
            type="button"
            size="xs"
            disabled={!hasSuggestion || alreadyApplied}
            onClick={() => {
              setApplied({ before: team, after: next })
              onSetTeam(next)
            }}
          >
            {t("chat.agentTeam.suggest.apply")}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

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
  // Ticked, but with too few models to run: the role is skipped on send, so it must not look active.
  const incomplete = isAgentTeamRoleIncomplete(team, role)
  const needsMore = t("chat.agentTeam.needsMore", { min: AGENT_TEAM_MINIMUMS[role] })
  const overCouncilLimit = role === "qa" && models.length > COUNCIL_DEFAULT_MAX_MEMBERS
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
      data-incomplete={incomplete ? "true" : undefined}
      className={cn(
        "inline-flex h-7 min-w-0 flex-shrink-0 items-center rounded-md border typography-micro transition-colors",
        !enabled && "border-[var(--interactive-border)]",
        enabled && !incomplete && "border-emerald-500/35 bg-emerald-500/10 dark:border-emerald-400/40",
        incomplete && "border-[var(--status-warning)]",
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
                    {incomplete ? (
                      <span className="flex-shrink-0 text-[var(--status-warning)]">{needsMore}</span>
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
            {incomplete ? <p className="text-[var(--status-warning)]">{needsMore}</p> : null}
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
              <span aria-live="polite" className="flex flex-col">
                <span className={atLimit ? "text-foreground" : undefined}>
                  {atLimit ? `${count} · ${t("chat.agentTeam.limitReached")}` : count}
                  {incomplete ? <span className="text-[var(--status-warning)]"> · {needsMore}</span> : null}
                </span>
                {overCouncilLimit ? (
                  <span className="text-[var(--status-warning)]">
                    {t("chat.agentTeam.hint.qaMemberLimit", { limit: COUNCIL_DEFAULT_MAX_MEMBERS })}
                  </span>
                ) : null}
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
  const storedTeam = useAgentTeamStore((s) => s.teamByDirectory[dirKey] ?? EMPTY_TEAM)
  const setRoleEnabled = useAgentTeamStore((s) => s.setRoleEnabled)
  const setTeam = useAgentTeamStore((s) => s.setTeam)
  const providers = useConfigStore((s) => s.providers)
  const leadProviderId = useConfigStore((s) => s.currentProviderId)
  const leadModelId = useConfigStore((s) => s.currentModelId)
  // Show, count and send the same models: a stored pick that can no longer run is left out here and
  // in the composer's send, and the next edit drops it from the store.
  const team = React.useMemo(() => usableAgentTeam(storedTeam, providers), [storedTeam, providers])

  const nameOf = React.useCallback(
    (ref: AgentTeamModelRef) => {
      const provider = providers.find((entry) => entry.id === ref.providerID)
      return provider?.models.find((model) => model.id === ref.modelID)?.name || ref.modelID
    },
    [providers],
  )

  const onToggleModel = React.useCallback(
    (role: AgentTeamRole, model: AgentTeamModelRef) =>
      setTeam(
        currentDirectory,
        toggleAgentTeamModel(team, role, { providerID: model.providerID, modelID: model.modelID }),
      ),
    [currentDirectory, setTeam, team],
  )
  const onSetEnabled = React.useCallback(
    (role: AgentTeamRole, enabled: boolean) => setRoleEnabled(currentDirectory, role, enabled),
    [currentDirectory, setRoleEnabled],
  )

  const onSetTeam = React.useCallback(
    (next: AgentTeamState) => setTeam(currentDirectory, next),
    [currentDirectory, setTeam],
  )
  const lead = React.useMemo(
    () => (leadProviderId && leadModelId ? { providerID: leadProviderId, modelID: leadModelId } : null),
    [leadProviderId, leadModelId],
  )

  if (workMode !== "agent") return null

  const selfReview = agentTeamSelfReviewModels(team, lead)
  const coders = activeAgentTeamModels(team, "coder")
  const qa = activeAgentTeamModels(team, "qa")
  // A CLI composer model cannot call the runtime tools, and a CLI coder cannot orchestrate its own
  // QA panel: either step is dropped on send, so the row says so instead of promising it.
  const blocked = lead ? agentTeamBlockedReason(team, lead) : null
  const runner = lead ? agentTeamRunner(team, lead) : null
  // Only a team model standing in for the composer pick is a substitution: a single coder is the
  // ordinary "this coder runs the message" case, and a kept lead is no change at all.
  const substituted =
    blocked === null && coders.length !== 1 && runner !== null && lead !== null && !isSameAgentTeamModel(runner, lead)
  const runnerHint =
    substituted && runner ? t("chat.agentTeam.hint.runnerSubstituted", { model: nameOf(runner) }) : null
  const extra = agentTeamExtraModelCount(team, lead)
  const extraHint = extra > 0 ? t("chat.agentTeam.hint.extraModels", { count: extra }) : null

  // The row states only the cost; what each role does is one hover away.
  const details: string[] = []
  if (runnerHint) details.push(runnerHint)
  if (coders.length === 1) details.push(t("chat.agentTeam.hint.coderSingle", { model: nameOf(coders[0]!) }))
  if (blocked === null && coders.length >= 2) details.push(t("chat.agentTeam.hint.coderArena"))
  if (blocked === null && qa.length > 0) details.push(t("chat.agentTeam.hint.qa"))
  // The substituted runner takes the row's visible line, so the cost cue moves into the detail.
  if (runnerHint && extraHint) details.push(extraHint)
  const warnings: string[] = []
  if (blocked === "cliCoderQa") warnings.push(t("chat.agentTeam.hint.cliCoderQa"))
  if (blocked === "noOrchestrator") warnings.push(t("chat.agentTeam.hint.noOrchestrator"))
  if (isAgentTeamRoleIncomplete(team, "qa")) {
    warnings.push(t("chat.agentTeam.hint.qaNeedsMore", { min: AGENT_TEAM_MINIMUMS.qa }))
  }
  if (blocked === null && qa.length > COUNCIL_DEFAULT_MAX_MEMBERS) {
    warnings.push(t("chat.agentTeam.hint.qaMemberLimit", { limit: COUNCIL_DEFAULT_MAX_MEMBERS }))
  }
  if (selfReview.length > 0) warnings.push(t("chat.agentTeam.selfReview"))
  const hint = runnerHint ?? extraHint ?? details[0] ?? warnings[0] ?? ""
  const warning = warnings.join(" ")
  // The tooltip is not the accessible name, so the warning and the swapped runner are spoken too.
  const spoken = [...new Set([warning, hint, runnerHint].filter((line): line is string => Boolean(line)))].join(" ")

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
      <SuggestControl team={team} lead={lead} compact={compact} nameOf={nameOf} onSetTeam={onSetTeam} />
      {hint && !compact ? (
        <Tooltip delayDuration={350}>
          <TooltipTrigger asChild>
            <span
              data-agent-team-hint
              data-warning={warning ? "true" : undefined}
              aria-label={spoken || undefined}
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
            {warnings.map((line) => (
              <p key={line} className="text-[var(--status-warning)]">
                {line}
              </p>
            ))}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}
