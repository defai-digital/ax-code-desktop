import React from "react"
import { cn } from "@/lib/utils"
import type { TurnActivityRecord as TurnActivityPart } from "../../lib/turns/types"
import type { ToolPart as ToolPartType } from "@defai-digital/ax-code-sdk/v2"
import { MinDurationShineText } from "./MinDurationShineText"
import { FileTypeIcon } from "@/components/icons/FileTypeIcon"
import { Text } from "@/components/ui/text"
import { getToolIcon } from "./toolPresentation"
import { getToolMetadata } from "@/lib/toolHelpers"
import { RuntimeAPIContext } from "@/contexts/runtimeAPIContext"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useUIStore } from "@/stores/useUIStore"
import { useSkillsStore } from "@/stores/useSkillsStore"
import { getExternalFaviconUrl, openExternalUrl } from "@/lib/url"
import { getSafeToolFetchHref } from "./toolFetchLinks"
import { areRenderRelevantPartsEqual } from "../renderCompare"
import { getToolRelativePath, normalizeToolDisplayPath } from "./toolPathDisplay"

const TOOL_ROW_TEXT_CLASS = "!text-[length:var(--text-meta)] !leading-4 sm:!leading-6 tracking-normal"
const TOOL_ROW_TITLE_CLASS = cn("typography-meta font-medium", TOOL_ROW_TEXT_CLASS)
const TOOL_ROW_DESCRIPTION_CLASS = cn("typography-meta", TOOL_ROW_TEXT_CLASS)

const ExternalLinkFavicon: React.FC<{ href: string }> = ({ href }) => {
  const [failed, setFailed] = React.useState(false)
  const faviconUrl = React.useMemo(() => getExternalFaviconUrl(href), [href])

  if (!faviconUrl || failed) {
    return null
  }

  return (
    <span className="inline-flex size-[18px] flex-shrink-0 items-center justify-center rounded border border-[var(--border)] bg-[var(--interactive-hover)]">
      <img
        src={faviconUrl}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="size-3.5 rounded-sm"
        onError={() => setFailed(true)}
      />
    </span>
  )
}

const isActivityRunning = (activity: TurnActivityPart): boolean => {
  if (activity.kind !== "tool") return false
  const part = activity.part as ToolPartType
  const status = (part.state?.status as string) || undefined
  const isFinalized =
    status === "completed" ||
    status === "error" ||
    status === "aborted" ||
    status === "failed" ||
    status === "timeout" ||
    status === "cancelled"
  if (isFinalized) {
    return false
  }
  if (status === "running" || status === "pending" || status === "started") {
    return true
  }
  return typeof activity.endedAt !== "number"
}

/**
 * Extract a short filename from a tool part's input (for aggregation display).
 */
const getToolFileName = (activity: TurnActivityPart): string | null => {
  const part = activity.part as ToolPartType
  const state = part.state as { input?: Record<string, unknown>; metadata?: Record<string, unknown> } | undefined
  const input = state?.input
  const metadata = state?.metadata

  const filePath =
    (input?.filePath as string) ||
    (input?.file_path as string) ||
    (input?.path as string) ||
    (metadata?.filePath as string) ||
    (metadata?.file_path as string) ||
    (metadata?.path as string)

  if (typeof filePath === "string" && filePath.trim().length > 0) {
    const lastSlash = filePath.lastIndexOf("/")
    return lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath
  }

  return null
}

const getToolFilePath = (activity: TurnActivityPart): string | null => {
  const part = activity.part as ToolPartType
  const state = part.state as { input?: Record<string, unknown>; metadata?: Record<string, unknown> } | undefined
  const input = state?.input
  const metadata = state?.metadata

  const filePath =
    (input?.filePath as string) ||
    (input?.file_path as string) ||
    (input?.path as string) ||
    (metadata?.filePath as string) ||
    (metadata?.file_path as string) ||
    (metadata?.path as string)

  return typeof filePath === "string" && filePath.trim().length > 0 ? filePath : null
}

const getToolSkillDirectory = (activity: TurnActivityPart): string | null => {
  const part = activity.part as ToolPartType
  const state = part.state as { metadata?: Record<string, unknown> } | undefined
  const dir = state?.metadata?.dir

  return typeof dir === "string" && dir.trim().length > 0 ? dir : null
}

const toTodoStatusKey = (value: unknown): "pending" | "in_progress" | "completed" | "cancelled" | null => {
  if (typeof value !== "string") {
    return null
  }
  const normalized = value.trim().toLowerCase()
  if (normalized === "pending") return "pending"
  if (normalized === "in_progress" || normalized === "in progress" || normalized === "inprogress") return "in_progress"
  if (normalized === "completed" || normalized === "done") return "completed"
  if (normalized === "cancelled" || normalized === "canceled") return "cancelled"
  return null
}

const formatTodoSummary = (todos: unknown[]): string | null => {
  if (todos.length === 0) {
    return "0 tasks"
  }

  let pending = 0
  let inProgress = 0
  for (const todo of todos) {
    if (!todo || typeof todo !== "object") {
      continue
    }
    const status = toTodoStatusKey((todo as { status?: unknown }).status)
    if (!status) {
      continue
    }
    if (status === "pending") pending += 1
    if (status === "in_progress") inProgress += 1
  }

  const activeCount = pending + inProgress
  if (activeCount === 0) {
    return "0 tasks"
  }

  return `${activeCount} ${activeCount === 1 ? "task" : "tasks"}`
}

const getTodoSummaryFromActivity = (activity: TurnActivityPart): string | null => {
  const part = activity.part as ToolPartType
  const state = part.state as { input?: Record<string, unknown>; output?: unknown } | undefined
  const input = state?.input
  const output = state?.output

  if (Array.isArray(input?.todos)) {
    const summary = formatTodoSummary(input.todos)
    if (summary) return summary
  }

  if (Array.isArray(output)) {
    const summary = formatTodoSummary(output)
    if (summary) return summary
  }

  if (output && typeof output === "object" && Array.isArray((output as { todos?: unknown }).todos)) {
    const summary = formatTodoSummary((output as { todos: unknown[] }).todos)
    if (summary) return summary
  }

  if (typeof output === "string" && output.trim().length > 0) {
    try {
      const parsed = JSON.parse(output) as unknown
      if (Array.isArray(parsed)) {
        const summary = formatTodoSummary(parsed)
        if (summary) return summary
      }
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as { todos?: unknown }).todos)) {
        const summary = formatTodoSummary((parsed as { todos: unknown[] }).todos)
        if (summary) return summary
      }
    } catch {
      // Ignore non-JSON output.
    }
  }

  return null
}

const getToolReadOffset = (activity: TurnActivityPart): number | undefined => {
  const part = activity.part as ToolPartType
  const state = part.state as { input?: Record<string, unknown>; metadata?: Record<string, unknown> } | undefined
  const input = state?.input
  const metadata = state?.metadata

  const rawOffset =
    (typeof input?.offset === "number" && Number.isFinite(input.offset) ? input.offset : undefined) ??
    (typeof input?.line === "number" && Number.isFinite(input.line) ? input.line : undefined) ??
    (typeof metadata?.offset === "number" && Number.isFinite(metadata.offset) ? metadata.offset : undefined) ??
    (typeof metadata?.line === "number" && Number.isFinite(metadata.line) ? metadata.line : undefined)

  if (typeof rawOffset !== "number" || rawOffset <= 0) {
    return undefined
  }

  return Math.floor(rawOffset)
}

const renderReadFilePath = (displayPath: string, animate = true) => {
  const lastSlash = displayPath.lastIndexOf("/")

  if (lastSlash === -1) {
    return (
      <Text
        variant={animate ? "generate-effect" : "static"}
        className={cn("min-w-0 flex-1 truncate whitespace-nowrap", TOOL_ROW_DESCRIPTION_CLASS)}
        style={{ color: "var(--tools-title)" }}
        title={displayPath}
      >
        {displayPath}
      </Text>
    )
  }

  const dir = displayPath.slice(0, lastSlash)
  const name = displayPath.slice(lastSlash + 1)
  const hasAbsoluteRoot = dir.startsWith("/")
  const displayDir = hasAbsoluteRoot ? dir.slice(1) : dir

  return (
    <span
      className={cn("min-w-0 inline-flex max-w-full flex-1 items-baseline overflow-hidden", TOOL_ROW_DESCRIPTION_CLASS)}
      title={displayPath}
    >
      {hasAbsoluteRoot ? (
        <span className="flex-shrink-0" style={{ color: "var(--tools-description)" }}>
          /
        </span>
      ) : null}
      <span
        className="min-w-0 shrink truncate whitespace-nowrap"
        style={{
          color: "var(--tools-description)",
          direction: "rtl",
          textAlign: "left",
          unicodeBidi: "plaintext",
        }}
      >
        {displayDir}
      </span>
      <span className="flex-shrink-0" style={{ color: "var(--tools-description)" }}>
        /
      </span>
      <Text
        variant={animate ? "generate-effect" : "static"}
        className="flex-shrink-0"
        style={{ color: "var(--tools-title)" }}
      >
        {name}
      </Text>
    </span>
  )
}

const resolveAbsolutePath = (currentDirectory: string, filePath: string): string => {
  const normalizedPath = normalizeToolDisplayPath(filePath)
  if (!normalizedPath) {
    return ""
  }
  if (normalizedPath.startsWith("/") || /^[A-Za-z]:\//.test(normalizedPath)) {
    return normalizedPath
  }
  const normalizedDirectory = normalizeToolDisplayPath(currentDirectory)
  if (!normalizedDirectory) {
    return normalizedPath
  }
  return normalizedDirectory.endsWith("/")
    ? `${normalizedDirectory}${normalizedPath}`
    : `${normalizedDirectory}/${normalizedPath}`
}

const resolveSkillFilePath = (skillPathOrDir: string): string => {
  const normalizedPath = normalizeToolDisplayPath(skillPathOrDir)
  if (!normalizedPath) {
    return ""
  }

  return normalizedPath.toLowerCase().endsWith("/skill.md") ? normalizedPath : `${normalizedPath}/SKILL.md`
}

const getContextDirectoryForPath = (currentDirectory: string, absolutePath: string): string => {
  const normalizedDirectory = normalizeToolDisplayPath(currentDirectory)
  if (normalizedDirectory) {
    return normalizedDirectory
  }

  const normalizedPath = normalizeToolDisplayPath(absolutePath)
  if (!normalizedPath) {
    return ""
  }
  const parent = normalizedPath.replace(/\/[^/]*$/, "")
  return parent || normalizedPath
}

/**
 * Get a short description for a static tool (for aggregation display).
 */
const getToolShortDescription = (activity: TurnActivityPart): string | null => {
  const part = activity.part as ToolPartType
  const toolName = part.tool?.toLowerCase() ?? ""
  const state = part.state as { input?: Record<string, unknown>; metadata?: Record<string, unknown> } | undefined
  const input = state?.input
  const metadata = state?.metadata

  // For search tools, show pattern
  if (toolName === "grep" || toolName === "search" || toolName === "find" || toolName === "ripgrep") {
    const pattern = input?.pattern
    if (typeof pattern === "string" && pattern.trim().length > 0) {
      return pattern.length > 40 ? pattern.slice(0, 40) + "..." : pattern
    }
  }

  // For glob, show pattern
  if (toolName === "glob") {
    const pattern = input?.pattern
    if (typeof pattern === "string" && pattern.trim().length > 0) {
      return pattern.length > 40 ? pattern.slice(0, 40) + "..." : pattern
    }
  }

  // For web search tools, show query
  if (
    toolName === "websearch" ||
    toolName === "web-search" ||
    toolName === "search_web" ||
    toolName === "codesearch" ||
    toolName === "perplexity"
  ) {
    const query = input?.query
    if (typeof query === "string" && query.trim().length > 0) {
      return query.length > 50 ? query.slice(0, 50) + "..." : query
    }
  }

  // For skill, show name
  if (toolName === "skill") {
    const name = input?.name
    if (typeof name === "string" && name.trim().length > 0) {
      return name
    }
  }

  // For fetch-url tools, show URL
  if (toolName === "webfetch" || toolName === "fetch" || toolName === "curl" || toolName === "wget") {
    const url =
      (typeof input?.url === "string" && input.url) ||
      (typeof input?.URL === "string" && input.URL) ||
      (typeof metadata?.url === "string" && metadata.url) ||
      (typeof metadata?.URL === "string" && metadata.URL) ||
      ""

    if (typeof url === "string" && url.trim().length > 0) {
      return url.trim()
    }
  }

  // For todo tools, show status summary without task names
  if (toolName === "todowrite" || toolName === "todoread") {
    return getTodoSummaryFromActivity(activity)
  }

  // Fallback: try filename
  return getToolFileName(activity)
}

const areActivityListsEqual = (left: TurnActivityPart[], right: TurnActivityPart[]): boolean => {
  if (left === right) {
    return true
  }

  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftActivity = left[index]
    const rightActivity = right[index]

    if (leftActivity.id !== rightActivity.id) {
      return false
    }

    if (leftActivity.kind !== rightActivity.kind || leftActivity.endedAt !== rightActivity.endedAt) {
      return false
    }

    if (!areRenderRelevantPartsEqual([leftActivity.part], [rightActivity.part])) {
      return false
    }
  }

  return true
}


const StaticToolRowInner: React.FC<{
  toolName: string
  activities: TurnActivityPart[]
  animateTailText: boolean
}> = ({ toolName, activities, animateTailText }) => {
  const showToolFileIcons = useUIStore((state) => state.showToolFileIcons)
  const displayName = getToolMetadata(toolName).displayName
  const icon = getToolIcon(toolName)
  const isReadGroup = toolName.toLowerCase() === "read"
  const runtime = React.useContext(RuntimeAPIContext)
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory)
  const skills = useSkillsStore((state) => state.skills)
  const hasRunningActivity = React.useMemo(
    () => activities.some((activity) => isActivityRunning(activity)),
    [activities],
  )
  const skillByName = React.useMemo(() => new Map(skills.map((skill) => [skill.name, skill])), [skills])

  const descriptions = React.useMemo(() => {
    const descs: string[] = []
    for (const activity of activities) {
      const desc = getToolShortDescription(activity)
      if (desc && !descs.includes(desc)) {
        descs.push(desc)
      }
    }
    return descs
  }, [activities])

  const skillEntries = React.useMemo(() => {
    if (toolName.toLowerCase() !== "skill") return [] as Array<{ name: string; path: string }>

    const entries: Array<{ name: string; path: string }> = []
    for (const activity of activities) {
      const name = getToolShortDescription(activity)
      if (!name) continue

      const skill = skillByName.get(name)
      const rawPath = skill?.path || getToolSkillDirectory(activity)
      const path = rawPath ? resolveSkillFilePath(rawPath) : ""
      if (!path || entries.some((entry) => entry.name === name && entry.path === path)) continue
      entries.push({ name, path })
    }

    return entries
  }, [activities, skillByName, toolName])

  const readFileEntries = React.useMemo(() => {
    if (!isReadGroup) return [] as Array<{ path: string; displayPath: string; offset?: number }>

    const entries: Array<{ path: string; displayPath: string; offset?: number }> = []
    for (const activity of activities) {
      const filePath = getToolFilePath(activity)
      const offset = getToolReadOffset(activity)
      if (!filePath) continue
      if (entries.some((entry) => entry.path === filePath)) continue
      const displayPath = getToolRelativePath(filePath, currentDirectory)
      if (!displayPath) continue
      entries.push({ path: filePath, displayPath, offset })
    }
    return entries
  }, [activities, currentDirectory, isReadGroup])

  const handleReadFileClick = React.useCallback(
    (filePath: string, offset?: number) => {
      const absolutePath = resolveAbsolutePath(currentDirectory, filePath)
      if (!absolutePath) {
        return
      }

      if (runtime?.editor) {
        void runtime.editor.openFile(absolutePath, offset)
        return
      }

      const uiStore = useUIStore.getState()
      const contextDirectory = getContextDirectoryForPath(currentDirectory, absolutePath)
      if (offset && Number.isFinite(offset)) {
        uiStore.openContextFileAtLine(contextDirectory, absolutePath, Math.max(1, Math.trunc(offset)), 1)
        return
      }
      uiStore.openContextFile(contextDirectory, absolutePath)
    },
    [currentDirectory, runtime],
  )

  const handleSkillClick = React.useCallback(
    (skillPath: string) => {
      if (!skillPath) {
        return
      }
      const uiStore = useUIStore.getState()
      uiStore.openContextFile(currentDirectory || getContextDirectoryForPath("", skillPath), skillPath)
    },
    [currentDirectory],
  )

  const normalizedToolName = toolName.toLowerCase()
  const isSearchGroup =
    normalizedToolName === "grep" ||
    normalizedToolName === "search" ||
    normalizedToolName === "find" ||
    normalizedToolName === "ripgrep" ||
    normalizedToolName === "glob"
  const isFetchGroup =
    normalizedToolName === "webfetch" ||
    normalizedToolName === "fetch" ||
    normalizedToolName === "curl" ||
    normalizedToolName === "wget"
  const isSkillGroup = normalizedToolName === "skill"

  return (
    <div className={cn("flex w-full items-center gap-x-1.5 pr-2 pl-px py-1.5 rounded-xl min-w-0")}>
      <div className="inline-flex h-5 items-center flex-shrink-0" style={{ color: "var(--tools-icon)" }}>
        {icon}
      </div>
      <MinDurationShineText
        active={hasRunningActivity}
        minDurationMs={1000}
        className={cn(TOOL_ROW_TITLE_CLASS, "inline-flex items-center flex-shrink-0 opacity-85")}
        style={{ color: "var(--tools-title)" }}
        title={displayName}
      >
        {displayName}
      </MinDurationShineText>
      {isReadGroup && readFileEntries.length > 0
        ? readFileEntries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleReadFileClick(entry.path, entry.offset)
              }}
              className={cn(
                "inline-flex !min-h-0 items-center justify-start gap-1 min-w-0 flex-1 text-left hover:opacity-90",
                TOOL_ROW_DESCRIPTION_CLASS,
              )}
              style={{ color: "var(--tools-description)" }}
              title={entry.offset ? `${entry.displayPath}:${entry.offset}` : entry.displayPath}
            >
              {showToolFileIcons ? <FileTypeIcon filePath={entry.path} className="h-3.5 w-3.5" /> : null}
              {renderReadFilePath(entry.displayPath, animateTailText)}
            </button>
          ))
        : null}
      {isSearchGroup && descriptions.length > 0
        ? descriptions.map((desc, index) => (
            <span key={`${desc}-${index}`} className="inline-flex min-w-0 flex-1">
              <Text
                variant={animateTailText ? "generate-effect" : "static"}
                className={cn("min-w-0 flex-1 truncate whitespace-nowrap", TOOL_ROW_DESCRIPTION_CLASS)}
                style={{ color: "var(--tools-description)" }}
                title={desc}
              >
                "{desc}"
              </Text>
            </span>
          ))
        : null}
      {isFetchGroup && descriptions.length > 0
        ? descriptions.map((url, index) => {
            const safeHref = getSafeToolFetchHref(url)
            const content = (
              <>
                {safeHref ? <ExternalLinkFavicon href={safeHref} /> : null}
                <span className="min-w-0 truncate">{url}</span>
              </>
            )
            const className = cn(
              "min-w-0 flex-1 inline-flex items-center gap-1.5",
              safeHref &&
                "bg-transparent p-0 text-left font-[inherit] underline decoration-[color:var(--status-info)] underline-offset-2 hover:opacity-90",
              "truncate whitespace-nowrap",
              TOOL_ROW_DESCRIPTION_CLASS,
            )

            return safeHref ? (
              <button
                key={`${url}-${index}`}
                type="button"
                className={className}
                style={{ color: "var(--status-info)" }}
                title={url}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  void openExternalUrl(safeHref)
                }}
              >
                {content}
              </button>
            ) : (
              <span
                key={`${url}-${index}`}
                className={className}
                style={{ color: "var(--tools-description)" }}
                title={url}
              >
                {content}
              </span>
            )
          })
        : null}
      {isSkillGroup && skillEntries.length > 0
        ? skillEntries.map((entry, index) => (
            <button
              key={`${entry.name}-${entry.path}-${index}`}
              type="button"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleSkillClick(entry.path)
              }}
              className={cn(
                "!min-h-0 min-w-0 flex-1 truncate whitespace-nowrap text-left hover:opacity-90",
                TOOL_ROW_DESCRIPTION_CLASS,
              )}
              style={{ color: "var(--tools-description)" }}
              title={entry.path}
            >
              {entry.name}
            </button>
          ))
        : null}
      {!isReadGroup && !isSearchGroup && !isFetchGroup && !isSkillGroup && descriptions.length > 0 ? (
        <Text
          variant={animateTailText ? "generate-effect" : "static"}
          className={cn("min-w-0 flex-1 truncate whitespace-nowrap", TOOL_ROW_DESCRIPTION_CLASS)}
          style={{ color: "var(--tools-description)" }}
        >
          {descriptions.join(" ")}
        </Text>
      ) : null}
    </div>
  )
}

export const StaticToolRow = React.memo(StaticToolRowInner, (prev, next) => {
  return (
    prev.toolName === next.toolName &&
    prev.animateTailText === next.animateTailText &&
    areActivityListsEqual(prev.activities, next.activities)
  )
})

/**
 * Inline reasoning text block — rendered as dimmed italic markdown.
 */
