import { afterEach, expect, test, vi } from "vitest"
import { contentHash53 } from "./contentHash"
import type { MagicPromptId } from "./magicPrompts"
import { API_ENDPOINTS, HTTP_DEFAULTS } from "./http"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

test("prompt rendering still reads stored legacy overrides after editor API retirement", async () => {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          overrides: {
            "git.commit.generate": "Custom visible {{branch}}\nCustom instructions {{branch}}",
          },
        }),
      ),
  )
  vi.stubGlobal("fetch", fetch)
  const { renderMagicPrompt } = await import("./magicPrompts")
  expect(await renderMagicPrompt("git.commit.generate.visible", { branch: "main" })).toBe("Custom visible main")
  expect(await renderMagicPrompt("git.commit.generate.instructions", { branch: "main" })).toBe(
    "Custom instructions main",
  )
  expect(fetch).toHaveBeenCalledExactlyOnceWith(API_ENDPOINTS.magicPrompts, {
    method: HTTP_DEFAULTS.method.get,
    headers: HTTP_DEFAULTS.headers.acceptJson,
  })
})

test("explicit split overrides win over the corresponding legacy key", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            overrides: {
              "git.commit.generate": "Legacy visible\nLegacy instructions",
              "git.commit.generate.visible": "Split visible",
            },
          }),
        ),
    ),
  )
  const { renderMagicPrompt } = await import("./magicPrompts")
  expect(await renderMagicPrompt("git.commit.generate.visible")).toBe("Split visible")
  expect(await renderMagicPrompt("git.commit.generate.instructions")).toBe("Legacy instructions")
})

test.each(["http", "network", "malformed"])(
  "unavailable %s overrides retain built-in prompt rendering",
  async (failure) => {
    const fetch = vi.fn(async () => {
      if (failure === "network") throw new Error("offline")
      return new Response(failure === "malformed" ? "null" : "{}", { status: failure === "http" ? 503 : 200 })
    })
    vi.stubGlobal("fetch", fetch)
    const { renderMagicPrompt } = await import("./magicPrompts")
    const visible = await renderMagicPrompt("git.commit.generate.visible")
    expect(visible.trim().length).toBeGreaterThan(0)
    expect(visible).not.toContain("undefined")
    expect(fetch).toHaveBeenCalledTimes(1)
  },
)

const PLACEHOLDER_NAMES = [
  "additional_context_block",
  "base_branch",
  "changed_files",
  "commits",
  "continue_cmd",
  "current_commit",
  "directory",
  "head_branch",
  "head_info",
  "head_ref",
  "issue_number",
  "operation",
  "operation_label",
  "plan_path",
  "plan_title",
  "pr_number",
  "repo_root",
  "selected_files",
  "source_branch",
  "target_branch",
  "temp_worktree_path",
  "todo_text",
  "topic_block",
  "topic_line",
]

const DEFAULT_PROMPT_DIGESTS: Record<MagicPromptId, string> = {
  "git.commit.generate.visible": "88e27efff789b",
  "git.commit.generate.instructions": "12e7ca970085ac",
  "git.pr.generate.visible": "1c87270a6d1a11",
  "git.pr.generate.instructions": "1f31ddb9116b74",
  "github.pr.review.visible": "18509d565d2758",
  "github.pr.review.instructions": "1b70ef17fb0cb6",
  "github.issue.review.visible": "4a207ef13f182",
  "github.issue.review.instructions": "15981c333df6c2",
  "github.pr.checks.review.visible": "ccbdfb988071d",
  "github.pr.checks.review.instructions": "72716355140b5",
  "github.pr.comments.review.visible": "1dc528d80d0010",
  "github.pr.comments.review.instructions": "e27ef113fcef2",
  "github.pr.comment.single.visible": "1496471f5ee582",
  "github.pr.comment.single.instructions": "1f7a6fdb2627a5",
  "git.conflict.resolve.visible": "1d48165899ffc2",
  "git.conflict.resolve.instructions": "172a71f86d98e7",
  "git.integrate.cherrypick.resolve.visible": "187880c01b7080",
  "git.integrate.cherrypick.resolve.instructions": "9b664e2ab7193",
  "plan.todo.visible": "b578a4ea38b9",
  "plan.todo.instructions": "1ca475a3485602",
  "plan.improve.visible": "1e85d1307b5b0d",
  "plan.improve.instructions": "8a5d829d5923b",
  "plan.implement.visible": "dddc3e5452ce3",
  "plan.implement.instructions": "61a48c73120",
  "session.summary.visible": "110330ec73f483",
  "session.summary.instructions": "1bfc54a7c60e2b",
  "session.review.visible": "1cd06b17667da4",
  "session.review.instructions": "1b54fb63f7fc92",
  "session.plan.visible": "12f26c276258d",
  "session.plan.instructions": "3a993717e35b",
  "session.catchup.visible": "13effc262e6e50",
  "session.catchup.instructions": "1b7d6096077ea0",
  "session.debug.visible": "1831bde95f7613",
  "session.debug.instructions": "12c25ad9c7a320",
  "session.weigh.visible": "9649f275cb545",
  "session.weigh.instructions": "153f4bd998c7cd",
  "session.explore.visible": "17ed0f895780d2",
  "session.explore.instructions": "1db080169fda82",
  "session.fusion.visible": "d32257cdb0124",
  "session.fusion.instructions": "dc5746f56f966",
}

test("every built-in prompt retains its exact template contract after editor metadata removal", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}")),
  )
  const { renderMagicPrompt } = await import("./magicPrompts")
  for (const [id, digest] of Object.entries(DEFAULT_PROMPT_DIGESTS)) {
    // Placeholder names map to their own source spelling so rendering preserves the template bytes.
    const variables = Object.fromEntries(PLACEHOLDER_NAMES.map((key) => [key, `{{${key}}}`]))
    expect(contentHash53(await renderMagicPrompt(id as MagicPromptId, variables)), id).toBe(digest)
  }
})
