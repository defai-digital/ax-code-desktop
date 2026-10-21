import React from "react"
import {
  ReviewThreadContentsContext,
  RegisterReviewThreadContentContext,
  type ReviewThreadContent,
} from "./ReviewThreadAnchorContext"

const EMPTY_CONTENTS: Record<string, ReviewThreadContent> = {}

export function ReviewThreadAnchorProvider({ children, scope }: { children: React.ReactNode; scope: string }) {
  const [snapshot, setSnapshot] = React.useState({ scope, contents: EMPTY_CONTENTS })
  const register = React.useCallback(
    (file: string, content: ReviewThreadContent) => {
      setSnapshot((current) => ({
        scope,
        contents: { ...(current.scope === scope ? current.contents : EMPTY_CONTENTS), [file]: content },
      }))
      return () =>
        setSnapshot((current) => {
          if (current.scope !== scope || current.contents[file] !== content) return current
          const contents = { ...current.contents }
          delete contents[file]
          return { scope, contents }
        })
    },
    [scope],
  )
  return (
    <RegisterReviewThreadContentContext.Provider value={register}>
      <ReviewThreadContentsContext.Provider value={snapshot.scope === scope ? snapshot.contents : EMPTY_CONTENTS}>
        {children}
      </ReviewThreadContentsContext.Provider>
    </RegisterReviewThreadContentContext.Provider>
  )
}
