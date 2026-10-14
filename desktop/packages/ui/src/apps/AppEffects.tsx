import React from "react"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"
import { useQueuedMessageAutoSend } from "@/hooks/useQueuedMessageAutoSend"
import { useTraySync } from "@/hooks/useTraySync"
import { useSessionAutoCleanup } from "@/hooks/useSessionAutoCleanup"
import { useWindowControlsOverlayLayout } from "@/hooks/useWindowControlsOverlayLayout"
import { setOptimisticRefs } from "@/sync/session-actions"
import { markSessionViewed } from "@/sync/notification-store"
import { setExternallyViewedSession } from "@/sync/sync-context"
import { useSync } from "@/sync/use-sync"
import { MINI_CHAT_PRESENCE_CHANNEL, isMiniChatPresenceMessage } from "./miniChatPresence"

const SyncOptimisticBridge: React.FC = () => {
  const sync = useSync()
  const addRef = React.useRef(sync.optimistic.add)
  const removeRef = React.useRef(sync.optimistic.remove)
  addRef.current = sync.optimistic.add
  removeRef.current = sync.optimistic.remove

  React.useEffect(() => {
    setOptimisticRefs(
      (input) => addRef.current(input),
      (input) => removeRef.current(input),
    )
  }, [])

  return null
}

const MiniChatPresenceBridge: React.FC = () => {
  React.useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return

    const channel = new BroadcastChannel(MINI_CHAT_PRESENCE_CHANNEL)
    channel.onmessage = (event) => {
      const data = event.data
      if (!isMiniChatPresenceMessage(data)) {
        return
      }

      const viewed = data.viewed !== false
      setExternallyViewedSession(data.directory, data.sessionId, viewed)
      if (viewed) {
        markSessionViewed(data.sessionId)
      }
    }

    return () => channel.close()
  }, [])

  return null
}

export function SyncRuntimeEffects({
  embeddedBackgroundWorkEnabled,
  globalHousekeepingEnabled = true,
}: {
  embeddedBackgroundWorkEnabled: boolean
  /**
   * Retention cleanup archives/deletes expired sessions globally, and its
   * "the user is looking at this session" guard only sees this window. Only the
   * primary window runs it, so a background window can never delete a session the
   * other window is viewing (and the work is not done twice).
   */
  globalHousekeepingEnabled?: boolean
}) {
  useSessionAutoCleanup(embeddedBackgroundWorkEnabled && globalHousekeepingEnabled)
  useQueuedMessageAutoSend(embeddedBackgroundWorkEnabled)
  // Streams the session/approval snapshot to the Electron tray and keeps the dock
  // badge in step. No-op outside the desktop shell.
  useTraySync(embeddedBackgroundWorkEnabled)

  return <SyncOptimisticBridge />
}

export function SyncAppEffects({ embeddedBackgroundWorkEnabled }: { embeddedBackgroundWorkEnabled: boolean }) {
  useWindowControlsOverlayLayout()
  useKeyboardShortcuts()

  return (
    <>
      <SyncRuntimeEffects embeddedBackgroundWorkEnabled={embeddedBackgroundWorkEnabled} />
      <MiniChatPresenceBridge />
    </>
  )
}
