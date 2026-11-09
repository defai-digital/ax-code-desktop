// The GitHub caches are keyed by repo or directory, not by account, and are cleared when the active account
// changes. A request that was already waiting on GitHub when the clear ran still finished afterwards and wrote
// the previous account's answer back into the cleared cache. Writers capture the epoch before they call GitHub
// and drop their result if it moved.
let epoch = 0

export const getGitHubAccountCacheEpoch = () => epoch

export const advanceGitHubAccountCacheEpoch = () => {
  epoch += 1
}
