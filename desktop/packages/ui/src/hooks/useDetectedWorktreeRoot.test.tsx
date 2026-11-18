import React, { act } from "react"
import { createRoot } from "react-dom/client"
import type { Root } from "react-dom/client"
import type { WorktreeMetadata } from "@/types/worktree"
import { afterEach, expect, test, vi } from "vitest"

import { execCommand } from "@/lib/execCommands"
import { useDetectedWorktreeMetadata } from "./useDetectedWorktreeRoot"

vi.mock("@/lib/execCommands", () => ({ execCommand: vi.fn() }))
let mounted: { root: Root; container: HTMLElement } | undefined
afterEach(async () => {
  if (mounted) {
    await act(async () => mounted?.root.unmount())
    mounted.container.remove()
    mounted = undefined
  }
  vi.resetAllMocks()
})
const mountProbe = async (directory: string) => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  mounted = { root, container }
  const observed: { current?: WorktreeMetadata } = {}
  function Probe(): React.ReactNode {
    observed.current = useDetectedWorktreeMetadata(directory, undefined, "topic")
    return null
  }
  await act(async () => root.render(<Probe />))
  return observed
}

test.each([
  ["C:/repo/worktree", "C:/repo/.git/worktrees/topic\r\n", "C:/repo/worktree\r\n", "C:/repo", "C:/repo/worktree"],
  ["/repo/worktree\r", "/repo/.git/worktrees/topic\n", "/repo/worktree\r\n", "/repo", "/repo/worktree\r"],
  ["/repo /worktree ", "/repo /.git/worktrees/topic\n", "/repo /worktree \n", "/repo ", "/repo /worktree "],
])("uses host path framing for detected worktree %j", async (directory, gitDir, topLevel, project, expected) => {
  vi.mocked(execCommand).mockImplementation(async (command) => ({
    command, success: true, stdout: command.endsWith("--absolute-git-dir") ? gitDir : topLevel,
  }))
  const observed = await mountProbe(directory)
  expect(observed.current).toMatchObject({ path: expected, projectDirectory: project })
})

test("a failed Git path query cannot become inferred worktree metadata", async () => {
  vi.mocked(execCommand).mockResolvedValue({ command: "git", success: false, stdout: "/repo/.git/worktrees/topic\n" })
  const observed = await mountProbe("/repo/worktree")
  expect(execCommand).toHaveBeenCalledTimes(2)
  expect(observed.current).toBeUndefined()
})
