import { create } from "zustand"
import { persist } from "zustand/middleware"
import {
  emptyAgentTeam,
  parseAgentTeam,
  setAgentTeamRoleEnabled,
  toggleAgentTeamModel,
  type AgentTeamModelRef,
  type AgentTeamRole,
  type AgentTeamState,
} from "@/lib/agentTeam"
import { normalizeDirectoryKey } from "@/stores/utils/directoryKey"

type AgentTeamStoreState = {
  teamByDirectory: Record<string, AgentTeamState>
  /**
   * User messages a single Coder ran on instead of the composer model, newest last. The message
   * records the coder's model with a "request" origin, so without this the composer would adopt the
   * coder as the user's own pick and keep it after the Coder is unticked.
   */
  coderMessageIds: string[]
}

type AgentTeamStoreActions = {
  getTeam: (directory: string | null | undefined) => AgentTeamState
  toggleModel: (directory: string | null | undefined, role: AgentTeamRole, model: AgentTeamModelRef) => void
  setRoleEnabled: (directory: string | null | undefined, role: AgentTeamRole, enabled: boolean) => void
  /** Replace a directory's team, e.g. with an accepted suggestion or its undo. */
  setTeam: (directory: string | null | undefined, team: AgentTeamState) => void
  markCoderMessage: (messageId: string) => void
  isCoderMessage: (messageId: string) => boolean
}

type AgentTeamStore = AgentTeamStoreState & AgentTeamStoreActions

const EMPTY_TEAM = emptyAgentTeam()
// Only the latest user message of an open session is ever checked, so a short history is enough.
export const MAX_CODER_MESSAGE_IDS = 200

export const useAgentTeamStore = create<AgentTeamStore>()(
  persist(
    (set, get) => {
      const update = (directory: string | null | undefined, change: (team: AgentTeamState) => AgentTeamState) => {
        const key = normalizeDirectoryKey(directory)
        set((state) => {
          const current = state.teamByDirectory[key] ?? EMPTY_TEAM
          const next = change(current)
          if (next === current) return state
          return { teamByDirectory: { ...state.teamByDirectory, [key]: next } }
        })
      }

      return {
        teamByDirectory: {},
        coderMessageIds: [],
        getTeam: (directory) => get().teamByDirectory[normalizeDirectoryKey(directory)] ?? EMPTY_TEAM,
        toggleModel: (directory, role, model) => update(directory, (team) => toggleAgentTeamModel(team, role, model)),
        setRoleEnabled: (directory, role, enabled) =>
          update(directory, (team) => setAgentTeamRoleEnabled(team, role, enabled)),
        setTeam: (directory, team) => update(directory, () => parseAgentTeam(team)),
        markCoderMessage: (messageId) => {
          if (!messageId || get().coderMessageIds.includes(messageId)) return
          set((state) => ({ coderMessageIds: [...state.coderMessageIds, messageId].slice(-MAX_CODER_MESSAGE_IDS) }))
        },
        isCoderMessage: (messageId) => Boolean(messageId) && get().coderMessageIds.includes(messageId),
      }
    },
    {
      name: "ax-code-agent-team",
      partialize: (state) => ({ teamByDirectory: state.teamByDirectory, coderMessageIds: state.coderMessageIds }),
      // Persisted state is untrusted: re-validate refs and limits on load.
      merge: (persisted, current) => {
        const saved = persisted as Partial<AgentTeamStoreState> | undefined
        const stored = saved?.teamByDirectory
        const teamByDirectory: Record<string, AgentTeamState> = {}
        if (stored && typeof stored === "object") {
          for (const [key, value] of Object.entries(stored)) teamByDirectory[key] = parseAgentTeam(value)
        }
        const coderMessageIds = Array.isArray(saved?.coderMessageIds)
          ? saved.coderMessageIds.filter((id): id is string => typeof id === "string" && id.length > 0)
          : []
        return { ...current, teamByDirectory, coderMessageIds: coderMessageIds.slice(-MAX_CODER_MESSAGE_IDS) }
      },
    },
  ),
)
