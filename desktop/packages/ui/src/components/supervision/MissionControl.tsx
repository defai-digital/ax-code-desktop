import React from "react"

import { Button } from "@/components/ui/button"
import { useConfirmDialog } from "@/components/ui/ConfirmDialog"
import { useSupervisionRows, type SupervisionRow } from "@/hooks/useSupervisionRows"
import { useI18n } from "@/lib/i18n"
import { formatShortcutForDisplay, getEffectiveShortcutCombo } from "@/lib/shortcuts"
import {
  filterRows,
  moveSelection,
  primaryActionFor,
  matchesMissionStatus,
  searchMissionRows,
  type MissionStatusFilter,
} from "@/lib/supervision/missionControl"
import { groupMissionRows } from "@/lib/supervision/missionGroups"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { MissionControlGroupHeader } from "./missionControl/MissionControlGroupHeader"
import { openBesideChat } from "@/lib/supervision/openBesideChat"
import { openSupervisedSession } from "@/lib/supervision/openSession"
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
import { useSessionUIStore } from "@/sync/session-ui-store"
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

  const scoped = React.useMemo(
    () =>
      filterRows(
        rows,
        activeWorkingSetId ? { kind: "workingSet" as const, workingSetId: activeWorkingSetId } : { kind: mode },
        workingSets,
        Date.now(),
      ),
    [rows, activeWorkingSetId, mode, workingSets],
  )
  const searched = React.useMemo(() => searchMissionRows(scoped, query), [scoped, query])
  const filtered = React.useMemo(
    () => searched.filter((row) => matchesMissionStatus(row.state, statusFilter)),
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
  const hiddenNeedsYou = rows.filter(
    (row) => needsHuman(row.state) && !filtered.some((visible) => visible.sessionId === row.sessionId),
  ).length
  const resetFilters = () => {
    setQuery("")
    setStatusFilter("all")
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
    if (event.nativeEvent.isComposing || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey)
      return
    if (event.shiftKey && event.key !== "/") return
    const target = event.target as HTMLElement

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

    const isInEditable = target.closest("input, textarea, select, [contenteditable='true']") !== null
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
    if (event.key === " ") {
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

  const renderRow = (row: SupervisionRow) => {
    const selected = row.sessionId === effectiveSelectedId
    const expanded = peekId === row.sessionId
    const peekRequests = expanded ? requestsForSessionTree(allPending, new Set(row.treeSessionIds)) : []
    return (
      <MissionControlRow
        key={row.sessionId}
        row={row}
        grouped={boardGroupBy === "project"}
        selected={selected}
        expanded={expanded}
        activeWorkingSetId={activeWorkingSetId}
        primaryLabel={primaryLabel(row.state)}
        onToggleDetails={(sessionId) => {
          setSelectedId(sessionId)
          setPeekId((current) => (current === sessionId ? null : sessionId))
        }}
        onSelect={setSelectedId}
        onOpen={openRow}
        onPrimary={handlePrimary}
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
      aria-activedescendant={effectiveSelectedId ? `mission-row-${effectiveSelectedId}` : undefined}
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
      />

      <MissionControlFilters
        searchRef={searchRef}
        query={query}
        onQueryChange={setQuery}
        status={statusFilter}
        onStatusChange={(next) => setStatusFilter((current) => (current === next ? "all" : next))}
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
              {query.trim() || statusFilter !== "all"
                ? t("supervision.missionControl.empty.filtered")
                : activeWorkingSetId
                  ? t("supervision.missionControl.empty.workingSet")
                  : mode === "recent"
                    ? t("supervision.missionControl.empty.recent")
                    : t("supervision.missionControl.empty.live")}
            </p>
            {query.trim() || statusFilter !== "all" ? (
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
      {confirmDialog}
    </div>
  )
}
