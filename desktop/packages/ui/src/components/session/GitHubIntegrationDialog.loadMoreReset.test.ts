import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

// The dialog needs the runtime API context and a dozen stores to render, so this contract is
// asserted against the source, as the other dialogs' effects are.
describe("GitHubIntegrationDialog load more reset", () => {
  test("clears the load-more spinner when a tab switch supersedes the request", async () => {
    const source = await readFile(path.resolve(__dirname, "GitHubIntegrationDialog.tsx"), "utf8")

    // loadMore only resets `loadingMore` while its request is still current. A tab switch
    // bumps the request id, so the superseded completion skipped the reset and the spinner
    // stayed up forever, blocking further pagination. loadData owns that transition and has
    // to clear it before it starts the replacement request.
    const start = source.indexOf("const loadData = React.useCallback(async () => {")
    const end = source.indexOf("}, [projectDirectory, github, githubAuthChecked, githubAuthStatus, activeTab, t])", start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)

    const body = source.slice(start, end)
    const loading = body.indexOf("setLoading(true)")
    const reset = body.indexOf("setLoadingMore(false)", loading)
    const firstAwait = body.indexOf("await", loading)

    expect(loading).toBeGreaterThan(-1)
    expect(reset).toBeGreaterThan(loading)
    expect(reset).toBeLessThan(firstAwait)
  })
})
