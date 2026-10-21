import { openSessionGrid } from "@/lib/supervision/openSessionGrid"
import React from "react"

import { toast } from "@/components/ui"
import { Button } from "@/components/ui/button"
import { useConfirmDialog } from "@/components/ui/ConfirmDialog"
import { useSupervisionRows, type SupervisionRow } from "@/hooks/useSupervisionRows"
import { useMissionControlPullRequests } from "@/hooks/useMissionControlPullRequests"
import { useRemoteActivityPreviews } from "@/hooks/useRemoteActivityPreviews"
import { useSupervisionVerificationDemand } from "@/hooks/useSupervisionVerification"
import { useI18n } from "@/lib/i18n"
import { formatShortcutForDisplay, getEffectiveShortcutCombo } from "@/lib/shortcuts"
import {
  filterRows,
  moveSelection,
  primaryActionFor,
  filterMissionFacets,
  updatedSinceViewed,
  type MissionStatusFilter,
  type MissionPrFilter,
} from "@/lib/supervision/missionControl"
import { groupMissionRows } from "@/lib/supervision/missionGroups"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { MissionControlGroupHeader } from "./missionControl/MissionControlGroupHeader"
import { openBesideChat } from "@/lib/supervision/openBesideChat"
import type { ActivityFeedEvent } from "@/lib/supervision/activityFeed"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import { openSessionBeside } from "@/lib/supervision/openSessionBeside"
import {
  canOpenSupervisionPopout,
  openDraftInMainWindow,
  openSessionInMainWindow,
  openSupervisionPopout,
} from "@/lib/supervision/popout"
import { requestsForSessionTree } from "@/lib/supervision/requests"
import { needsHuman, summarizeWorkInProgress, type SupervisionState } from "@/lib/supervision/sessionState"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useUIStore } from "@/stores/useUIStore"
import { useAllPendingRequests } from "@/sync/sync-context"
import { abortCurrentOperation, archiveSession } from "@/sync/session-actions"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { MissionControlActivityFeed } from "./missionControl/MissionControlActivityFeed"
import { MissionControlBulkBar } from "./missionControl/MissionControlBulkBar"
import { MissionControlFilters } from "./missionControl/MissionControlFilters"
import { MissionControlHeader } from "./missionControl/MissionControlHeader"
import { MissionControlPeek } from "./missionControl/MissionControlPeek"
import { MissionControlRow } from "./missionControl/MissionControlRow"

export interface MissionControlProps {
  /**
   * `embedded` is the board inside the main window. `popout` is the same board in its own window
   * (SPEC-2026-10-19-supervision-popout-v1): opening a session hands it to the main window, and controls
   * that only make sense beside the main window's chat are hidden.
   */
  variant?: "embedded" | "popout"
}

export const MissionControl: React.FC<MissionControlProps> = ({ variant = "embedded" }) => {
  const { t } = useI18n()
  const isPopout = variant === "popout"
  const rows = useSupervisionRows()
  const homeDirectory = useDirectoryStore((s) => s.homeDirectory)
  const boardGroupBy = useSupervisionStore((s) => s.boardGroupBy)
  const setBoardGroupBy = useSupervisionStore((s) => s.setBoardGroupBy)
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(() => new Set())
  const density = useSupervisionStore((s) => s.density)
  const setDensity = useSupervisionStore((s) => s.setDensity)
  const allPending = useAllPendingRequests()
  const workingSets = useSupervisionStore((s) => s.workingSets)
  const activeWorkingSetId = useSupervisionStore((s) => s.activeWorkingSetId)
  const setMissionControlOpen = useSupervisionStore((s) => s.setMissionControlOpen)
  const setActiveWorkingSet = useSupervisionStore((s) => s.setActiveWorkingSet)
  const createWorkingSet = useSupervisionStore((s) => s.createWorkingSet)
  const renameWorkingSet = useSupervisionStore((s) => s.renameWorkingSet)
  const deleteWorkingSet = useSupervisionStore((s) => s.deleteWorkingSet)
  const addToWorkingSet = useSupervisionStore((s) => s.addToWorkingSet)
  const removeFromWorkingSet = useSupervisionStore((s) => s.removeFromWorkingSet)
  const setCompareRunGroupKey = useSupervisionStore((s) => s.setCompareRunGroupKey)
  const shortcutOverrides = useUIStore((s) => s.shortcutOverrides)
  const { requestConfirm, confirmDialog } = useConfirmDialog()

  const [mode, setMode] = React.useState<"live" | "recent">(() => {
    const remembered = rows.find((row) => row.sessionId === useSupervisionStore.getState().boardFocusSessionId)
    return remembered?.state === "idle" ? "recent" : "live"
  })
  const [selectedId, updateSelectedId] = React.useState<string | null>(() => {
    const rememberedId = useSupervisionStore.getState().boardFocusSessionId
    return rows.some((row) => row.sessionId === rememberedId) ? rememberedId : null
  })
  const setSelectedId = React.useCallback((sessionId: string | null) => {
    updateSelectedId(sessionId)
    useSupervisionStore.setState({ boardFocusSessionId: sessionId })
  }, [])
  const [activityOpen, setActivityOpen] = React.useState(false)
  const [selectedSessionIds, setSelectedSessionIds] = React.useState<Set<string>>(() => new Set())
  const [bulkBusy, setBulkBusy] = React.useState(false)
  const bulkBusyRef = React.useRef(false)
  const [peekId, setPeekId] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [newSetName, setNewSetName] = React.useState("")
  const [renaming, setRenaming] = React.useState(false)
  const [renameValue, setRenameValue] = React.useState("")
  const [peekNewSetFor, setPeekNewSetFor] = React.useState<string | null>(null)
  const [peekNewSetName, setPeekNewSetName] = React.useState("")
  const boardRef = React.useRef<HTMLDivElement>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const [query, setQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<MissionStatusFilter>("all")

  const [selectedProjects, setSelectedProjects] = React.useState<{ key: string; label: string }[]>([])
  const projectFilters = React.useMemo(() => selectedProjects.map((project) => project.key), [selectedProjects])
  const [hasChanges, setHasChanges] = React.useState(false)
  const [checksFailing, setChecksFailing] = React.useState(false)
  const [prFilter, setPrFilter] = React.useState<MissionPrFilter>("all")
  const [updatedOnly, setUpdatedOnly] = React.useState(false)
  const lastViewedAt = useSupervisionStore((s) => s.lastViewedAt)
  const hasFilters =
    Boolean(query.trim()) ||
    statusFilter !== "all" ||
    projectFilters.length > 0 ||
    hasChanges ||
    checksFailing ||
    prFilter !== "all" ||
    updatedOnly

  const scopedSource = React.useMemo(
    () =>
      filterRows(
        rows,
        activeWorkingSetId ? { kind: "workingSet" as const, workingSetId: activeWorkingSetId } : { kind: mode },
        workingSets,
        Date.now(),
      ),
    [rows, activeWorkingSetId, mode, workingSets],
  )
  const { rows: scoped, setVisibleRows: setPrVisibleRows } = useMissionControlPullRequests(scopedSource)
  useSupervisionVerificationDemand(scoped)
  const projectOptions = React.useMemo(() => groupMissionRows(scoped, homeDirectory), [scoped, homeDirectory])
  // Each facet counts what selecting it would show: every other active filter applies, the project facet itself does not.
  const projectCounts = React.useMemo(() => {
    const counts = new Map<string, number>()
    const base = filterMissionFacets(scoped, {
      query,
      status: statusFilter,
      projectKeys: [],
      hasChanges,
      checksFailing,
      pr: prFilter,
      updatedOnly,
      lastViewedAt,
    })
    for (const group of groupMissionRows(base, homeDirectory)) counts.set(group.key, group.rows.length)
    return counts
  }, [scoped, query, statusFilter, hasChanges, checksFailing, prFilter, updatedOnly, lastViewedAt, homeDirectory])
  // Keep counts responsive to every other facet, without constraining the available project options.
  const searched = React.useMemo(
    () =>
      filterMissionFacets(scoped, {
        query,
        status: "all",
        projectKeys: projectFilters,
        hasChanges,
        checksFailing,
        pr: prFilter,
        updatedOnly,
        lastViewedAt,
      }),
    [scoped, query, projectFilters, hasChanges, checksFailing, prFilter, updatedOnly, lastViewedAt],
  )
  const filtered = React.useMemo(
    () => filterMissionFacets(searched, { query: "", status: statusFilter, projectKeys: [], hasChanges: false }),
    [searched, statusFilter],
  )
  const groups = React.useMemo(() => groupMissionRows(filtered, homeDirectory), [filtered, homeDirectory])
  const visibleRows = React.useMemo(
    () =>
      boardGroupBy === "project"
        ? groups.flatMap((group) => (collapsedGroups.has(group.key) ? [] : group.rows))
        : filtered,
    [boardGroupBy, groups, collapsedGroups, filtered],
  )
  React.useEffect(() => setPrVisibleRows(visibleRows), [setPrVisibleRows, visibleRows])
  const activityRows = useRemoteActivityPreviews(visibleRows)
  const bulkRows = visibleRows.filter((row) => selectedSessionIds.has(row.sessionId))
  const runningCount = bulkRows.filter((row) => row.state === "running").length
  React.useEffect(() => {
    const visibleIds = new Set(visibleRows.map((row) => row.sessionId))
    setSelectedSessionIds((current) => {
      // Membership, not size: an equal-sized set can still hold ids that left the view.
      return [...current].every((id) => visibleIds.has(id))
        ? current
        : new Set([...current].filter((id) => visibleIds.has(id)))
    })
  }, [visibleRows])

  const toggleSelection = (sessionId: string) => {
    setSelectedSessionIds((current) => {
      const next = new Set(current)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }
  const clearSelection = () => {
    setSelectedSessionIds(new Set())
    boardRef.current?.focus({ preventScroll: true })
  }

  const hiddenNeedsYou = rows.filter(
    (row) => needsHuman(row.state) && !filtered.some((visible) => visible.sessionId === row.sessionId),
  ).length
  const resetFilters = () => {
    setQuery("")
    setStatusFilter("all")
    setSelectedProjects([])
    setHasChanges(false)
    setChecksFailing(false)
    setPrFilter("all")
    setUpdatedOnly(false)
  }
  const wip = React.useMemo(() => summarizeWorkInProgress(rows), [rows])
  const activeSet = workingSets.find((s) => s.id === activeWorkingSetId) ?? null
  const shortcutHint = formatShortcutForDisplay(getEffectiveShortcutCombo("open_mission_control", shortcutOverrides))

  const selectedIndex = Math.max(
    0,
    visibleRows.findIndex((r) => r.sessionId === selectedId),
  )
  const effectiveSelectedId = visibleRows[selectedIndex]?.sessionId ?? null

  React.useEffect(() => {
    boardRef.current?.focus()
  }, [])

  React.useEffect(() => {
    // A filter that does not contain the remembered row may show another row.
    // That fallback must not replace the session Mod+Shift+H returns to.
    if (visibleRows.length && !visibleRows.some((r) => r.sessionId === selectedId)) {
      updateSelectedId(visibleRows[0].sessionId)
    }
    if (peekId && !visibleRows.some((r) => r.sessionId === peekId)) setPeekId(null)
  }, [visibleRows, selectedId, peekId])

  React.useEffect(() => {
    if (effectiveSelectedId) {
      document.getElementById(`mission-row-${effectiveSelectedId}`)?.scrollIntoView({ block: "nearest" })
    }
  }, [effectiveSelectedId])

  const openRow = React.useCallback(
    (row: SupervisionRow) => {
      useSupervisionStore.setState({ boardFocusSessionId: row.sessionId })
      const target = { sessionId: row.sessionId, projectId: row.projectId, directory: row.directory }
      if (isPopout) {
        void openSessionInMainWindow(target)
        return
      }
      openSupervisedSession(target)
    },
    [isPopout],
  )

  // A feed item selects its row when the board shows it. A session hidden by filters, the working set or a collapsed group is
  // opened instead, never substituted by whichever row is visible first; a session that no longer exists does nothing.
  // Read through a ref so the handler stays stable and the memoized feed does not re-render on every streamed update.
  const feedTargets = React.useRef({ visibleRows, rows, openRow, setSelectedId })
  feedTargets.current = { visibleRows, rows, openRow, setSelectedId }
  const selectFromFeed = React.useCallback((event: ActivityFeedEvent) => {
    const { visibleRows: shown, rows: all, openRow: open, setSelectedId: select } = feedTargets.current
    if (shown.some((row) => row.sessionId === event.sessionId)) {
      select(event.sessionId)
      return
    }
    const row = all.find((candidate) => candidate.sessionId === event.sessionId)
    if (row) open(row)
  }, [])

  // Cmd/Ctrl+click (or Cmd/Ctrl+Enter) keeps the current chat and shows the row's session beside it.
  const openRowBeside = React.useCallback((row: SupervisionRow) => {
    if (openSessionBeside({ sessionId: row.sessionId, directory: row.directory, title: row.title })) {
      useSupervisionStore.setState({ missionControlOpen: false, compareRunGroupKey: null })
    }
  }, [])
  // A child agent shares its root's project and directory, so it opens through the same path.
  const openChild = React.useCallback(
    (row: SupervisionRow, childSessionId: string) => openRow({ ...row, sessionId: childSessionId }),
    [openRow],
  )
  const reviewChangesForRow = React.useCallback(
    (row: SupervisionRow) => {
      openRow(row)
      // The pop-out has no chat to open the diff beside; the session opens in the main window instead.
      if (!isPopout) openBesideChat("diff")
    },
    [isPopout, openRow],
  )

  const handlePrimary = (row: SupervisionRow) => {
    const action = primaryActionFor(row.state)
    if (action === "review-request" || action === "answer") {
      setSelectedId(row.sessionId)
      setPeekId(row.sessionId)
      return
    }
    if (action === "review-changes") {
      reviewChangesForRow(row)
      return
    }
    openRow(row)
  }

  const primaryLabel = (state: SupervisionState) => {
    const action = primaryActionFor(state)
    if (action === "review-request") return t("supervision.missionControl.action.reviewRequest")
    if (action === "answer") return t("supervision.missionControl.action.answer")
    if (action === "review-changes") return t("supervision.missionControl.action.reviewChanges")
    return t("supervision.missionControl.action.open")
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (
      !isPopout &&
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      !(event.target as HTMLElement).closest("input, textarea, select, button, [contenteditable='true']")
    ) {
      const row = visibleRows.find((item) => item.sessionId === effectiveSelectedId)
      if (row) {
        event.preventDefault()
        openRowBeside(row)
      }
      return
    }
    if (event.nativeEvent.isComposing || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey)
      return
    if (event.shiftKey && event.key !== "/" && event.key.toLowerCase() !== "x") return
    const target = event.target as HTMLElement
    if (target.closest("[data-mission-project-filter]")) return

    if (target === searchRef.current && event.key === "Escape") {
      event.preventDefault()
      if (query) setQuery("")
      else boardRef.current?.focus({ preventScroll: true })
      return
    }
    if (event.key === "Escape") {
      const isInEditable = target.closest("input, textarea, select, [contenteditable='true']") !== null
      if (isInEditable) {
        return
      }
      event.preventDefault()
      if (peekId) {
        setPeekId(null)
        boardRef.current?.focus({ preventScroll: true })
      } else if (!isPopout) {
        setMissionControlOpen(false)
      }
      return
    }

    // A selection checkbox is a row control, not a text field: board keys keep working from it (Space still toggles it).
    const onSelectionCheckbox = target instanceof HTMLInputElement && target.type === "checkbox"
    const isInEditable =
      !onSelectionCheckbox && target.closest("input, textarea, select, [contenteditable='true']") !== null
    if (isInEditable) {
      return
    }

    const isOnInteractiveControl = target.closest("button, a[href], summary") !== null
    if (event.key === "/" && !isOnInteractiveControl) {
      event.preventDefault()
      searchRef.current?.focus()
      return
    }
    if (isOnInteractiveControl) {
      return
    }

    if (!visibleRows.length) {
      return
    }

    const lowerKey = event.key.toLowerCase()
    if (lowerKey === "x") {
      event.preventDefault()
      if (event.shiftKey) setSelectedSessionIds(new Set(visibleRows.map((row) => row.sessionId)))
      else if (effectiveSelectedId) toggleSelection(effectiveSelectedId)
      return
    }
    if (lowerKey === "j" || event.key === "ArrowDown") {
      event.preventDefault()
      const nextIndex = moveSelection(selectedIndex, 1, visibleRows.length)
      setSelectedId(visibleRows[nextIndex]?.sessionId ?? null)
      return
    }
    if (lowerKey === "k" || event.key === "ArrowUp") {
      event.preventDefault()
      const nextIndex = moveSelection(selectedIndex, -1, visibleRows.length)
      setSelectedId(visibleRows[nextIndex]?.sessionId ?? null)
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      const row = visibleRows[selectedIndex]
      if (row) {
        handlePrimary(row)
      }
      return
    }
    if (event.key === " " && !onSelectionCheckbox) {
      event.preventDefault()
      const row = visibleRows[selectedIndex]
      if (row) {
        setPeekId((current) => (current === row.sessionId ? null : row.sessionId))
      }
    }
  }

  const cancelRename = () => {
    setRenaming(false)
    setRenameValue("")
  }

  const submitCreate = () => {
    const name = newSetName.trim()
    if (!name) {
      return
    }
    const id = createWorkingSet(name)
    setActiveWorkingSet(id)
    cancelRename()
    setNewSetName("")
    setCreating(false)
  }

  const submitRename = () => {
    if (!activeSet || !renameValue.trim()) {
      return
    }
    renameWorkingSet(activeSet.id, renameValue)
    setRenaming(false)
  }

  const handleSelectMode = (nextMode: "live" | "recent") => {
    cancelRename()
    setActiveWorkingSet(null)
    setMode(nextMode)
  }

  const handleSelectWorkingSet = (id: string) => {
    cancelRename()
    setActiveWorkingSet(id)
  }

  const handleStartRename = () => {
    if (!activeSet) {
      return
    }
    setRenameValue(activeSet.name)
    setRenaming(true)
  }

  const handleDeleteWorkingSet = () => {
    if (!activeSet) {
      return
    }
    const setToDelete = activeSet
    void (async () => {
      const confirmed = await requestConfirm(
        t("supervision.missionControl.deleteWorkingSetConfirm", { name: setToDelete.name }),
        { destructive: true },
      )
      if (confirmed) {
        cancelRename()
        deleteWorkingSet(setToDelete.id)
      }
    })()
  }

  const handleNewSession = () => {
    if (isPopout) {
      void openDraftInMainWindow()
      return
    }
    useSessionUIStore.getState().openNewSessionDraft()
    setMissionControlOpen(false)
  }

  const handleClose = () => {
    setMissionControlOpen(false)
  }

  const handleStartPeekCreateSet = (sessionId: string) => {
    setPeekNewSetFor(sessionId)
    setPeekNewSetName("")
  }

  const handleSubmitPeekCreateSet = (row: SupervisionRow) => {
    const name = peekNewSetName.trim()
    if (!name) {
      return
    }
    const id = createWorkingSet(name, [row.sessionId])
    setActiveWorkingSet(id)
    cancelRename()
    setPeekNewSetFor(null)
  }

  const handleCancelPeekCreateSet = () => {
    setPeekNewSetFor(null)
  }

  const handleBulkAction = async (action: "stop" | "archive") => {
    if (bulkBusyRef.current) return
    // Freeze the target IDs before asking: later selection changes must not expand consent.
    const targets = bulkRows.filter((row) => action !== "stop" || row.state === "running")
    if (!targets.length) return
    bulkBusyRef.current = true
    setBulkBusy(true)
    try {
      const confirmed = await requestConfirm(
        t(
          action === "stop"
            ? "supervision.missionControl.bulk.stopConfirm"
            : "supervision.missionControl.bulk.archiveConfirm",
          {
            count: targets.length,
          },
        ),
        { destructive: true },
      )
      if (!confirmed) return
      let succeeded = 0
      let failed = 0
      let skipped = 0
      for (const { sessionId } of targets) {
        try {
          if (action === "stop") {
            // A session may finish or request permission while confirmation or another stop is pending.
            // A row that is momentarily missing (a live refresh) is still stopped as the user confirmed.
            const current = useSupervisionStore.getState().rows.find((row) => row.sessionId === sessionId)
            if (current && current.state !== "running") {
              skipped += 1
              continue
            }
            if (await abortCurrentOperation(sessionId)) succeeded += 1
            else failed += 1
          } else if (await archiveSession(sessionId, { notify: false })) {
            succeeded += 1
          } else {
            failed += 1
          }
        } catch {
          failed += 1
        }
      }
      const summary = t(
        action === "stop"
          ? "supervision.missionControl.bulk.stopSummary"
          : "supervision.missionControl.bulk.archiveSummary",
        { succeeded, failed, skipped },
      )
      if (failed) toast.error(summary)
      else toast.success(summary)
    } finally {
      bulkBusyRef.current = false
      setBulkBusy(false)
    }
  }

  const renderRow = (source: SupervisionRow) => {
    const row = activityRows.get(source.sessionId) ?? source
    const selected = row.sessionId === effectiveSelectedId
    const expanded = peekId === row.sessionId
    const peekRequests = expanded ? requestsForSessionTree(allPending, new Set(row.treeSessionIds)) : []
    return (
      <MissionControlRow
        key={row.sessionId}
        row={row}
        grouped={boardGroupBy === "project"}
        selected={selected}
        bulkSelected={selectedSessionIds.has(row.sessionId)}
        onToggleSelection={toggleSelection}
        expanded={expanded}
        activeWorkingSetId={activeWorkingSetId}
        primaryLabel={primaryLabel(row.state)}
        onToggleDetails={(sessionId) => {
          setSelectedId(sessionId)
          setPeekId((current) => (current === sessionId ? null : sessionId))
        }}
        onSelect={setSelectedId}
        onOpen={openRow}
        onOpenBeside={isPopout ? undefined : openRowBeside}
        onPrimary={handlePrimary}
        onOpenChild={openChild}
        onCompare={isPopout ? undefined : setCompareRunGroupKey}
        onRemoveFromSet={removeFromWorkingSet}
      >
        <MissionControlPeek
          row={row}
          requests={peekRequests}
          workingSets={workingSets}
          isCreatingSetForRow={peekNewSetFor === row.sessionId}
          newSetName={peekNewSetName}
          onNewSetNameChange={setPeekNewSetName}
          onOpen={openRow}
          onReviewChanges={isPopout ? undefined : reviewChangesForRow}
          onOpenBeside={isPopout ? undefined : openRowBeside}
          onAddToWorkingSet={addToWorkingSet}
          onStartCreateSet={handleStartPeekCreateSet}
          onSubmitCreateSet={handleSubmitPeekCreateSet}
          onCancelCreateSet={handleCancelPeekCreateSet}
        />
      </MissionControlRow>
    )
  }

  return (
    <div
      ref={boardRef}
      tabIndex={0}
      role="grid"
      aria-label={t("supervision.missionControl.boardLabel")}
      aria-multiselectable="true"
      aria-activedescendant={effectiveSelectedId ? `mission-row-${effectiveSelectedId}` : undefined}
      onKeyDownCapture={(event) => {
        if (
          event.key === "Escape" &&
          selectedSessionIds.size > 0 &&
          !(event.target as HTMLElement).closest("[data-mission-project-filter]") &&
          // Escape in a field (search, a new working-set name) belongs to that field.
          !(event.target as HTMLElement).closest(
            "input:not([type='checkbox']), textarea, select, [contenteditable='true']",
          ) &&
          !event.nativeEvent.isComposing &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          boardRef.current?.contains(event.target as Node)
        ) {
          event.preventDefault()
          event.stopPropagation()
          setSelectedSessionIds(new Set())
          if ((event.target as HTMLElement).closest('[role="toolbar"]'))
            boardRef.current?.focus({ preventScroll: true })
        }
      }}
      onKeyDown={handleKeyDown}
      className="mission-control-board flex min-h-0 flex-1 flex-col outline-none"
      data-density={density}
      data-mission-control={variant}
    >
      <MissionControlHeader
        boardGroupBy={boardGroupBy}
        onGroupByChange={setBoardGroupBy}
        density={density}
        onDensityChange={setDensity}
        wip={wip}
        mode={mode}
        workingSets={workingSets}
        activeWorkingSetId={activeWorkingSetId}
        activeSet={activeSet}
        creating={creating}
        newSetName={newSetName}
        renaming={renaming}
        renameValue={renameValue}
        shortcutHint={shortcutHint}
        onSelectMode={handleSelectMode}
        onSelectWorkingSet={handleSelectWorkingSet}
        onStartCreate={() => setCreating(true)}
        onNewSetNameChange={setNewSetName}
        onSubmitCreate={submitCreate}
        onCancelCreate={() => setCreating(false)}
        onStartRename={handleStartRename}
        onRenameValueChange={setRenameValue}
        onSubmitRename={submitRename}
        onCancelRename={cancelRename}
        onDeleteWorkingSet={handleDeleteWorkingSet}
        onDispatch={isPopout ? undefined : () => useSupervisionStore.getState().setQuickDispatchOpen(true)}
        onClose={isPopout ? undefined : handleClose}
        onPopOut={!isPopout && canOpenSupervisionPopout() ? () => void openSupervisionPopout() : undefined}
        activityOpen={activityOpen}
        onToggleActivity={() => setActivityOpen((open) => !open)}
      />

      <div className="mission-control-body">
        <div className="mission-control-main">
      <MissionControlFilters
        searchRef={searchRef}
        query={query}
        onQueryChange={setQuery}
        status={statusFilter}
        onStatusChange={(next) => setStatusFilter((current) => (current === next ? "all" : next))}
        projects={projectOptions.map((project) => ({
          key: project.key,
          label: project.label ?? t("supervision.missionControl.noProject"),
          count: projectCounts.get(project.key) ?? 0,
        }))}
        selectedProjects={selectedProjects}
        onProjectsChange={(keys) =>
          setSelectedProjects(
            keys.map((key) => ({
              key,
              label:
                projectOptions.find((project) => project.key === key)?.label ??
                selectedProjects.find((project) => project.key === key)?.label ??
                t("supervision.missionControl.noProject"),
            })),
          )
        }
        hasChanges={hasChanges}
        onHasChangesChange={setHasChanges}
        pr={prFilter}
        onPrChange={setPrFilter}
        checksFailing={checksFailing}
        onChecksFailingChange={setChecksFailing}
        updatedOnly={updatedOnly}
        onUpdatedOnlyChange={setUpdatedOnly}
        updatedCount={scoped.filter((row) => updatedSinceViewed(row, lastViewedAt)).length}
        rows={searched}
        shown={filtered.length}
        total={scoped.length}
        hiddenNeedsYou={hiddenNeedsYou}
        onShowNeedsYou={() => {
          resetFilters()
          handleSelectMode("live")
        }}
        onReset={resetFilters}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
            <p className="typography-ui-label text-muted-foreground">
              {hasFilters
                ? t("supervision.missionControl.empty.filtered")
                : activeWorkingSetId
                  ? t("supervision.missionControl.empty.workingSet")
                  : mode === "recent"
                    ? t("supervision.missionControl.empty.recent")
                    : t("supervision.missionControl.empty.live")}
            </p>
            {hasFilters ? (
              <Button size="sm" variant="outline" className="normal-case" onClick={resetFilters}>
                {t("supervision.missionControl.resetFilters")}
              </Button>
            ) : !activeWorkingSetId && mode === "live" ? (
              <Button size="sm" className="normal-case" onClick={handleNewSession}>
                {t("sessions.sidebar.header.actions.newSession")}
              </Button>
            ) : null}
          </div>
        ) : boardGroupBy === "project" ? (
          groups.map((group) => {
            const label = group.label ?? t("supervision.missionControl.noProject")
            const collapsed = collapsedGroups.has(group.key)
            return (
              <div key={group.key} role="rowgroup" aria-label={label}>
                <MissionControlGroupHeader
                  group={group}
                  label={label}
                  collapsed={collapsed}
                  selectedCount={group.rows.filter((row) => selectedSessionIds.has(row.sessionId)).length}
                  onToggleSelection={() => {
                    if (collapsed) return
                    setSelectedSessionIds((current) => {
                      const next = new Set(current)
                      const allSelected = group.rows.every((row) => current.has(row.sessionId))
                      for (const row of group.rows) {
                        if (allSelected) next.delete(row.sessionId)
                        else next.add(row.sessionId)
                      }
                      return next
                    })
                  }}
                  onToggle={() => {
                    setCollapsedGroups((current) => {
                      const next = new Set(current)
                      if (next.has(group.key)) next.delete(group.key)
                      else next.add(group.key)
                      return next
                    })
                  }}
                />
                {!collapsed ? group.rows.map(renderRow) : null}
              </div>
            )
          })
        ) : (
          visibleRows.map(renderRow)
        )}
      </div>
      {/* Mounted before any selection so the first change is announced; the bar itself appears with the selection. */}
      <span className="sr-only" role="status" aria-live="polite">
        {bulkRows.length > 0 ? t("supervision.missionControl.bulk.selected", { count: bulkRows.length }) : ""}
      </span>
      {bulkRows.length > 0 ? (
        <MissionControlBulkBar
          onOpenGrid={() => openSessionGrid(bulkRows)}
          count={bulkRows.length}
          runningCount={runningCount}
          busy={bulkBusy}
          workingSets={workingSets}
          onAddToWorkingSet={(id) => {
            for (const row of bulkRows) addToWorkingSet(id, row.sessionId)
          }}
          onCreateWorkingSet={(name) => {
            const id = createWorkingSet(
              name,
              bulkRows.map((row) => row.sessionId),
            )
            setActiveWorkingSet(id)
            cancelRename()
          }}
          onStop={() => void handleBulkAction("stop")}
          onArchive={() => void handleBulkAction("archive")}
          onClear={clearSelection}
        />
      ) : null}
        </div>
        {activityOpen ? <MissionControlActivityFeed onSelectSession={selectFromFeed} /> : null}
      </div>
      {confirmDialog}
    </div>
  )
}
