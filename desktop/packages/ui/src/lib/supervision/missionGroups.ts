import { formatPathForDisplay } from "@/lib/utils"
import type { SupervisionRow } from "./rows"
import { needsHuman, type SupervisionEvidence } from "./sessionState"

type GroupableRow = Pick<SupervisionRow, "projectId" | "projectLabel" | "directory" | "state" | "evidence">

export interface MissionGroup<T extends GroupableRow = SupervisionRow> {
  key: string
  label: string | null
  directory: string | null
  rows: T[]
  needsYou: number
  running: number
  evidence: SupervisionEvidence | null
}

/** Preserve first occurrence order from the urgency-ranked input, including order within each project. */
export function groupMissionRows<T extends GroupableRow>(
  rows: readonly T[],
  homeDirectory: string | null | undefined,
): MissionGroup<T>[] {
  const groups = new Map<string, MissionGroup<T>>()
  for (const row of rows) {
    const key = row.projectId ?? row.directory ?? "__none__"
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        label: row.projectLabel ?? (formatPathForDisplay(row.directory, homeDirectory) || null),
        directory: row.directory,
        rows: [],
        needsYou: 0,
        running: 0,
        evidence: null,
      }
      groups.set(key, group)
    }
    group.rows.push(row)
    if (needsHuman(row.state)) group.needsYou += 1
    if (row.state === "running") group.running += 1
    if (row.evidence) {
      group.evidence ??= { additions: 0, deletions: 0, files: 0 }
      group.evidence.additions += row.evidence.additions
      group.evidence.deletions += row.evidence.deletions
      group.evidence.files += row.evidence.files
    }
  }
  return [...groups.values()]
}
