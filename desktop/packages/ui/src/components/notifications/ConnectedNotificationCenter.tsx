import { useAllPendingRequests } from "@/sync/sync-context"
import { NotificationCenter } from "./NotificationCenter"

export function ConnectedNotificationCenter() {
  const pendingRequests = useAllPendingRequests()
  return <NotificationCenter pendingRequests={[...pendingRequests]} />
}
