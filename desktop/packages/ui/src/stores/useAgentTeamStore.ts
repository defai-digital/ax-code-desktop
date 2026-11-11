import { create } from "zustand"
import { persist } from "zustand/middleware"
import {
  disableAgentTeam,
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
}

type AgentTeamStoreActions = {
  getTeam: (directory: string | null | undefined) => AgentTeamState
  toggleModel: (directory: string | null | undefined, role: AgentTeamRole, model: AgentTeamModelRef) => void
  setRoleEnabled: (directory: string | null | undefined, role: AgentTeamRole, enabled: boolean) => void
  /** Turn both roles off for a directory, keeping the remembered models. Used on new chat. */
  disableTeam: (directory: string | null | undefined) => void
}

type AgentTeamStore = AgentTeamStoreState & AgentTeamStoreActions

const EMPTY_TEAM = emptyAgentTeam()

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
        getTeam: (directory) => get().teamByDirectory[normalizeDirectoryKey(directory)] ?? EMPTY_TEAM,
        toggleModel: (directory, role, model) => update(directory, (team) => toggleAgentTeamModel(team, role, model)),
        setRoleEnabled: (directory, role, enabled) =>
          update(directory, (team) => setAgentTeamRoleEnabled(team, role, enabled)),
        disableTeam: (directory) => update(directory, disableAgentTeam),
      }
    },
    {
      name: "ax-code-agent-team",
      partialize: (state) => ({ teamByDirectory: state.teamByDirectory }),
      // Persisted state is untrusted: re-validate refs and limits on load.
      merge: (persisted, current) => {
        const stored = (persisted as Partial<AgentTeamStoreState> | undefined)?.teamByDirectory
        const teamByDirectory: Record<string, AgentTeamState> = {}
        if (stored && typeof stored === "object") {
          for (const [key, value] of Object.entries(stored)) teamByDirectory[key] = parseAgentTeam(value)
        }
        return { ...current, teamByDirectory }
      },
    },
  ),
)
