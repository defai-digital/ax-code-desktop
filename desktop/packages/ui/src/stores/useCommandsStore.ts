import { create } from "zustand"
import { devtools, persist, createJSONStorage } from "zustand/middleware"
import { axCodeClient } from "@/lib/ax-code/client"
import { startConfigUpdate, finishConfigUpdate, updateConfigUpdateMessage } from "@/lib/configUpdate"
import { emitConfigChange, scopeMatches, subscribeToConfigChanges } from "@/lib/configSync"
import { createSingleFlight } from "@/lib/singleFlight"
import { getSafeStorage } from "./utils/safeStorage"
import { sleep, waitForAxCodeConnection } from "./utils/axCodeConnection"
import { API_ENDPOINTS, replacePathParams } from "@/lib/http"
import { streamDebugEnabled } from "@/stores/utils/streamDebug"
import { getActiveConfigDirectory } from "@/stores/utils/configDirectory"
import { getDirectoryCacheKey } from "@/stores/utils/cacheKey"
import { buildRecordSignature } from "@/stores/utils/signature"
import { setConfigCacheEntry } from "./utils/configCache"

export type CommandScope = "user" | "project"

export interface CommandConfig {
  name: string
  description?: string
  agent?: string | null
  model?: string | null
  source?: string
  template?: string
  scope?: CommandScope
}

export interface Command extends CommandConfig {
  isBuiltIn?: boolean
}

// Built-in commands provided by ax-code (not defined in user config directories)
const BUILTIN_COMMAND_NAMES = new Set(["init", "review"])

export const isCommandBuiltIn = (command: Command): boolean => {
  return BUILTIN_COMMAND_NAMES.has(command.name)
}

const CONFIG_EVENT_SOURCE = "useCommandsStore"
const COMMANDS_LOAD_CACHE_TTL_MS = 5000
const commandsLastLoadedAt = new Map<string, number>()
const commandsCacheByKey = new Map<string, Command[]>()
const commandsLoadInFlight = createSingleFlight<boolean>()
const commandsLoadRequestIds = new Map<string, number>()
let commandsLoadSequence = 0

const invalidateCommandsCache = (directory: string | null) => {
  const cacheKey = getDirectoryCacheKey(directory)
  commandsLastLoadedAt.delete(cacheKey)
  commandsCacheByKey.delete(cacheKey)
}

// User-scope commands appear in every project's merged catalog.
const invalidateCommandsCaches = (directory: string | null, affectsAllDirectories: boolean) => {
  if (affectsAllDirectories) {
    commandsLastLoadedAt.clear()
    commandsCacheByKey.clear()
    return
  }
  invalidateCommandsCache(directory)
}

const buildCommandsSignature = (commands: Command[]): string =>
  buildRecordSignature(commands, (command) => [
    command.name,
    command.scope,
    command.description,
    command.agent,
    command.model,
    command.source,
    // The template is the command's editable body; a reload that only changed it
    // must not be dropped as "unchanged" (the editor and Duplicate both read it).
    command.template,
    command.isBuiltIn === true,
  ])

interface CommandDraft {
  name: string
  scope: CommandScope
  description?: string
  agent?: string | null
  model?: string | null
  template?: string
}

interface CommandsStore {
  selectedCommandName: string | null
  commands: Command[]
  isLoading: boolean
  commandDraft: CommandDraft | null

  setSelectedCommand: (name: string | null) => void
  setCommandDraft: (draft: CommandDraft | null) => void
  loadCommands: () => Promise<boolean>
  createCommand: (config: CommandConfig) => Promise<boolean>
  updateCommand: (name: string, config: Partial<CommandConfig>) => Promise<boolean>
  deleteCommand: (name: string, target?: { scope?: CommandScope | null; directory?: string | null }) => Promise<boolean>
  getCommandByName: (name: string) => Command | undefined
}

export const useCommandsStore = create<CommandsStore>()(
  devtools(
    persist(
      (set, get) => ({
        selectedCommandName: null,
        commands: [],
        isLoading: false,
        commandDraft: null,

        setSelectedCommand: (name: string | null) => {
          set({ selectedCommandName: name })
        },

        setCommandDraft: (draft: CommandDraft | null) => {
          set({ commandDraft: draft })
        },

        loadCommands: async () => {
          const directory = getActiveConfigDirectory("CommandsStore")
          const cacheKey = getDirectoryCacheKey(directory)
          const now = Date.now()
          const loadedAt = commandsLastLoadedAt.get(cacheKey) ?? 0
          const cachedCommands = commandsCacheByKey.get(cacheKey)

          if (cachedCommands && now - loadedAt < COMMANDS_LOAD_CACHE_TTL_MS) {
            // A cache hit is the newest word for the store: advance the sequence
            // so an older in-flight load for another directory cannot write its
            // result over this list when it settles.
            commandsLoadSequence += 1
            set({ commands: cachedCommands, isLoading: false })
            return true
          }


          return commandsLoadInFlight.run(cacheKey, async () => {
            const requestId = ++commandsLoadSequence
            commandsLoadRequestIds.set(cacheKey, requestId)
            const isCurrentLoad = () =>
              commandsLoadSequence === requestId && commandsLoadRequestIds.get(cacheKey) === requestId
            set({ isLoading: true })
            const previousCommands = get().commands
            const previousSignature = buildCommandsSignature(previousCommands)
            let lastError: unknown = null

            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : ""

                // Ensure the list is scoped to the same directory we use for config source detection.
                const commands = await axCodeClient.withDirectory(directory, () =>
                  axCodeClient.listCommandsWithDetails(),
                )

                const commandsWithScope = await Promise.all(
                  commands.map(async (cmd) => {
                    // Runtime invocation policy already filtered this catalog. Keep skills
                    // available for slash dispatch without treating them as editable commands.
                    if (cmd.source === "skill") return cmd
                    try {
                      // Force no-cache
                      const response = await fetch(
                        `${replacePathParams(API_ENDPOINTS.config.command, {
                          name: cmd.name,
                        })}${queryParams}`,
                        {
                          headers: {
                            "Cache-Control": "no-cache",
                            ...(directory ? { "x-ax-code-directory": directory } : {}),
                          },
                        },
                      )

                      if (response.ok) {
                        const data = await response.json()

                        // Prioritize explicit scope
                        let scope = data.scope

                        // Fallback to deducing from sources
                        if (!scope && data.sources) {
                          const sources = data.sources
                          scope =
                            (sources.md?.exists ? sources.md.scope : undefined) ??
                            (sources.json?.exists ? sources.json.scope : undefined) ??
                            sources.md?.scope ??
                            sources.json?.scope
                        }

                        if (scope === "project" || scope === "user") {
                          return { ...cmd, scope: scope as CommandScope }
                        }

                        // Explicitly set null scope if not found
                        return { ...cmd, scope: undefined }
                      }
                    } catch (err) {
                      console.warn(`[CommandsStore] Failed to fetch config for command ${cmd.name}:`, err)
                    }
                    return cmd
                  }),
                )

                // A load whose result was discarded (another directory's load
                // started later and won) put nothing in the store, so it must not
                // report success: the caller would read this directory's commands
                // out of the other directory's list, find the user's command
                // missing, and send the slash command as plain text.
                if (!isCurrentLoad()) return false
                const nextSignature = buildCommandsSignature(commandsWithScope)
                if (previousSignature !== nextSignature) {
                  set({ commands: commandsWithScope, isLoading: false })
                } else {
                  set({ isLoading: false })
                }
                setConfigCacheEntry(commandsCacheByKey, cacheKey, commandsWithScope)
                commandsLastLoadedAt.set(cacheKey, Date.now())
                return true
              } catch (error) {
                lastError = error
                const waitMs = 200 * (attempt + 1)
                await new Promise((resolve) => setTimeout(resolve, waitMs))
              }
            }

            console.error("Failed to load commands:", lastError)
            if (isCurrentLoad()) {
              set({ commands: previousCommands, isLoading: false })
            }
            return false
          })
        },

        createCommand: async (config: CommandConfig) => {
          startConfigUpdate("Creating command configuration…")
          let requiresReload = false
          try {
            if (streamDebugEnabled()) {
              console.log("[CommandsStore] Creating command:", config.name)
            }

            const commandConfig: Record<string, unknown> = {
              template: config.template || "",
            }

            if (config.description) commandConfig.description = config.description
            if (config.agent) commandConfig.agent = config.agent
            if (config.model) commandConfig.model = config.model
            if (config.scope) commandConfig.scope = config.scope

            if (streamDebugEnabled()) {
              console.log("[CommandsStore] Command config to save:", commandConfig)
            }

            const directory = getActiveConfigDirectory("CommandsStore")
            const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : ""

            const response = await fetch(
              `${replacePathParams(API_ENDPOINTS.config.command, {
                name: config.name,
              })}${queryParams}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(directory ? { "x-ax-code-directory": directory } : {}),
                },
                body: JSON.stringify(commandConfig),
              },
            )

            const payload = await response.json().catch(() => null)
            if (!response.ok) {
              const message = payload?.error || "Failed to create command"
              throw new Error(message)
            }

            invalidateCommandsCaches(directory, config.scope !== "project")

            if (streamDebugEnabled()) {
              console.log("[CommandsStore] Command created successfully")
            }

            const needsReload = payload?.requiresReload ?? true
            if (needsReload) {
              requiresReload = true
              await performFullConfigRefresh({
                message: payload?.message,
                delayMs: payload?.reloadDelayMs,
              })
              return true
            }

            const loaded = await get().loadCommands()
            if (loaded) {
              emitConfigChange("commands", { source: CONFIG_EVENT_SOURCE })
            }
            // The write landed even if the runtime reload did not: a failed
            // refresh must not report the mutation itself as failed.
            return loaded || payload?.reloadFailed === true
          } catch (error) {
            console.error("[CommandsStore] Failed to create command:", error)
            return false
          } finally {
            if (!requiresReload) {
              finishConfigUpdate()
            }
          }
        },

        updateCommand: async (name: string, config: Partial<CommandConfig>) => {
          startConfigUpdate("Updating command configuration…")
          let requiresReload = false
          try {
            if (streamDebugEnabled()) {
              console.log("[CommandsStore] Updating command:", name)
              console.log("[CommandsStore] Config received:", config)
            }

            const commandConfig: Record<string, unknown> = {}

            if (config.description !== undefined) commandConfig.description = config.description
            if (config.agent !== undefined) commandConfig.agent = config.agent
            if (config.model !== undefined) commandConfig.model = config.model
            if (config.template !== undefined) commandConfig.template = config.template

            if (streamDebugEnabled()) {
              console.log("[CommandsStore] Command config to update:", commandConfig)
            }

            const directory = getActiveConfigDirectory("CommandsStore")
            const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : ""

            const response = await fetch(
              `${replacePathParams(API_ENDPOINTS.config.command, {
                name,
              })}${queryParams}`,
              {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  ...(directory ? { "x-ax-code-directory": directory } : {}),
                },
                body: JSON.stringify(commandConfig),
              },
            )

            const payload = await response.json().catch(() => null)
            if (!response.ok) {
              const message = payload?.error || "Failed to update command"
              throw new Error(message)
            }

            invalidateCommandsCaches(
              directory,
              (config.scope ?? get().getCommandByName(name)?.scope) !== "project",
            )

            if (streamDebugEnabled()) {
              console.log("[CommandsStore] Command updated successfully")
            }

            const needsReload = payload?.requiresReload ?? true
            if (needsReload) {
              requiresReload = true
              await performFullConfigRefresh({
                message: payload?.message,
                delayMs: payload?.reloadDelayMs,
              })
              return true
            }

            const loaded = await get().loadCommands()
            if (loaded) {
              emitConfigChange("commands", { source: CONFIG_EVENT_SOURCE })
            }
            // The write landed even if the runtime reload did not: a failed
            // refresh must not report the mutation itself as failed.
            return loaded || payload?.reloadFailed === true
          } catch (error) {
            console.error("[CommandsStore] Failed to update command:", error)
            return false
          } finally {
            if (!requiresReload) {
              finishConfigUpdate()
            }
          }
        },

        deleteCommand: async (name: string, target?: { scope?: CommandScope | null; directory?: string | null }) => {
          startConfigUpdate("Deleting command configuration…")
          let requiresReload = false
          try {
            const activeDirectory = getActiveConfigDirectory("CommandsStore")
            if (target?.directory !== undefined && target.directory !== activeDirectory) {
              return false
            }
            const directory = target?.directory ?? activeDirectory
            const originalCommand = get().getCommandByName(name)
            // Deleting by name alone removed the project and user copies
            // together; the entry's scope scopes the delete to what was shown.
            const params = new URLSearchParams()
            if (directory) params.set("directory", directory)
            if (target?.scope) params.set("scope", target.scope)
            const queryParams = params.size > 0 ? `?${params.toString()}` : ""

            const response = await fetch(
              `${replacePathParams(API_ENDPOINTS.config.command, {
                name,
              })}${queryParams}`,
              {
                method: "DELETE",
                headers: directory ? { "x-ax-code-directory": directory } : undefined,
              },
            )

            const payload = await response.json().catch(() => null)
            if (!response.ok) {
              const message = payload?.error || "Failed to delete command"
              throw new Error(message)
            }

            invalidateCommandsCaches(directory, target?.scope !== "project")

            if (streamDebugEnabled()) {
              console.log("[CommandsStore] Command deleted successfully")
            }

            const needsReload = payload?.requiresReload ?? true
            if (needsReload) {
              requiresReload = true
              await performFullConfigRefresh({
                message: payload?.message,
                delayMs: payload?.reloadDelayMs,
              })
              return true
            }

            const loaded = await get().loadCommands()
            if (loaded) {
              emitConfigChange("commands", { source: CONFIG_EVENT_SOURCE })
            }

            // A completion that outlived a project switch must not clear or
            // edit the new project's same-name selection and inventory.
            if (getActiveConfigDirectory("CommandsStore") === directory) {
              if (get().selectedCommandName === name) {
                set({ selectedCommandName: null })
              }

              // The write landed even if the runtime reload did not: a failed
              // refresh must not report the mutation itself as failed. Drop the
              // row locally so the list matches what is on disk.
              if (!loaded && payload?.reloadFailed && originalCommand) {
                set({ commands: get().commands.filter((command) => command !== originalCommand) })
              }
            }
            return loaded || payload?.reloadFailed === true
          } catch (error) {
            console.error("Failed to delete command:", error)
            return false
          } finally {
            if (!requiresReload) {
              finishConfigUpdate()
            }
          }
        },

        getCommandByName: (name: string) => {
          const { commands } = get()
          return commands.find((c) => c.name === name)
        },
      }),
      {
        name: "commands-store",
        storage: createJSONStorage(() => getSafeStorage()),
        partialize: (state) => ({
          selectedCommandName: state.selectedCommandName,
        }),
      },
    ),
    {
      name: "commands-store",
    },
  ),
)

if (typeof window !== "undefined") {
  window.__zustand_commands_store__ = useCommandsStore
}

async function performFullConfigRefresh(options: { message?: string; delayMs?: number } = {}) {
  const { message, delayMs } = options

  try {
    updateConfigUpdateMessage(message || "Refreshing commands…")
  } catch {
    // ignore
  }

  try {
    await waitForAxCodeConnection(delayMs)
    updateConfigUpdateMessage("Refreshing commands…")

    const commandsStore = useCommandsStore.getState()

    await commandsStore.loadCommands()

    emitConfigChange("commands", { source: CONFIG_EVENT_SOURCE })
  } catch (error) {
    console.error("[CommandsStore] Failed to refresh configuration after AX Code restart:", error)
    updateConfigUpdateMessage("AX Code refresh failed. Please retry refreshing configuration manually.")
    await sleep(1500)
  } finally {
    finishConfigUpdate()
  }
}

subscribeToConfigChanges((event) => {
  if (event.source === CONFIG_EVENT_SOURCE) {
    return
  }

  if (scopeMatches(event, "commands")) {
    const { loadCommands } = useCommandsStore.getState()
    void loadCommands()
  }
})
