import { createContext } from "react"

/**
 * Whether turns fold their Activity (Activity set to collapsed), and which
 * turns a later turn's assistant reply has retired. Provided once by the
 * message list so history rows and the streaming tail read the same state.
 */
export const LiveActivityFoldContext = createContext<{
  enabled: boolean
  turnsWithLaterAssistant: ReadonlySet<string>
}>({ enabled: false, turnsWithLaterAssistant: new Set() })
