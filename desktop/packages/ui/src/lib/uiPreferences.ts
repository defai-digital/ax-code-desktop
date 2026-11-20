import { resolveSettingsSlug } from "./settings/metadata"
import type { ContextPanelDirectoryState } from "./contextPanelState"
import { sanitizeContextPanelByDirectory } from "./contextPanelState"
import { sanitizeStarterRefs, type DraftStarterRef } from "./draftStarters"
import { UI_FONT_OPTIONS, CODE_FONT_OPTIONS, type UiFontOption, type MonoFontOption } from "./fontOptions"
import type { MainTab } from "./mainTabs"
import type { ShortcutCombo } from "./shortcuts"
import type { TimeFormatPreference } from "./timeFormat"
import { isPlainRecord } from "./record"
import { isPersistedSplitPaneRightTab } from "./wiki/splitTab"
import {
  createPersistedFields,
  persistedBoolean,
  persistedNumber,
  persistedNullableNumber,
  persistedNullableString,
  persistedStringList,
  persistedStringRecord,
  persistedRecord,
  persistedEnum,
} from "./persistedFields"

export const MAX_DIFF_FILE_LAYOUTS = 500
export type MermaidRenderingMode = "svg" | "ascii"
export type UserMessageRenderingMode = "markdown" | "plain"
export type ActivityRenderMode = "collapsed" | "summary"
export type SessionRetentionAction = "archive" | "delete"
export type WeekStartPreference = "auto" | "sunday" | "monday"

export interface PreferenceModelRef {
  providerID: string
  modelID: string
}
export interface UIPreferences {
  theme: "light" | "dark" | "system"
  isSidebarOpen: boolean
  sidebarWidth: number
  hasManuallyResizedLeftSidebar: boolean
  contextPanelByDirectory: Record<string, ContextPanelDirectoryState>
  isBottomTerminalOpen: boolean
  isBottomTerminalExpanded: boolean
  bottomTerminalHeight: number
  hasManuallyResizedBottomTerminal: boolean
  notesPanelHeight: number
  todoPanelHeight: number
  splitPaneEnabled: boolean
  splitPaneRatio: number
  splitPaneRightTab: Exclude<MainTab, "chat">
  settingsPage: string
  settingsHasOpenedOnce: boolean
  settingsProjectsSelectedId: string | null
  showReasoningTraces: boolean
  collapsibleThinkingBlocks: boolean
  activityRenderMode: ActivityRenderMode
  showDeletionDialog: boolean
  autoDeleteEnabled: boolean
  autoDeleteAfterDays: number
  sessionRetentionAction: SessionRetentionAction
  autoDeleteLastRunAt: number | null
  messageLimit: number
  fontSize: number
  /** null uses the default built-in welcome starters. */
  globalDraftStarters: DraftStarterRef[] | null
  terminalFontSize: number
  uiFont: UiFontOption
  monoFont: MonoFontOption
  padding: number
  cornerRadius: number
  favoriteModels: PreferenceModelRef[]
  hiddenModels: PreferenceModelRef[]
  collapsedModelProviders: string[]
  recentModels: PreferenceModelRef[]
  recentAgents: string[]
  recentEfforts: Record<string, string[]>
  diffLayoutPreference: "dynamic" | "inline" | "side-by-side"
  diffFileLayout: Record<string, "inline" | "side-by-side">
  diffWrapLines: boolean
  diffViewMode: "single" | "stacked"
  gitChangesViewMode: "flat" | "tree"
  nativeNotificationsEnabled: boolean
  notificationMode: "always" | "hidden-only"
  notifyOnSubtasks: boolean
  notifyOnCompletion: boolean
  notifyOnError: boolean
  notifyOnQuestion: boolean
  notifyOnPermission: boolean
  /** Opt-in Alt+Space quick dispatch shortcut; off until explicitly enabled. */
  quickDispatchGlobalShortcut: boolean
  notificationTemplates: {
    completion: { title: string; message: string }
    error: { title: string; message: string }
    question: { title: string; message: string }
    subtask: { title: string; message: string }
  }
  summarizeLastMessage: boolean
  summaryThreshold: number // Character threshold before summarizing.
  summaryLength: number // Target summary length in characters.
  maxLastMessageLength: number // Character limit when summarization is off.
  showTerminalQuickKeysOnDesktop: boolean
  persistChatDraft: boolean
  showAxCodeUpdateNotifications: boolean
  inputSpellcheckEnabled: boolean
  wideChatLayoutEnabled: boolean
  showToolFileIcons: boolean
  showExpandedBashTools: boolean
  showExpandedEditTools: boolean
  showTurnChangedFiles: boolean
  timeFormatPreference: TimeFormatPreference
  weekStartPreference: WeekStartPreference
  mermaidRenderingMode: MermaidRenderingMode
  userMessageRenderingMode: UserMessageRenderingMode
  stickyUserHeader: boolean
  showSplitAssistantMessageActions: boolean
  shortcutOverrides: Record<string, ShortcutCombo>
}

const readModelRefs = (value: unknown, current: PreferenceModelRef[]): PreferenceModelRef[] => {
  if (!Array.isArray(value)) return current
  const result: PreferenceModelRef[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    if (!isPlainRecord(entry) || typeof entry.providerID !== "string" || typeof entry.modelID !== "string") continue
    const key = JSON.stringify([entry.providerID, entry.modelID])
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ providerID: entry.providerID, modelID: entry.modelID })
  }
  return result
}

const readTemplates = (
  value: unknown,
  current: UIPreferences["notificationTemplates"],
): UIPreferences["notificationTemplates"] => {
  if (!isPlainRecord(value)) return current
  const read = (entry: unknown, fallback: { title: string; message: string }) => {
    if (!isPlainRecord(entry)) return fallback
    return {
      title: typeof entry.title === "string" ? entry.title : fallback.title,
      message: typeof entry.message === "string" ? entry.message : fallback.message,
    }
  }
  return {
    completion: read(value.completion, current.completion),
    error: read(value.error, current.error),
    question: read(value.question, current.question),
    subtask: read(value.subtask, current.subtask),
  }
}

// Startup navigation/dialog state is intentionally absent from this persisted preference contract.
export const uiPreferencePersistence = createPersistedFields<UIPreferences>({
  theme: persistedEnum(["light", "dark", "system"]),
  isSidebarOpen: persistedBoolean,
  sidebarWidth: persistedNumber,
  hasManuallyResizedLeftSidebar: persistedBoolean,
  contextPanelByDirectory: (value, current) =>
    isPlainRecord(value) ? sanitizeContextPanelByDirectory(value) : current,
  isBottomTerminalOpen: persistedBoolean,
  isBottomTerminalExpanded: persistedBoolean,
  bottomTerminalHeight: persistedNumber,
  hasManuallyResizedBottomTerminal: persistedBoolean,
  notesPanelHeight: persistedNumber,
  todoPanelHeight: persistedNumber,
  splitPaneEnabled: persistedBoolean,
  splitPaneRatio: persistedNumber,
  splitPaneRightTab: (value, current) => (isPersistedSplitPaneRightTab(value) ? value : current),
  settingsPage: (value, current) => (typeof value === "string" ? resolveSettingsSlug(value) : current),
  settingsHasOpenedOnce: persistedBoolean,
  settingsProjectsSelectedId: persistedNullableString,
  showReasoningTraces: persistedBoolean,
  collapsibleThinkingBlocks: persistedBoolean,
  activityRenderMode: persistedEnum(["collapsed", "summary"]),
  showDeletionDialog: persistedBoolean,
  autoDeleteEnabled: persistedBoolean,
  autoDeleteAfterDays: persistedNumber,
  sessionRetentionAction: persistedEnum(["archive", "delete"]),
  autoDeleteLastRunAt: persistedNullableNumber,
  messageLimit: persistedNumber,
  fontSize: persistedNumber,
  globalDraftStarters: (value, current) =>
    value === null ? null : Array.isArray(value) ? sanitizeStarterRefs(value) : current,
  terminalFontSize: persistedNumber,
  uiFont: persistedEnum(UI_FONT_OPTIONS.map((option) => option.id)),
  monoFont: persistedEnum(CODE_FONT_OPTIONS.map((option) => option.id)),
  padding: persistedNumber,
  cornerRadius: persistedNumber,
  favoriteModels: readModelRefs,
  hiddenModels: readModelRefs,
  collapsedModelProviders: persistedStringList,
  recentModels: readModelRefs,
  recentAgents: persistedStringList,
  recentEfforts: persistedRecord((value) =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : undefined,
  ),
  diffLayoutPreference: persistedEnum(["dynamic", "inline", "side-by-side"]),
  diffFileLayout: persistedRecord(
    (value) => (value === "inline" || value === "side-by-side" ? value : undefined),
    MAX_DIFF_FILE_LAYOUTS,
  ),
  diffWrapLines: persistedBoolean,
  diffViewMode: persistedEnum(["single", "stacked"]),
  gitChangesViewMode: persistedEnum(["flat", "tree"]),
  nativeNotificationsEnabled: persistedBoolean,
  notificationMode: persistedEnum(["always", "hidden-only"]),
  notifyOnSubtasks: persistedBoolean,
  notifyOnCompletion: persistedBoolean,
  notifyOnError: persistedBoolean,
  notifyOnQuestion: persistedBoolean,
  notifyOnPermission: persistedBoolean,
  quickDispatchGlobalShortcut: persistedBoolean,
  notificationTemplates: readTemplates,
  summarizeLastMessage: persistedBoolean,
  summaryThreshold: persistedNumber,
  summaryLength: persistedNumber,
  maxLastMessageLength: persistedNumber,
  showTerminalQuickKeysOnDesktop: persistedBoolean,
  persistChatDraft: persistedBoolean,
  showAxCodeUpdateNotifications: persistedBoolean,
  inputSpellcheckEnabled: persistedBoolean,
  wideChatLayoutEnabled: persistedBoolean,
  showToolFileIcons: persistedBoolean,
  showExpandedBashTools: persistedBoolean,
  showExpandedEditTools: persistedBoolean,
  showTurnChangedFiles: persistedBoolean,
  timeFormatPreference: persistedEnum(["auto", "12h", "24h"]),
  weekStartPreference: persistedEnum(["auto", "sunday", "monday"]),
  mermaidRenderingMode: persistedEnum(["svg", "ascii"]),
  userMessageRenderingMode: persistedEnum(["markdown", "plain"]),
  stickyUserHeader: persistedBoolean,
  showSplitAssistantMessageActions: persistedBoolean,
  shortcutOverrides: persistedStringRecord,
})
