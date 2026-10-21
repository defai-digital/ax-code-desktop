import { useWebMcpBrowserStore, type WebMcpViewSnapshot } from "@/stores/useWebMcpBrowserStore"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useUIStore } from "@/stores/useUIStore"
import { openSupervisedSession } from "@/lib/supervision/openSession"
import { projectKeyFor, viewKeyFor } from "@/lib/webMcpViewKey"

export const pageAccess = (view: WebMcpViewSnapshot) =>
  view.interrupted ? "interrupted" : view.waiting ? "waiting" : view.paused ? "paused" : view.enabled ? "on" : "off"

export function useWebMcpPages() {
  const views = useWebMcpBrowserStore((state) => state.views)
  const rows = useSupervisionStore((state) => state.rows)
  const sessions = useGlobalSessionsStore((state) => state.activeSessions)
  const projects = useProjectsStore((state) => state.projects)
  return Object.entries(views)
    .filter(([, view]) => view.browserId && view.directory)
    .map(([key, view]) => {
      const project = projects.find((project) => projectKeyFor(project.path) === projectKeyFor(view.directory!))
      const row = rows.find((row) => row.directory && viewKeyFor(row.directory, row.sessionId) === key)
      const session = sessions.find((session) => viewKeyFor(session.directory, session.id) === key)
      return {
        ...view,
        key,
        projectId: project?.id,
        project: project?.label ? `${project.label} · ${view.directory}` : view.directory!,
        title: row?.title || session?.title || view.sessionID,
      }
    })
}

/** Showing is navigation only. It never requests enrollment, including after an unload. */
export function showWebMcpPage(view: Pick<WebMcpViewSnapshot, "directory" | "sessionID">) {
  if (!view.directory) return
  const project = useProjectsStore
    .getState()
    .projects.find((project) => projectKeyFor(project.path) === projectKeyFor(view.directory!))
  if (view.sessionID)
    openSupervisedSession({ sessionId: view.sessionID, directory: view.directory, projectId: project?.id })
  else {
    if (project) useProjectsStore.getState().setActiveProject(project.id)
    useSessionUIStore.getState().setCurrentSession(null, view.directory)
    // Draft pages are selected without inheriting any session's access.
    useUIStore.getState().setActiveMainTab("chat")
  }
  const store = useWebMcpBrowserStore.getState()
  store.selectView(view.directory, view.sessionID)
  store.requestAgentMode(undefined, viewKeyFor(view.directory, view.sessionID))
  useUIStore.getState().focusContextBrowser()
}
