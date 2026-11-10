type GitHubUser = {
  login: string
  id?: number
  avatarUrl?: string
  name?: string
  email?: string
}

export type DeviceFlowCompleteResponse =
  | { connected: true; user: GitHubUser; scope?: string }
  | { connected: false; status?: string; error?: string }

type GitHubDeviceFlowPollResult =
  | { status: "connected"; result: Extract<DeviceFlowCompleteResponse, { connected: true }> }
  | { status: "slow-down" }
  | { status: "authorization-failed"; error?: string }
  | { status: "pending" }
  | { status: "stale" }
  | { status: "failed"; error: unknown }

export const pollCurrentGitHubDeviceFlow = async ({
  deviceCode,
  pollOnce,
  isCurrent,
}: {
  deviceCode: string
  pollOnce: (deviceCode: string) => Promise<DeviceFlowCompleteResponse>
  isCurrent: () => boolean
}): Promise<GitHubDeviceFlowPollResult> => {
  try {
    const result = await pollOnce(deviceCode)
    if (!isCurrent()) {
      return { status: "stale" }
    }

    if (result.connected) {
      return { status: "connected", result }
    }

    if (result.status === "slow_down") {
      return { status: "slow-down" }
    }

    // Only authorization_pending (or no status at all) means "keep waiting". GitHub's other codes -
    // incorrect_device_code, device_flow_disabled, unsupported_grant_type, incorrect_client_credentials - never
    // clear on a retry, and reading them as pending left the dialog polling until the code expired.
    if (result.status && result.status !== "authorization_pending") {
      return { status: "authorization-failed", error: result.error }
    }

    return { status: "pending" }
  } catch (error) {
    if (!isCurrent()) {
      return { status: "stale" }
    }
    return { status: "failed", error }
  }
}
