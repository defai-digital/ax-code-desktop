import { parseWorkMode, type WorkModeId } from "@/lib/workMode"

export interface WorkModeChoice {
  id: WorkModeId
  label: string
  hint: string
}

/** Explicit labeled choices. A click selects one of these; it does not cycle. */
export const WORK_MODE_CHOICES: readonly WorkModeChoice[] = [
  {
    id: "agent",
    label: "Agent",
    hint: "Normal single-agent coding.",
  },
  {
    id: "council",
    label: "Council",
    hint: "Multi-provider advisory review.",
  },
  {
    id: "arena",
    label: "Arena",
    hint: "Multi-model best-of-N.",
  },
]

export function selectLabeledWorkMode(choice: WorkModeId): WorkModeId {
  return parseWorkMode(choice)
}

export const PRIMARY_EXECUTION_MODES = ["manual", "autonomous"] as const

export const OVERFLOW_SEND_CONTROLS = ["long-run", "webmcp"] as const

export function isPrimaryExecutionMode(mode: string): boolean {
  return (PRIMARY_EXECUTION_MODES as readonly string[]).includes(mode)
}

export const SESSION_MENU_TOP_ACTIONS = ["rename", "pin", "archive"] as const

export const SESSION_MENU_MORE_ACTIONS = [
  "share",
  "copy-link",
  "unshare",
  "export-markdown",
  "run-fusion",
  "open-side-panel",
  "open-mini-chat",
] as const

export type SessionMenuAction =
  | (typeof SESSION_MENU_TOP_ACTIONS)[number]
  | (typeof SESSION_MENU_MORE_ACTIONS)[number]

export function sessionMenuLayout(): {
  top: readonly SessionMenuAction[]
  more: readonly SessionMenuAction[]
} {
  return {
    top: SESSION_MENU_TOP_ACTIONS,
    more: SESSION_MENU_MORE_ACTIONS,
  }
}

export function sessionMenuGroup(action: SessionMenuAction): "top" | "more" {
  const layout = sessionMenuLayout()
  if ((layout.more as readonly string[]).includes(action)) return "more"
  return "top"
}
