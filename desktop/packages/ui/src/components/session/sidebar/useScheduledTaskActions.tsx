import * as React from "react"
import { toast } from "@/components/ui"
import { useConfirmDialog } from "@/components/ui/ConfirmDialog"
import { refreshGlobalSessions } from "@/stores/useGlobalSessionsStore"
import { getScheduledTaskGroup, useScheduledTasksStore } from "@/stores/useScheduledTasksStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useI18n } from "@/lib/i18n"
import { ScheduledTaskCreateRecoveryRequired, ScheduledTaskRejectedError } from "@/lib/scheduledTaskErrors"
import {
  createScheduledTasks,
  deleteScheduledTasks,
  expandPromptSnippets,
  reconcileScheduledTaskFamily,
  runScheduledTaskNow,
  setScheduledTasksEnabled,
} from "@/lib/scheduledTasksApi"
import { buildRuntimeScheduledTaskPayloads, stripFanOutSuffix } from "@/lib/scheduledTaskTransform"
import { ScheduledTaskEditorDialog, type ScheduledTaskEditorSubmit } from "../ScheduledTaskEditorDialog"
import { ScheduledTaskRunHistoryDialog, type ScheduledTaskRunHistoryTarget } from "../ScheduledTaskRunHistoryDialog"
import { normalizeDirectory } from "../scheduledTaskGroups"
import {
  familyMemberIDs,
  groupScheduledTaskFamilies,
  isExpiredOneShotFamily,
  isIrregularFamily,
  planFamilyFieldUpdate,
  planFamilyReconciliation,
  resolveFamilyMembers,
  type ScheduledTaskFamily,
} from "../scheduledTaskFamilies"
import { pendingEntryKey } from "../scheduledTaskPending"

// The editor shows its irregular-schedule note from the same rule this hook
// plans with, so the rule lives in the families module.
export { isIrregularFamily }

type EditorTarget = {
  directory: string
  projectLabel: string
  /** The family being edited; null for a new task. */
  family: ScheduledTaskFamily | null
}

export type ScheduledTaskActions = {
  openNewTask: (directory: string, projectLabel: string) => void
  openEditTask: (family: ScheduledTaskFamily, directory: string, projectLabel: string) => void
  toggleEnabled: (family: ScheduledTaskFamily, directory: string, enabled: boolean) => Promise<void>
  deleteTask: (family: ScheduledTaskFamily, directory: string) => Promise<void>
  runNow: (family: ScheduledTaskFamily, directory: string) => Promise<void>
  openRunHistory: (family: ScheduledTaskFamily, directory: string, projectLabel: string) => void
  /** Row keys (`pendingEntryKey`) with a mutation in flight. */
  busyKeys: ReadonlySet<string>
  /** The editor and confirm dialogs; render once next to the list. */
  dialogs: React.ReactNode
}

/**
 * Mutations for the sidebar's scheduled tasks. Same semantics as the retired
 * scheduler dialog: family-aware save with fail-closed reconciliation, pause,
 * resume and delete on every member, run now on the primary member only. The
 * parts of a family share prompt, agent, model and catch-up policy (they are
 * the grouping key) and differ only in schedule slot, so one run delivers the
 * family's work; running every part would repeat the same prompt N times.
 */
export function useScheduledTaskActions(): ScheduledTaskActions {
  const { t } = useI18n()
  const loadGroup = useScheduledTasksStore((state) => state.loadGroup)
  const patchGroupTasks = useScheduledTasksStore((state) => state.patchGroupTasks)
  const { requestConfirm, confirmDialog } = useConfirmDialog()
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editorTarget, setEditorTarget] = React.useState<EditorTarget | null>(null)
  const [saveBlockedReason, setSaveBlockedReason] = React.useState<string | null>(null)
  const createAttempt = React.useRef<{ confirmed: Set<string>; blockedReason: string | null }>({
    confirmed: new Set(),
    blockedReason: null,
  })
  const [busyKeys, setBusyKeys] = React.useState<ReadonlySet<string>>(() => new Set())
  const [historyTarget, setHistoryTarget] = React.useState<ScheduledTaskRunHistoryTarget | null>(null)

  const markBusy = React.useCallback((key: string, busy: boolean) => {
    setBusyKeys((prev) => {
      if (prev.has(key) === busy) {
        return prev
      }
      const next = new Set(prev)
      if (busy) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }, [])

  const openNewTask = React.useCallback((directory: string, projectLabel: string) => {
    createAttempt.current = { confirmed: new Set(), blockedReason: null }
    setSaveBlockedReason(null)
    setEditorTarget({ directory: normalizeDirectory(directory), projectLabel, family: null })
    setEditorOpen(true)
  }, [])

  const openEditTask = React.useCallback((family: ScheduledTaskFamily, directory: string, projectLabel: string) => {
    createAttempt.current = { confirmed: new Set(), blockedReason: null }
    setSaveBlockedReason(null)
    setEditorTarget({ directory: normalizeDirectory(directory), projectLabel, family })
    setEditorOpen(true)
  }, [])

  // The editor is often opened from a row menu whose item is gone when the
  // dialog closes; put focus back on the edited row instead of the body.
  const handleEditorOpenChange = React.useCallback(
    (open: boolean) => {
      setEditorOpen(open)
      if (open || !editorTarget?.family) {
        return
      }
      const rowKey = pendingEntryKey(editorTarget.directory, editorTarget.family.key)
      requestAnimationFrame(() => {
        const rows = document.querySelectorAll<HTMLElement>("[data-scheduled-task-row]")
        for (const row of rows) {
          if (row.getAttribute("data-scheduled-task-row") === rowKey) {
            row.querySelector<HTMLElement>("button")?.focus()
            return
          }
        }
      })
    },
    [editorTarget],
  )

  const handleSave = React.useCallback(
    async (submit: ScheduledTaskEditorSubmit) => {
      const attempt = createAttempt.current
      if (!submit.memberIDs && attempt.blockedReason) throw new Error(attempt.blockedReason)
      const target = editorTarget
      const directory = target?.directory ?? ""
      if (!directory) {
        throw new Error(t("sessions.scheduledTasks.dialog.error.chooseProjectFirst"))
      }
      // The project may have been removed while the editor was open.
      const stillRegistered = useProjectsStore
        .getState()
        .projects.some((project) => normalizeDirectory(project.path) === directory)
      if (!stillRegistered) {
        throw new Error(t("sessions.sidebar.scheduled.error.projectRemoved"))
      }
      // Client-side fan-out: a multi-time/multi-weekday draft becomes N
      // runtime tasks. Snippet references are pre-expanded because the runtime
      // executes the stored prompt verbatim.
      const prompt = await expandPromptSnippets(directory, submit.input.prompt)
      const payloads = buildRuntimeScheduledTaskPayloads({ ...submit.input, prompt })
      if (!payloads || payloads.length === 0) {
        throw new Error(t("sessions.scheduledTasks.dialog.toast.updateFailed"))
      }
      if (submit.memberIDs) {
        const editorFamily = target?.family ?? null
        // Read the group as it is now, not as it was when the editor opened.
        const groupTasks = getScheduledTaskGroup(directory).tasks
        const orderedIDs = editorFamily ? familyMemberIDs(editorFamily) : submit.memberIDs
        const baseTitle = stripFanOutSuffix(submit.input.name.trim())
        const { members, missing } = resolveFamilyMembers(groupTasks, orderedIDs, {
          baseTitles: [editorFamily?.title ?? "", baseTitle],
          schedules: payloads.map((payload) => payload.schedule),
          shared: {
            prompt: payloads[0].prompt,
            agent: payloads[0].agent,
            model: payloads[0].model,
            catchUpPolicy: payloads[0].catchUpPolicy,
          },
        })
        // Fail closed when the family changed underneath the editor: a plan
        // built from a partial set would create duplicates next to parts
        // that still run.
        if (missing.length > 0) {
          await loadGroup(directory)
          throw new Error(t("sessions.scheduledTasks.dialog.error.taskChanged"))
        }
        const status = submit.enabledChanged ? (submit.enabled ? "active" : "paused") : null
        const current = groupScheduledTaskFamilies(members)
        const irregular = isIrregularFamily(current)
        const plan =
          irregular && !submit.scheduleChanged
            ? planFamilyFieldUpdate(
                members,
                {
                  title: baseTitle,
                  prompt: payloads[0].prompt,
                  agent: payloads[0].agent,
                  model: payloads[0].model,
                  catchUpPolicy: payloads[0].catchUpPolicy,
                },
                status,
              )
            : planFamilyReconciliation(members, payloads, status)
        try {
          await reconcileScheduledTaskFamily(directory, plan)
        } catch (error) {
          // Show what the runtime actually has (parts created before the
          // failure included) so a retry adopts them instead of duplicating.
          await loadGroup(directory)
          throw error
        }
      } else {
        try {
          await createScheduledTasks(directory, payloads, {
            pause: !submit.enabled,
            onCreated: (taskID) => attempt.confirmed.add(taskID),
          })
        } catch (error) {
          // The runtime refused the payload outright before anything of this draft existed
          // (an invalid schedule, the project's task cap): the draft is safe to correct and
          // resend, so the refusal is reported instead of locking the editor.
          if (error instanceof ScheduledTaskRejectedError && attempt.confirmed.size === 0) {
            throw error
          }
          // A missing acknowledgement does not prove creation failed. Without a producer
          // idempotency key, resending this draft can duplicate confirmed or uncertain writes.
          attempt.blockedReason = t("sessions.scheduledTasks.editor.creationUncertain", {
            count: attempt.confirmed.size,
          })
          if (createAttempt.current === attempt) setSaveBlockedReason(attempt.blockedReason)
          await loadGroup(directory)
          throw new ScheduledTaskCreateRecoveryRequired(attempt.blockedReason, { cause: error })
        }
      }
      await loadGroup(directory)
      toast.success(t("sessions.scheduledTasks.dialog.toast.saved"))
    },
    [editorTarget, loadGroup, t],
  )

  // Row actions act on the family as the store has it now, not on the row's
  // render-time snapshot: a part added or removed elsewhere must not be left
  // running (pause) or orphaned (delete). A family that is gone reloads the
  // project and reports the change instead of acting on stale ids.
  const resolveCurrentFamily = React.useCallback(
    async (family: ScheduledTaskFamily, directory: string): Promise<ScheduledTaskFamily | null> => {
      const current = groupScheduledTaskFamilies(getScheduledTaskGroup(directory).tasks).find(
        (candidate) => candidate.key === family.key,
      )
      if (current) {
        return current
      }
      await loadGroup(directory)
      toast.error(t("sessions.scheduledTasks.dialog.error.taskChanged"))
      return null
    },
    [loadGroup, t],
  )

  const toggleEnabled = React.useCallback(
    async (rowFamily: ScheduledTaskFamily, directory: string, enabled: boolean) => {
      const key = pendingEntryKey(directory, rowFamily.key)
      markBusy(key, true)
      try {
        const family = await resolveCurrentFamily(rowFamily, directory)
        if (!family) {
          return
        }
        if (enabled && isExpiredOneShotFamily(family, Date.now())) {
          // The runtime refuses to resume a one-time task whose time has
          // passed (its schedule has no occurrence left), so the row says what
          // works instead of sending a request that will be rejected.
          toast.error(t("sessions.scheduledTasks.dialog.toast.resumeExpiredOnce"))
          return
        }
        const memberIDs = familyMemberIDs(family)
        const previous = new Map(family.members.map((member) => [member.id, member.status]))
        patchGroupTasks(directory, (tasks) =>
          tasks.map((item) => (previous.has(item.id) ? { ...item, status: enabled ? "active" : "paused" } : item)),
        )
        try {
          await setScheduledTasksEnabled(directory, memberIDs, enabled)
        } catch (error) {
          // Undo the optimistic status first, so a reload that also fails
          // cannot leave the row claiming a state the runtime does not have.
          patchGroupTasks(directory, (tasks) =>
            tasks.map((item) => {
              const status = previous.get(item.id)
              return status ? { ...item, status } : item
            }),
          )
          toast.error(error instanceof Error ? error.message : t("sessions.scheduledTasks.dialog.toast.updateFailed"))
        }
        // Brings the runtime's next run times (and the true state after a
        // partial failure).
        await loadGroup(directory)
      } finally {
        markBusy(key, false)
      }
    },
    [loadGroup, markBusy, patchGroupTasks, resolveCurrentFamily, t],
  )

  const deleteTask = React.useCallback(
    async (rowFamily: ScheduledTaskFamily, directory: string) => {
      const confirmed = await requestConfirm(
        rowFamily.members.length > 1
          ? t("sessions.scheduledTasks.dialog.confirm.deleteFamily", {
              taskName: rowFamily.title,
              count: rowFamily.members.length,
            })
          : t("sessions.scheduledTasks.dialog.confirm.deleteTask", { taskName: rowFamily.title }),
        { destructive: true },
      )
      if (!confirmed) {
        return
      }
      const key = pendingEntryKey(directory, rowFamily.key)
      markBusy(key, true)
      try {
        const family = await resolveCurrentFamily(rowFamily, directory)
        if (!family) {
          return
        }
        await deleteScheduledTasks(directory, familyMemberIDs(family))
        toast.success(t("sessions.scheduledTasks.dialog.toast.deleted"))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("sessions.scheduledTasks.dialog.toast.deleteFailed"))
      } finally {
        await loadGroup(directory)
        markBusy(key, false)
      }
    },
    [loadGroup, markBusy, requestConfirm, resolveCurrentFamily, t],
  )

  const runNow = React.useCallback(
    async (rowFamily: ScheduledTaskFamily, directory: string) => {
      const key = pendingEntryKey(directory, rowFamily.key)
      markBusy(key, true)
      try {
        const family = await resolveCurrentFamily(rowFamily, directory)
        if (!family) {
          return
        }
        await runScheduledTaskNow(directory, family.primary.id)
        await Promise.all([loadGroup(directory), refreshGlobalSessions()])
        toast.success(t("sessions.scheduledTasks.dialog.toast.started"))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("sessions.scheduledTasks.dialog.toast.runFailed"))
      } finally {
        markBusy(key, false)
      }
    },
    [loadGroup, markBusy, resolveCurrentFamily, t],
  )

  const openRunHistory = React.useCallback((family: ScheduledTaskFamily, directory: string, projectLabel: string) => {
    setHistoryTarget({
      directory: normalizeDirectory(directory),
      title: family.title,
      projectLabel,
      taskIDs: familyMemberIDs(family),
    })
  }, [])

  // Keyed by target: the dialog seeds its draft from the first render and only
  // resets it in an effect, so without a remount the editor opened for another
  // task painted the previous task's name, prompt and schedule for a frame.
  const editorKey = editorTarget ? `${editorTarget.directory}\u0000${editorTarget.family?.key ?? "new"}` : "none"
  const dialogs = (
    <>
      <ScheduledTaskEditorDialog
        key={editorKey}
        open={editorOpen}
        task={editorTarget?.family?.primary ?? null}
        family={editorTarget?.family ?? undefined}
        projectLabel={editorTarget?.projectLabel}
        saveBlockedReason={saveBlockedReason}
        onOpenChange={handleEditorOpenChange}
        onSave={handleSave}
      />
      <ScheduledTaskRunHistoryDialog
        target={historyTarget}
        onOpenChange={(open) => {
          if (!open) setHistoryTarget(null)
        }}
      />
      {confirmDialog}
    </>
  )

  return { openNewTask, openEditTask, toggleEnabled, deleteTask, runNow, openRunHistory, busyKeys, dialogs }
}
