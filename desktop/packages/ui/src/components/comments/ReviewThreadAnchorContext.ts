import React from "react"

export interface ReviewThreadContent {
  original: string
  modified: string
}

// Content is scoped to the review pane and only lives while its viewer is mounted.
// It must never be persisted or reused across repositories, sessions or diff scopes.
export const ReviewThreadContentsContext = React.createContext<Record<string, ReviewThreadContent>>({})
export const RegisterReviewThreadContentContext = React.createContext<
  ((file: string, content: ReviewThreadContent) => () => void) | null
>(null)
