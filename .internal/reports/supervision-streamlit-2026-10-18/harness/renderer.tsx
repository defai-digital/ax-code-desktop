import React from "react"
import { createRoot } from "react-dom/client"
import { I18nProvider } from "@/lib/i18n"
import { useI18nStore } from "@/lib/i18n/store"
import { MissionControlHeader } from "@/components/supervision/missionControl/MissionControlHeader"
import { MissionControlRow } from "@/components/supervision/missionControl/MissionControlRow"
import { MissionControlPeek } from "@/components/supervision/missionControl/MissionControlPeek"
import { RequestActionCard } from "@/components/supervision/RequestActionCard"
import { WorkspaceNavigation } from "@/components/supervision/WorkspaceNavigation"
import { InspectorRail } from "@/components/layout/InspectorRail"
import { useSupervisionStore } from "@/stores/useSupervisionStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { useUIStore } from "@/stores/useUIStore"
import type { SupervisionRow } from "@/lib/supervision/rows"
import { CSSVariableGenerator } from "@/lib/theme/cssGenerator"
import { getDefaultTheme } from "@/lib/theme/themes"
import "@/index.css"
import "./fixture.css"

const themeStyle = document.createElement("style")
themeStyle.textContent = `:root { ${new CSSVariableGenerator().generate(getDefaultTheme(false))} }`
document.head.appendChild(themeStyle)
const noop = () => undefined
const rows: SupervisionRow[] = (["permission", "question", "error", "review", "running", "idle"] as const).map(
  (state, i) => ({
    sessionId: `fixture-${i}`,
    title: [
      "Review access to generated release artifacts",
      "Choose the database migration strategy",
      "Restore the interrupted integration check",
      "Review authentication changes before merging",
      "Implement the next project task",
      "Waiting for the next task",
    ][i],
    state,
    treeSessionIds: [`fixture-${i}`],
    projectId: `project-${i}`,
    projectLabel: `Project ${i + 1} / long-workspace-name`,
    directory: `/fixture/${i}`,
    updatedAt: Date.now() - i * 60000,
    evidence: { files: 3, additions: 120, deletions: 18 },
  }),
)
useSupervisionStore.setState({ rows, missionControlOpen: true, density: "comfortable", inspectorLabels: false })
useSessionUIStore.setState({ currentSessionId: rows[0].sessionId })
useUIStore.setState({ isMobile: false })
const entry = {
  kind: "permission" as const,
  sessionId: rows[0].sessionId,
  request: {
    id: "request-fixture",
    sessionID: rows[0].sessionId,
    permission: "bash",
    patterns: ["git status", "git diff --stat", `/workspace/${"long-artifact-directory/".repeat(12)}**`],
    always: [],
    metadata: {},
  },
}

function Fixture() {
  const density = useSupervisionStore((s) => s.density)
  const board = useSupervisionStore((s) => s.missionControlOpen)
  const [selected, setSelected] = React.useState(rows[0].sessionId)
  return (
    <I18nProvider>
      <div className="fixture-frame">
        <WorkspaceNavigation />
        <div className="workspace-body fixture-body">
          {board ? (
            <div className="mission-control-board fixture-board" data-density={density}>
              <MissionControlHeader
                density={density}
                onDensityChange={useSupervisionStore.getState().setDensity}
                wip={{ needsYou: 4, running: 1, overSoftLimit: false }}
                mode="live"
                workingSets={[]}
                activeWorkingSetId={null}
                activeSet={null}
                creating={false}
                newSetName=""
                renaming={false}
                renameValue=""
                shortcutHint="⌘⇧M"
                onSelectMode={noop}
                onSelectWorkingSet={noop}
                onStartCreate={noop}
                onNewSetNameChange={noop}
                onSubmitCreate={noop}
                onCancelCreate={noop}
                onStartRename={noop}
                onRenameValueChange={noop}
                onSubmitRename={noop}
                onCancelRename={noop}
                onDeleteWorkingSet={noop}
                onDispatch={noop}
                onClose={() => useSupervisionStore.setState({ missionControlOpen: false })}
              />
              <div className="fixture-rows" role="grid" tabIndex={0} aria-label="Fixture sessions">
                {rows.map((row) => (
                  <MissionControlRow
                    key={row.sessionId}
                    row={row}
                    selected={selected === row.sessionId}
                    expanded={row.state === "permission"}
                    activeWorkingSetId={null}
                    primaryLabel={row.state === "review" ? "Review changes" : "Open"}
                    onSelect={setSelected}
                    onOpen={noop}
                    onPrimary={noop}
                    onCompare={noop}
                    onRemoveFromSet={noop}
                  >
                    {row.state === "permission" ? (
                      <MissionControlPeek
                        row={row} requests={[entry]} workingSets={[]} isCreatingSetForRow={false}
                        newSetName="" onNewSetNameChange={noop} onOpen={noop} onReviewChanges={noop}
                        onAddToWorkingSet={noop} onStartCreateSet={noop} onSubmitCreateSet={noop} onCancelCreateSet={noop}
                      />
                    ) : null}
                  </MissionControlRow>
                ))}
              </div>
            </div>
          ) : (
            <div className="fixture-chat">
              <h1>Project workspace</h1>
              <p>The transcript stays mounted while tools open beside it.</p>
              <RequestActionCard entry={entry} />
            </div>
          )}
          <InspectorRail />
        </div>
      </div>
    </I18nProvider>
  )
}
createRoot(document.getElementById("root")!).render(<Fixture />)
Object.assign(window, {
  uiuxFixture: {
    density: (density: "comfortable" | "compact") => useSupervisionStore.getState().setDensity(density),
    labels: (inspectorLabels: boolean) => useSupervisionStore.setState({ inspectorLabels, missionControlOpen: false }),
    locale: (locale: "en" | "zh-TW" | "de") => useI18nStore.getState().setLocale(locale),
  },
})
