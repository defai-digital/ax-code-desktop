/**
 * Group identity for a multi-run compare view. A run group (`g2`) keeps its own
 * lanes so two batches that share a slug are not mixed. Fusion sessions are not lanes.
 */
export type MultiRunTitleIdentity = {
  groupSlug: string
  runGroup?: string
  providerID: string
  modelID: string
  index?: number
  fusion: boolean
}

export type MultiRunLane<T> = T & {
  laneLabel: string
}

export type MultiRunGroup<T> = {
  label: string
  lanes: MultiRunLane<T>[]
}

export type MultiRunTitleParser = (title?: string | null) => MultiRunTitleIdentity | null

/** Compare-view key for one parsed lane. Null for fusion sessions and titles that are not multi-run. */
export function multiRunGroupKeyFromParsed(parsed: MultiRunTitleIdentity | null): string | null {
  if (!parsed || parsed.fusion) return null
  return parsed.runGroup ? `${parsed.groupSlug}/${parsed.runGroup}` : parsed.groupSlug
}

export function multiRunLaneLabel(parsed: Pick<MultiRunTitleIdentity, "providerID" | "modelID" | "index">): string {
  const base = `${parsed.providerID}/${parsed.modelID}`
  return parsed.index ? `${base} #${parsed.index}` : base
}

const groupLabel = (parsed: MultiRunTitleIdentity): string =>
  parsed.runGroup ? `${parsed.groupSlug} · ${parsed.runGroup}` : parsed.groupSlug

/**
 * Group supervision rows that belong to a multi-run batch. The map key is the group slug, or
 * `slug/runGroup` when the title carries a run group. Fusion sessions are left out.
 */
export function groupMultiRunRows<T extends { title?: string | null }>(
  rows: readonly T[],
  parse: MultiRunTitleParser,
): Map<string, MultiRunGroup<T>> {
  const groups = new Map<string, MultiRunGroup<T>>()
  for (const row of rows) {
    const parsed = parse(row.title)
    const key = multiRunGroupKeyFromParsed(parsed)
    if (!parsed || !key) continue
    const lane: MultiRunLane<T> = { ...row, laneLabel: multiRunLaneLabel(parsed) }
    const existing = groups.get(key)
    if (existing) {
      existing.lanes.push(lane)
    } else {
      groups.set(key, { label: groupLabel(parsed), lanes: [lane] })
    }
  }
  for (const group of groups.values()) {
    group.lanes.sort((left, right) => left.laneLabel.localeCompare(right.laneLabel))
  }
  return groups
}
