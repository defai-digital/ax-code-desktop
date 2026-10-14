import { describe, expect, it, vi } from "vitest"

const OctokitMock = vi.fn()
vi.mock("@octokit/rest", () => ({ Octokit: OctokitMock }))
vi.mock("./auth.js", () => ({ getGitHubAuth: vi.fn(() => ({ accessToken: "tok-1" })) }))

const { getOctokitOrNull } = await import("./octokit.js")

describe("getOctokitOrNull", () => {
  it("bounds every upstream call with a request timeout", () => {
    // A hung GitHub endpoint used to wedge the caller's single-flight refresh forever.
    getOctokitOrNull()
    expect(OctokitMock).toHaveBeenCalledWith({
      auth: "tok-1",
      request: { timeout: 15_000 },
    })
  })
})
