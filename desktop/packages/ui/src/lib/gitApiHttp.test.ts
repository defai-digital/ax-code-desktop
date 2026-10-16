import { describe, expect, test } from "vitest"
import {
  checkIsGitRepository,
  getGitStatus,
  pruneExpiredCacheEntries,
  stageGitFile,
  stageGitFiles,
  stageGitHunk,
  unstageGitFile,
  unstageGitFiles,
  unstageGitHunk,
} from "./gitApiHttp"

type GitApiHttpFetchCall = {
  input: RequestInfo | URL
  init?: RequestInit
}

const previousFetch = globalThis.fetch
const previousWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window")

const installFetchMock = () => {
  const calls: GitApiHttpFetchCall[] = []
  globalThis.fetch = (async (input, init) => {
    calls.push({ input, init })
    return new Response(JSON.stringify({ success: true, isGitRepository: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }) as typeof fetch
  return calls
}

const installWindowMock = () => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { origin: "http://localhost:3000" },
    },
  })
}

const restoreMocks = () => {
  globalThis.fetch = previousFetch
  if (previousWindowDescriptor) {
    Object.defineProperty(globalThis, "window", previousWindowDescriptor)
  } else {
    delete (globalThis as { window?: Window }).window
  }
}

const captureError = async (callback: () => Promise<void>): Promise<unknown> => {
  try {
    await callback()
    return null
  } catch (error) {
    return error
  }
}

describe("gitApiHttp index mutations", () => {
  test("dedupes git repository checks across Windows directory variants", async () => {
    installWindowMock()
    const calls = installFetchMock()
    try {
      expect(await checkIsGitRepository("c:\\Repo\\")).toBe(true)
      expect(await checkIsGitRepository("C:/Repo")).toBe(true)

      expect(calls).toHaveLength(1)
      expect(String(calls[0].input)).toBe("http://localhost:3000/api/git/check?directory=c%3A%5CRepo%5C")
    } finally {
      restoreMocks()
    }
  })

  test("sends bulk stage payloads as paths", async () => {
    installWindowMock()
    const calls = installFetchMock()
    try {
      await stageGitFiles("/repo", [" a.ts ", "", "b.ts"])

      expect(calls).toHaveLength(1)
      expect(String(calls[0].input)).toBe("http://localhost:3000/api/git/stage?directory=%2Frepo")
      expect(calls[0].init?.method).toBe("POST")
      expect(JSON.parse(String(calls[0].init?.body))).toEqual({ paths: ["a.ts", "b.ts"] })
    } finally {
      restoreMocks()
    }
  })

  test("sends bulk unstage payloads as paths", async () => {
    installWindowMock()
    const calls = installFetchMock()
    try {
      await unstageGitFiles("/repo", [" a.ts ", "  ", "b.ts"])

      expect(calls).toHaveLength(1)
      expect(String(calls[0].input)).toBe("http://localhost:3000/api/git/unstage?directory=%2Frepo")
      expect(calls[0].init?.method).toBe("POST")
      expect(JSON.parse(String(calls[0].init?.body))).toEqual({ paths: ["a.ts", "b.ts"] })
    } finally {
      restoreMocks()
    }
  })

  test("single-file helpers use the bulk paths payload shape", async () => {
    installWindowMock()
    const calls = installFetchMock()
    try {
      await stageGitFile("/repo", "a.ts")
      await unstageGitFile("/repo", "b.ts")

      expect(JSON.parse(String(calls[0].init?.body))).toEqual({ paths: ["a.ts"] })
      expect(JSON.parse(String(calls[1].init?.body))).toEqual({ paths: ["b.ts"] })
    } finally {
      restoreMocks()
    }
  })

  test("sends single-hunk patches to the stage-hunk and unstage-hunk routes", async () => {
    installWindowMock()
    const calls = installFetchMock()
    const patch = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,1 @@\n-a\n+b\n"
    try {
      await stageGitHunk("/repo", "a.ts", patch)
      await unstageGitHunk("/repo", "a.ts", patch)

      expect(String(calls[0].input)).toBe("http://localhost:3000/api/git/stage-hunk?directory=%2Frepo")
      expect(calls[0].init?.method).toBe("POST")
      expect(JSON.parse(String(calls[0].init?.body))).toEqual({ path: "a.ts", patch })
      expect(String(calls[1].input)).toBe("http://localhost:3000/api/git/unstage-hunk?directory=%2Frepo")
      expect(JSON.parse(String(calls[1].init?.body))).toEqual({ path: "a.ts", patch })
    } finally {
      restoreMocks()
    }
  })

  test("rejects empty hunk patch payloads before fetching", async () => {
    installWindowMock()
    const calls = installFetchMock()
    try {
      const stageError = await captureError(() => stageGitHunk("/repo", "a.ts", ""))
      const unstageError = await captureError(() => unstageGitHunk("/repo", "a.ts", ""))

      expect(stageError).toBeInstanceOf(Error)
      expect((stageError as Error).message).toBe("path and patch are required to stage git changes")
      expect(unstageError).toBeInstanceOf(Error)
      expect((unstageError as Error).message).toBe("path and patch are required to unstage git changes")
      expect(calls).toHaveLength(0)
    } finally {
      restoreMocks()
    }
  })

  test("rejects empty bulk path lists before fetching", async () => {
    installWindowMock()
    const calls = installFetchMock()
    try {
      const stageError = await captureError(() => stageGitFiles("/repo", [" ", ""]))
      const unstageError = await captureError(() => unstageGitFiles("/repo", []))

      expect(stageError).toBeInstanceOf(Error)
      expect((stageError as Error).message).toBe("path is required to stage git changes")
      expect(unstageError).toBeInstanceOf(Error)
      expect((unstageError as Error).message).toBe("path is required to unstage git changes")
      expect(calls).toHaveLength(0)
    } finally {
      restoreMocks()
    }
  })
})

describe("git api status cache invalidation", () => {
  test("a mutation drops the cached status the refresh would read", async () => {
    // The cache has a 1.2 s TTL and the UI refreshes right after a mutation, so the refresh used to
    // return the status from before it: the reverted file still listed as modified, and a second
    // click on the stale row acted on the wrong state.
    const statusResponse = () =>
      new Response(
        JSON.stringify({ current: "main", tracking: null, ahead: 0, behind: 0, files: [], isClean: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    let statusCalls = 0
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      if (init?.method && String(init.method).toUpperCase() !== "GET") {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (url.includes("/status")) {
        statusCalls += 1
        return statusResponse()
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }) as typeof fetch

    try {
      await getGitStatus("/repo-invalidation")
      await getGitStatus("/repo-invalidation")
      expect(statusCalls).toBe(1)

      await stageGitFiles("/repo-invalidation", ["a.ts"])
      await getGitStatus("/repo-invalidation")

      expect(statusCalls).toBe(2)
    } finally {
      restoreMocks()
    }
  })

  test("a status request that started before the mutation does not refill the cache with its answer", async () => {
    // Dropping the in-flight entry only keeps later readers from joining that request. The request
    // itself still resolved and wrote its pre-mutation payload into the cache, where the 1.2 s TTL
    // served it to the refresh the mutation had just triggered.
    const statusPayload = (isClean: boolean, files: unknown[]) =>
      new Response(JSON.stringify({ current: "main", tracking: null, ahead: 0, behind: 0, files, isClean }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    const staleFile = { path: "a.ts", status: "modified", staged: false }
    let statusCalls = 0
    let resolveSlowStatus: (response: Response) => void = () => {}
    const slowResponse = new Promise<Response>((resolve) => {
      resolveSlowStatus = resolve
    })
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      if (init?.method && String(init.method).toUpperCase() !== "GET") {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (url.includes("/status")) {
        statusCalls += 1
        if (statusCalls === 1) {
          // Started before the mutation and answers with the tree from before it.
          return slowResponse
        }
        return statusPayload(true, [])
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }) as typeof fetch

    try {
      const slow = getGitStatus("/repo-slow-status")
      await stageGitFiles("/repo-slow-status", ["a.ts"])
      resolveSlowStatus(statusPayload(false, [staleFile]))
      await slow

      const afterMutation = await getGitStatus("/repo-slow-status")

      expect(statusCalls).toBe(2)
      expect(afterMutation.files).toEqual([])
      expect(afterMutation.isClean).toBe(true)
    } finally {
      restoreMocks()
    }
  })

  test("a mutation also drops the light status a directory has cached", async () => {
    // Light mode caches under its own key, and invalidation only touched the plain one: the light
    // entry survived the mutation, and a light request in flight wrote its pre-mutation payload
    // back after it.
    const statusPayload = (isClean: boolean, files: unknown[]) =>
      new Response(JSON.stringify({ current: "main", tracking: null, ahead: 0, behind: 0, files, isClean }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    const staleFile = { path: "a.ts", status: "modified", staged: false }
    let statusCalls = 0
    let resolveSlowStatus: (response: Response) => void = () => {}
    const slowResponse = new Promise<Response>((resolve) => {
      resolveSlowStatus = resolve
    })
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      if (init?.method && String(init.method).toUpperCase() !== "GET") {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (url.includes("/status")) {
        statusCalls += 1
        if (statusCalls === 1) {
          return slowResponse
        }
        return statusPayload(true, [])
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }) as typeof fetch

    try {
      const slow = getGitStatus("/repo-slow-light", { mode: "light" })
      await stageGitFiles("/repo-slow-light", ["a.ts"])
      resolveSlowStatus(statusPayload(false, [staleFile]))
      await slow

      const afterMutation = await getGitStatus("/repo-slow-light", { mode: "light" })

      expect(statusCalls).toBe(2)
      expect(afterMutation.files).toEqual([])
      expect(afterMutation.isClean).toBe(true)
    } finally {
      restoreMocks()
    }
  })
})

describe("git api http caches", () => {
  test("drops expired entries so a directory visit does not stay cached forever", () => {
    const cache = new Map([
      ["/repo-old", { value: "old", expiresAt: 1_000 }],
      ["/repo-fresh", { value: "fresh", expiresAt: 5_000 }],
    ])

    pruneExpiredCacheEntries(cache, 2_000)

    expect(Array.from(cache.keys())).toEqual(["/repo-fresh"])
    // Entries that expire exactly at the cutoff count as expired, matching the read check.
    pruneExpiredCacheEntries(cache, 5_000)
    expect(cache.size).toBe(0)
  })
})
