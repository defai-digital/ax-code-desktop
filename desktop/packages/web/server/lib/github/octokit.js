import { Octokit } from "@octokit/rest"
import { getGitHubAuth } from "./auth.js"

export function getOctokitOrNull() {
  const auth = getGitHubAuth()
  if (!auth?.accessToken) {
    return null
  }
  // No request timeout by default: a hung upstream would wedge the caller's refresh
  // (the PR status store's single-flight guard only clears in finally).
  return new Octokit({ auth: auth.accessToken, request: { timeout: 15_000 } })
}
