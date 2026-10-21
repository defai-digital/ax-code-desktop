import React from "react"
import { invokeDesktop } from "@/lib/desktop"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import { isMiniChatReturnMessage, MINI_CHAT_PRESENCE_CHANNEL, miniChatReturnMatches } from "./miniChatPresence"

/** Request closure only. The native window inventory confirms ownership release, even if close is vetoed. */
export function MiniChatGridReturn({ config }: { config: { sessionId: string | null; directory: string | null } }) {
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId)
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory)
  // The native window inventory owns the launch identity even when its chat selection changes.
  const sessionId = config.sessionId || currentSessionId
  const directory = config.sessionId ? config.directory : currentDirectory
  React.useEffect(() => {
    if (!sessionId || !directory || typeof BroadcastChannel === "undefined") return
    const channel = new BroadcastChannel(MINI_CHAT_PRESENCE_CHANNEL)
    document.documentElement.dataset.miniChatGridReturn = "true"
    channel.onmessage = (event) => {
      if (!isMiniChatReturnMessage(event.data) || !miniChatReturnMatches(event.data, sessionId, directory)) return
      void invokeDesktop("desktop_close_current_window").catch((error: unknown) => {
        console.warn("[session-grid] failed to close the session window", error)
      })
    }
    return () => {
      delete document.documentElement.dataset.miniChatGridReturn
      channel.close()
    }
  }, [directory, sessionId])
  return null
}
