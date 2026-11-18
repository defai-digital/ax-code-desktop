import { normalizeProjectPath } from "./projectResolution"
import { normalizePathSeparators } from "@/lib/pathValues"
import { isPlainRecord } from "./record"

export type ContextPanelMode = "diff" | "file" | "context" | "plan" | "chat" | "preview" | "browser" | "dashboard"

const CONTEXT_PANEL_MODES = new Set<ContextPanelMode>([
  "diff",
  "file",
  "context",
  "plan",
  "chat",
  "preview",
  "browser",
  "dashboard",
])

export const isContextPanelMode = (mode: unknown): mode is ContextPanelMode => {
  return typeof mode === "string" && CONTEXT_PANEL_MODES.has(mode as ContextPanelMode)
}

export type ContextPanelTab = {
  id: string
  mode: ContextPanelMode
  targetPath: string | null
  dedupeKey: string
  label: string | null
  readOnly: boolean
  stagedDiff: boolean
  touchedAt: number
}

export type ContextPanelTabDescriptor = {
  mode: ContextPanelMode
  targetPath?: string | null
  dedupeKey?: string | null
  label?: string | null
  readOnly?: boolean
  stagedDiff?: boolean
}

export type ContextPanelDirectoryState = {
  isOpen: boolean
  expanded: boolean
  tabs: ContextPanelTab[]
  activeTabId: string | null
  width: number
  touchedAt: number
}

const CONTEXT_PANEL_DEFAULT_WIDTH = 380
const CONTEXT_PANEL_MIN_WIDTH = 380
const CONTEXT_PANEL_MAX_WIDTH = 1400
const CONTEXT_PANEL_MAX_TABS = 12
const CONTEXT_PANEL_MAX_LABEL_LENGTH = 120
const CONTEXT_PANEL_MAX_ROOTS = 20

export const normalizeContextPanelDirectoryKey = (value: string): string => {
  return normalizeProjectPath(value) ?? ""
}

export const clampContextPanelWidth = (width: number): number => {
  if (!Number.isFinite(width)) {
    return CONTEXT_PANEL_DEFAULT_WIDTH
  }

  return Math.min(CONTEXT_PANEL_MAX_WIDTH, Math.max(CONTEXT_PANEL_MIN_WIDTH, Math.round(width)))
}

export const normalizeContextTargetPath = (
  value: string | null | undefined,
  mode: ContextPanelMode = "file",
): string | null => {
  if (typeof value !== "string") {
    return null
  }

  const target = mode === "file" || mode === "diff" ? value : value.trim()
  return target.length > 0 ? normalizePathSeparators(target) : null
}

const normalizeContextTabLabel = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return trimmed.length > CONTEXT_PANEL_MAX_LABEL_LENGTH ? trimmed.slice(0, CONTEXT_PANEL_MAX_LABEL_LENGTH) : trimmed
}

const buildDefaultContextPanelTabDedupeKey = (mode: ContextPanelMode, targetPath: string | null): string => {
  return mode === "file" || mode === "preview" ? targetPath || mode : mode
}

const normalizeContextPanelTabDedupeKey = (
  mode: ContextPanelMode,
  targetPath: string | null,
  dedupeKey: string | null | undefined,
): string => {
  if (typeof dedupeKey === "string") {
    const trimmed = mode === "file" || mode === "diff" ? dedupeKey : dedupeKey.trim()
    if (trimmed) {
      return trimmed
    }
  }

  return buildDefaultContextPanelTabDedupeKey(mode, targetPath)
}

const buildContextPanelTabID = (mode: ContextPanelMode, dedupeKey: string): string => {
  return dedupeKey === mode ? mode : `${mode}:${dedupeKey}`
}

const createContextPanelTab = (descriptor: ContextPanelTabDescriptor): ContextPanelTab => {
  const normalizedTargetPath = normalizeContextTargetPath(descriptor.targetPath, descriptor.mode)
  const dedupeKey = normalizeContextPanelTabDedupeKey(descriptor.mode, normalizedTargetPath, descriptor.dedupeKey)
  return {
    id: buildContextPanelTabID(descriptor.mode, dedupeKey),
    mode: descriptor.mode,
    targetPath: normalizedTargetPath,
    dedupeKey,
    label: normalizeContextTabLabel(descriptor.label),
    readOnly: descriptor.readOnly === true,
    stagedDiff: descriptor.stagedDiff === true,
    touchedAt: Date.now(),
  }
}

const clampContextPanelTabs = (
  tabs: ContextPanelTab[],
  maxTabs: number,
  activeTabId: string | null,
): ContextPanelTab[] => {
  if (tabs.length <= maxTabs) {
    return tabs
  }

  const tabsByTouch = [...tabs].sort((a, b) => a.touchedAt - b.touchedAt)
  const removable = tabsByTouch.filter((tab) => tab.id !== activeTabId)
  const removeCount = tabs.length - maxTabs
  if (removeCount <= 0 || removable.length === 0) {
    return tabs.slice(-maxTabs)
  }

  const removeSet = new Set(removable.slice(0, removeCount).map((tab) => tab.id))
  return tabs.filter((tab) => !removeSet.has(tab.id))
}

const sanitizeContextPanelTabs = (tabs: unknown): ContextPanelTab[] => {
  if (!Array.isArray(tabs)) {
    return []
  }

  const result: ContextPanelTab[] = []
  const seen = new Set<string>()

  for (const entry of tabs) {
    if (!entry || typeof entry !== "object") {
      continue
    }

    const candidate = entry as {
      mode?: unknown
      targetPath?: unknown
      dedupeKey?: unknown
      label?: unknown
      readOnly?: unknown
      stagedDiff?: unknown
      touchedAt?: unknown
    }

    if (!isContextPanelMode(candidate.mode)) {
      continue
    }

    const targetPath = normalizeContextTargetPath(
      typeof candidate.targetPath === "string" ? candidate.targetPath : null,
      candidate.mode,
    )
    const dedupeKey = normalizeContextPanelTabDedupeKey(
      candidate.mode,
      targetPath,
      typeof candidate.dedupeKey === "string" ? candidate.dedupeKey : null,
    )
    const id = buildContextPanelTabID(candidate.mode, dedupeKey)
    if (!id || seen.has(id)) {
      continue
    }

    seen.add(id)
    result.push({
      id,
      mode: candidate.mode,
      targetPath,
      dedupeKey,
      label: normalizeContextTabLabel(typeof candidate.label === "string" ? candidate.label : null),
      readOnly: candidate.readOnly === true,
      stagedDiff: candidate.stagedDiff === true,
      touchedAt:
        typeof candidate.touchedAt === "number" && Number.isFinite(candidate.touchedAt)
          ? candidate.touchedAt
          : Date.now(),
    })
  }

  return result
}

const resolveActiveContextPanelTabID = (tabs: ContextPanelTab[], activeTabId: string | null): string | null => {
  if (activeTabId && tabs.some((tab) => tab.id === activeTabId)) {
    return activeTabId
  }

  if (tabs.length === 0) {
    return null
  }

  return tabs[tabs.length - 1].id
}

export const touchContextPanelState = (prev?: ContextPanelDirectoryState): ContextPanelDirectoryState => {
  if (prev) {
    const tabs = sanitizeContextPanelTabs(prev.tabs)
    const activeTabId = resolveActiveContextPanelTabID(tabs, prev.activeTabId)
    return {
      ...prev,
      isOpen: tabs.length > 0 ? prev.isOpen : false,
      tabs,
      activeTabId,
      touchedAt: Date.now(),
    }
  }

  return {
    isOpen: false,
    expanded: false,
    tabs: [],
    activeTabId: null,
    width: CONTEXT_PANEL_DEFAULT_WIDTH,
    touchedAt: Date.now(),
  }
}

export const upsertContextPanelTab = (
  current: ContextPanelDirectoryState,
  descriptor: ContextPanelTabDescriptor,
): ContextPanelDirectoryState => {
  const nextTab = createContextPanelTab(descriptor)
  const existingIndex = current.tabs.findIndex((tab) => tab.id === nextTab.id)
  // New context-panel tabs open leftmost on the strip (active immediately).
  const tabs =
    existingIndex === -1
      ? [nextTab, ...current.tabs]
      : current.tabs.map((tab, index) =>
          index === existingIndex
            ? {
                ...tab,
                mode: nextTab.mode,
                targetPath: nextTab.targetPath || tab.targetPath,
                dedupeKey: nextTab.dedupeKey,
                label: nextTab.label,
                stagedDiff: nextTab.stagedDiff,
                readOnly: nextTab.readOnly,
                touchedAt: Date.now(),
              }
            : tab,
        )

  const activeTabId = nextTab.id
  const clampedTabs = clampContextPanelTabs(tabs, CONTEXT_PANEL_MAX_TABS, activeTabId)

  return {
    ...current,
    isOpen: true,
    tabs: clampedTabs,
    activeTabId: resolveActiveContextPanelTabID(clampedTabs, activeTabId),
    touchedAt: Date.now(),
  }
}

export const closeContextPanelTab = (
  current: ContextPanelDirectoryState,
  tabID: string,
): ContextPanelDirectoryState => {
  const nextTabs = current.tabs.filter((tab) => tab.id !== tabID)
  const nextActiveTabId =
    current.activeTabId === tabID
      ? (nextTabs[nextTabs.length - 1]?.id ?? null)
      : resolveActiveContextPanelTabID(nextTabs, current.activeTabId)

  return {
    ...current,
    tabs: nextTabs,
    activeTabId: nextActiveTabId,
    isOpen: nextTabs.length > 0 ? current.isOpen : false,
    touchedAt: Date.now(),
  }
}

export const reorderContextPanelTabs = (
  current: ContextPanelDirectoryState,
  activeTabID: string,
  overTabID: string,
): ContextPanelDirectoryState => {
  if (activeTabID === overTabID) {
    return current
  }

  const fromIndex = current.tabs.findIndex((tab) => tab.id === activeTabID)
  const toIndex = current.tabs.findIndex((tab) => tab.id === overTabID)
  if (fromIndex === -1 || toIndex === -1) {
    return current
  }

  const tabs = [...current.tabs]
  const [moved] = tabs.splice(fromIndex, 1)
  if (!moved) {
    return current
  }

  tabs.splice(toIndex, 0, moved)

  return {
    ...current,
    tabs,
    touchedAt: Date.now(),
  }
}

export const sanitizeContextPanelByDirectory = (value: unknown): Record<string, ContextPanelDirectoryState> => {
  if (!isPlainRecord(value)) {
    return {}
  }

  const source = value as Record<string, unknown>
  const next = new Map<string, ContextPanelDirectoryState>()

  for (const [rawDirectory, rawState] of Object.entries(source)) {
    const directory = normalizeContextPanelDirectoryKey(rawDirectory)
    if (!directory || !isPlainRecord(rawState)) {
      continue
    }

    const candidate = rawState as {
      isOpen?: unknown
      expanded?: unknown
      tabs?: unknown
      activeTabId?: unknown
      width?: unknown
      touchedAt?: unknown
      mode?: unknown
      targetPath?: unknown
      dedupeKey?: unknown
      label?: unknown
    }

    let tabs = sanitizeContextPanelTabs(candidate.tabs)
    let activeTabId = typeof candidate.activeTabId === "string" ? candidate.activeTabId : null

    if (tabs.length === 0 && isContextPanelMode(candidate.mode)) {
      tabs = [
        createContextPanelTab({
          mode: candidate.mode,
          targetPath: typeof candidate.targetPath === "string" ? candidate.targetPath : null,
          dedupeKey: typeof candidate.dedupeKey === "string" ? candidate.dedupeKey : null,
          label: typeof candidate.label === "string" ? candidate.label : null,
        }),
      ]
      activeTabId = tabs[0]?.id ?? null
    }

    // Browser navigation belongs to the global, session-only browser, never restored directory tabs.
    tabs = tabs.filter((tab) => tab.mode !== "browser")
    const resolvedActiveTabId = resolveActiveContextPanelTabID(tabs, activeTabId)
    const clampedTabs = clampContextPanelTabs(tabs, CONTEXT_PANEL_MAX_TABS, resolvedActiveTabId)
    if (clampedTabs.length === 0 && !(Array.isArray(candidate.tabs) && candidate.tabs.length === 0)) {
      continue
    }

    next.set(directory, {
      isOpen: candidate.isOpen === true && clampedTabs.length > 0,
      expanded: candidate.expanded === true,
      tabs: clampedTabs,
      activeTabId: resolveActiveContextPanelTabID(clampedTabs, resolvedActiveTabId),
      width: clampContextPanelWidth(
        typeof candidate.width === "number" ? candidate.width : CONTEXT_PANEL_DEFAULT_WIDTH,
      ),
      touchedAt:
        typeof candidate.touchedAt === "number" && Number.isFinite(candidate.touchedAt)
          ? candidate.touchedAt
          : Date.now(),
    })
  }

  return clampContextPanelRoots(Object.fromEntries(next))
}

export const clampContextPanelRoots = (
  byDirectory: Record<string, ContextPanelDirectoryState>,
  activeDirectory?: string,
): Record<string, ContextPanelDirectoryState> => {
  const entries = Object.entries(byDirectory)
  if (entries.length <= CONTEXT_PANEL_MAX_ROOTS) {
    return byDirectory
  }

  entries.sort((a, b) => {
    if (a[0] === activeDirectory) return -1
    if (b[0] === activeDirectory) return 1
    return b[1].touchedAt - a[1].touchedAt
  })
  return Object.fromEntries(entries.slice(0, CONTEXT_PANEL_MAX_ROOTS))
}
