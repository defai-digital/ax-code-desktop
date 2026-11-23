import React from "react"
import { FollowUpList } from "@/components/projects/FollowUpList"
import { NeedsYouQueue } from "@/components/projects/NeedsYouQueue"

/**
 * What the draft home shows under the composer before the project list: sessions that need a decision, then the quiet
 * Follow-up list (an unseen failure, finished work left uncommitted), as on the projects home (G UX-15). Each list
 * renders nothing when it is empty.
 */
export function DraftHomeAttention(): React.ReactNode {
  return (
    <>
      <NeedsYouQueue className="chat-input-column mt-1" />
      <FollowUpList className="chat-input-column mt-3" />
    </>
  )
}
