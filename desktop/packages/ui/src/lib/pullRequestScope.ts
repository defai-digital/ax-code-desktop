import { getProjectPathIdentityKey } from "./projectResolution"

export interface PullRequestScope {
  directory: string
  branch: string
  remoteName: string | null
}

export const pullRequestScopeKey = ({ directory, branch, remoteName }: PullRequestScope): string =>
  JSON.stringify([getProjectPathIdentityKey(directory), branch.trim(), remoteName?.trim() || null])
