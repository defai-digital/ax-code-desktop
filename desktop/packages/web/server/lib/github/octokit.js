import { Octokit } from "@octokit/rest"
import { getGitHubAuth, tagGitHubRequestError } from "./auth.js"

const GITHUB_REQUEST_TIMEOUT_MS = 15_000

/**
 * @octokit/request's fetch transport forwards only `request.signal`; `request.timeout` is
 * ignored (it was a dead option), so a hung GitHub endpoint wedged a caller's single-flight
 * refresh for minutes until undici's own body timeout. Abort the fetch ourselves; a
 * caller-provided signal is combined rather than replaced.
 */
export function applyGitHubRequestTimeout(octokit, timeoutMs = GITHUB_REQUEST_TIMEOUT_MS) {
  octokit.hook.wrap("request", async (request, options) => {
    const callerSignal = options.request?.signal
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    timer.unref?.()
    const signal = callerSignal ? AbortSignal.any([callerSignal, controller.signal]) : controller.signal
    try {
      return await request({ ...options, request: { ...options.request, signal } })
    } finally {
      clearTimeout(timer)
    }
  })
  return octokit
}

export function getOctokitOrNull() {
  const auth = getGitHubAuth()
  if (!auth?.accessToken) {
    return null
  }
  const octokit = applyGitHubRequestTimeout(new Octokit({ auth: auth.accessToken }))
  const credential = { accountId: auth.accountId, accessToken: auth.accessToken }
  octokit.hook.error("request", (error) => {
    throw tagGitHubRequestError(error, credential)
  })
  return octokit
}
