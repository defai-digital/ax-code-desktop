export type WikiFileOpenPlan =
  | { action: "copy"; path: string }
  | { action: "open-files"; directory: string; path: string }
  | { action: "none" }

export interface WikiFileOpenContext {
  path: string
  directory?: string | null
  isMobile: boolean
  activeMainTab: string
  splitPaneEnabled: boolean
  splitPaneRightTab: string
}

/** True when this panel is the view the user is looking at, so opening Files would replace it. */
export function wikiViewIsShowing(
  context: Pick<WikiFileOpenContext, "isMobile" | "activeMainTab" | "splitPaneEnabled" | "splitPaneRightTab">,
): boolean {
  if (context.isMobile) return context.activeMainTab === "wiki"
  return context.splitPaneEnabled && context.splitPaneRightTab === "wiki"
}

/**
 * Opening Files calls openBesideChat("files"), which replaces the wiki split tab (or the mobile
 * wiki tab). While wiki is the current view, copy the path instead.
 */
export function planWikiFileOpen(context: WikiFileOpenContext): WikiFileOpenPlan {
  const path = context.path.trim()
  if (!path) return { action: "none" }
  const directory = context.directory?.trim() ?? ""
  if (wikiViewIsShowing(context) || !directory) return { action: "copy", path }
  return { action: "open-files", directory, path }
}
