import React from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ProjectsHome } from "@/components/projects/ProjectsHome"
import { useI18n } from "@/lib/i18n"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useUIStore } from "@/stores/useUIStore"
import { useSessionUIStore } from "@/sync/session-ui-store"

/**
 * Every registered project, reachable from any session (C UX-09). Before, the full list lived only on the empty chat
 * and the new-session draft, so browsing projects meant starting a task. The dialog sits over the current view, which
 * stays where it was when the dialog closes; picking a session or starting one in a project closes it.
 */
export function AllProjectsDialog(): React.ReactNode {
  const { t } = useI18n()
  const open = useUIStore((state) => state.isAllProjectsOpen)
  const setOpen = useUIStore((state) => state.setAllProjectsOpen)
  const setActiveMainTab = useUIStore((state) => state.setActiveMainTab)
  const openNewSessionDraft = useSessionUIStore((state) => state.openNewSessionDraft)
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId)
  const draftOpen = useSessionUIStore((state) => Boolean(state.newSessionDraft?.open))

  // A row in Needs you or Follow up opens its session from inside the list; once the view moved, the dialog is done.
  // The view is recorded while the dialog is closed, so it is the view the dialog opened over.
  const openedOver = React.useRef({ currentSessionId, draftOpen })
  React.useEffect(() => {
    if (!open) {
      openedOver.current = { currentSessionId, draftOpen }
      return
    }
    if (openedOver.current.currentSessionId !== currentSessionId || openedOver.current.draftOpen !== draftOpen) {
      setOpen(false)
    }
  }, [currentSessionId, draftOpen, open, setOpen])

  const handleOpenProject = React.useCallback(() => {
    setOpen(false)
    setActiveMainTab("chat")
    openNewSessionDraft()
  }, [openNewSessionDraft, setActiveMainTab, setOpen])

  const handleNewSession = React.useCallback(
    (projectId: string) => {
      setOpen(false)
      setActiveMainTab("chat")
      const project = useProjectsStore.getState().projects.find((entry) => entry.id === projectId)
      openNewSessionDraft({ directoryOverride: project?.path ?? null })
    },
    [openNewSessionDraft, setActiveMainTab, setOpen],
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("projects.all.title")}</DialogTitle>
          <DialogDescription>{t("projects.all.description")}</DialogDescription>
        </DialogHeader>
        {open ? <ProjectsHome onOpenProject={handleOpenProject} onNewSession={handleNewSession} /> : null}
      </DialogContent>
    </Dialog>
  )
}
