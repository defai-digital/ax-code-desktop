import type { GitAPI, GitStatus } from "@/lib/api/types"
import type { I18nContextValue } from "@/lib/i18n/react-context"

type Translate = I18nContextValue["t"]

/** Shared by the Git panel and review handoff; review never implicitly stages files. */
export async function commitChanges({
  git,
  directory,
  message,
  stagedPaths,
  changedPaths,
  t,
  allowCommitAll = true,
}: {
  git: GitAPI
  directory: string
  message: string
  stagedPaths: string[]
  changedPaths: string[]
  t: Translate
  allowCommitAll?: boolean
}) {
  if (!message.trim()) throw new Error(t("gitView.toast.enterCommitMessage"))
  const commitAll = allowCommitAll && stagedPaths.length === 0
  const files = [...new Set(commitAll ? changedPaths : stagedPaths)].sort()
  if (!files.length) throw new Error(t("gitView.toast.stageFileToCommit"))
  return git.createGitCommit(directory, message.trim(), { files, stageFiles: commitAll ? files : [] })
}

/** Preserve SyncActions' fetch/check/push path. Never pull or force-push implicitly. */
export async function pushChanges({
  git,
  directory,
  remote,
  t,
  expected,
}: {
  git: GitAPI
  directory: string
  remote: string
  t: Translate
  expected?: Pick<GitStatus, "current" | "tracking" | "ahead">
}): Promise<"pushed" | "upToDate"> {
  await git.gitFetch(directory, { remote })
  const status = await git.getGitStatus(directory)
  if (
    expected &&
    (status.current !== expected.current || status.tracking !== expected.tracking || status.ahead !== expected.ahead)
  ) {
    throw new Error(t("diffView.landing.contextChanged"))
  }
  if (status.behind > 0) {
    throw new Error(t("gitView.toast.pullBeforePush", { count: status.behind, name: remote }))
  }
  if (status.ahead === 0 && status.tracking) return "upToDate"
  // Pin review pushes to the displayed destination, including differently named upstream branches.
  const branch = expected?.tracking?.startsWith(`${remote}/`)
    ? `${expected.current}:${expected.tracking.slice(remote.length + 1)}`
    : undefined
  await git.gitPush(directory, { remote, ...(branch ? { branch } : {}) })
  return "pushed"
}
