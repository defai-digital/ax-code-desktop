import { createRequire } from "node:module"
import { describe, expect, test } from "vitest"

const require = createRequire(import.meta.url)
const {
  compareDesktopTagVersions,
  desktopUpdateFeedUrl,
  latestDesktopReleaseTag,
  resolveDesktopUpdateFeed,
} = require("./desktop-update-feed.js")

const desktopRelease = (version, flags = {}) => ({
  tag_name: `v${version}`,
  draft: false,
  prerelease: false,
  ...flags,
})
const cliRelease = (version) => ({ tag_name: `desktop-v${version}`, draft: false, prerelease: false })

describe("latestDesktopReleaseTag", () => {
  test("picks the highest desktop version from a mixed channel list", () => {
    // The updater must skip CLI releases even when they are newer than every
    // desktop release.
    expect(latestDesktopReleaseTag([cliRelease("7.9.14"), desktopRelease("7.9.12"), desktopRelease("7.9.11")])).toBe(
      "v7.9.12",
    )
  })

  test("ranks by semver, not list position (the API interleaves out of order)", () => {
    // Mirrors the live repository: v7.9.9 was listed before the newer
    // v7.9.12/11/10 releases, and 7.9.10 must outrank 7.9.9 (numeric,
    // not lexical).
    expect(
      latestDesktopReleaseTag([
        cliRelease("7.9.14"),
        cliRelease("7.9.9"),
        desktopRelease("7.9.9"),
        desktopRelease("7.9.12"),
        desktopRelease("7.9.11"),
        desktopRelease("7.9.10"),
      ]),
    ).toBe("v7.9.12")
  })

  test("skips draft and prerelease desktop releases", () => {
    expect(
      latestDesktopReleaseTag([
        desktopRelease("7.9.14", { draft: true }),
        desktopRelease("7.9.13", { prerelease: true }),
        desktopRelease("7.9.12"),
      ]),
    ).toBe("v7.9.12")
  })

  test("a stable release outranks a higher-versioned prerelease tag", () => {
    expect(latestDesktopReleaseTag([desktopRelease("8.0.0-beta.1"), desktopRelease("7.9.12")])).toBe("v7.9.12")
    expect(latestDesktopReleaseTag([desktopRelease("7.10.0-beta.1"), desktopRelease("7.10.0")])).toBe("v7.10.0")
  })

  test("returns null when no desktop release is published", () => {
    expect(latestDesktopReleaseTag([cliRelease("7.9.14")])).toBeNull()
    expect(latestDesktopReleaseTag([])).toBeNull()
    expect(latestDesktopReleaseTag(null)).toBeNull()
    expect(latestDesktopReleaseTag("not-an-array")).toBeNull()
  })

  test("ignores malformed entries", () => {
    expect(
      latestDesktopReleaseTag([null, "v9.9.9", { tag_name: 42 }, { tag_name: "vx.y.z" }, desktopRelease("7.9.12")]),
    ).toBe("v7.9.12")
  })
})

describe("compareDesktopTagVersions", () => {
  const parse = (version) => {
    const [core, pre] = version.split("-")
    const [major, minor, patch] = core.split(".").map(Number)
    return { major, minor, patch, prerelease: pre ? pre.split(".") : [] }
  }

  test("orders numeric segments numerically", () => {
    expect(compareDesktopTagVersions(parse("7.9.10"), parse("7.9.9"))).toBeGreaterThan(0)
    expect(compareDesktopTagVersions(parse("7.9.9"), parse("7.9.9"))).toBe(0)
    expect(compareDesktopTagVersions(parse("7.10.0"), parse("7.9.14"))).toBeGreaterThan(0)
  })

  test("orders prereleases below their release and numerically within", () => {
    expect(compareDesktopTagVersions(parse("8.0.0-beta.1"), parse("8.0.0"))).toBeLessThan(0)
    expect(compareDesktopTagVersions(parse("8.0.0-beta.2"), parse("8.0.0-beta.1"))).toBeGreaterThan(0)
    expect(compareDesktopTagVersions(parse("8.0.0-alpha.1"), parse("8.0.0-beta.1"))).toBeLessThan(0)
    expect(compareDesktopTagVersions(parse("8.0.0-beta.1"), parse("8.0.0-beta.1.1"))).toBeLessThan(0)
  })
})

describe("desktopUpdateFeedUrl", () => {
  test("points at the release asset download base", () => {
    expect(desktopUpdateFeedUrl("v7.9.12")).toBe(
      "https://github.com/defai-digital/ax-code-desktop/releases/download/v7.9.12",
    )
  })
})

describe("resolveDesktopUpdateFeed", () => {
  const jsonResponse = (body, { ok = true, status = 200 } = {}) => ({
    ok,
    status,
    json: async () => body,
  })

  test("resolves the generic feed URL for the newest published desktop release", async () => {
    const feed = await resolveDesktopUpdateFeed({
      fetchImpl: async (url, init) => {
        expect(url).toBe("https://api.github.com/repos/defai-digital/ax-code-desktop/releases?per_page=100")
        expect(init.headers["User-Agent"]).toBe("ax-code-desktop-updater")
        return jsonResponse([cliRelease("7.9.14"), desktopRelease("7.9.14", { draft: true }), desktopRelease("7.9.12")])
      },
    })
    expect(feed).toEqual({
      tag: "v7.9.12",
      url: "https://github.com/defai-digital/ax-code-desktop/releases/download/v7.9.12",
    })
  })

  test("pages past a page full of CLI-only releases", async () => {
    const urls = []
    const feed = await resolveDesktopUpdateFeed({
      fetchImpl: async (url) => {
        urls.push(url)
        // A full page means there may be more; the desktop release is on the next one.
        return urls.length === 1
          ? jsonResponse(Array.from({ length: 100 }, (_, index) => cliRelease(`7.9.${index}`)))
          : jsonResponse([desktopRelease("7.9.12")])
      },
    })
    expect(feed.tag).toBe("v7.9.12")
    expect(urls).toHaveLength(2)
    expect(urls[1]).toContain("page=2")
  })

  test("keeps the first page's answer when a later page fails", async () => {
    let calls = 0
    const releases = Array.from({ length: 99 }, (_, index) => cliRelease(`7.9.${index}`))
    releases.push(desktopRelease("7.9.12"))
    const feed = await resolveDesktopUpdateFeed({
      fetchImpl: async () => {
        calls += 1
        if (calls === 1) return jsonResponse(releases)
        throw new Error("network down")
      },
    })
    expect(feed.tag).toBe("v7.9.12")
    expect(calls).toBe(2)
  })

  test("still prefers a higher desktop version found on a later page", async () => {
    const fullPage = Array.from({ length: 99 }, (_, index) => cliRelease(`7.9.${index}`))
    fullPage.push(desktopRelease("7.9.12"))
    let calls = 0
    const feed = await resolveDesktopUpdateFeed({
      fetchImpl: async () => {
        calls += 1
        // Creation order put a hotfix cut from an older commit below a newer tag.
        return calls === 1 ? jsonResponse(fullPage) : jsonResponse([desktopRelease("7.9.13")])
      },
    })
    expect(feed.tag).toBe("v7.9.13")
  })

  test("fails loudly when the releases API errors", async () => {
    await expect(
      resolveDesktopUpdateFeed({ fetchImpl: async () => jsonResponse([], { ok: false, status: 403 }) }),
    ).rejects.toThrow("HTTP 403")
  })

  test("fails loudly when no desktop release exists", async () => {
    await expect(
      resolveDesktopUpdateFeed({ fetchImpl: async () => jsonResponse([cliRelease("7.9.14")]) }),
    ).rejects.toThrow("No published AX Code Desktop release")
  })
})
