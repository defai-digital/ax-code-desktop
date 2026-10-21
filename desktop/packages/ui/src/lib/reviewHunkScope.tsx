import React, { useMemo } from "react"

import { ReviewHunkScopeContext } from "./reviewHunkRegistry"

/**
 * One mounted review pane (main diff, split, context panel, beside-session).
 * Children publish and highlight through this id so a second pane cannot move the first.
 */
export function ReviewHunkScopeProvider(props: { id: string; directory: string; children: React.ReactNode }) {
  const value = useMemo(() => ({ id: props.id, directory: props.directory }), [props.directory, props.id])
  return <ReviewHunkScopeContext.Provider value={value}>{props.children}</ReviewHunkScopeContext.Provider>
}
