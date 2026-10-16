import { describe, expect, test } from "vitest"

import { substituteCommandVariables } from "./openchamberConfig"

describe("substituteCommandVariables", () => {
  const substitute = (command: string, rootWorktreePath: string) =>
    substituteCommandVariables(command, { rootWorktreePath })

  test("replaces every spelling of the variable", () => {
    expect(substitute("cd $ROOT_PROJECT_PATH && ls", "/work/app")).toBe("cd /work/app && ls")
    expect(substitute("cd ${ROOT_PROJECT_PATH} && ls", "/work/app")).toBe("cd /work/app && ls")
    expect(substitute("cd $ROOT_WORKTREE_PATH", "/work/app")).toBe("cd /work/app")
    expect(substitute("cd ${ROOT_WORKTREE_PATH}", "/work/app")).toBe("cd /work/app")
  })

  test("keeps a path that contains dollar patterns as written", () => {
    // A string replacement parses `$` in the replacement: `$$` collapsed to `$`, and `` $` `` or
    // `$'` spliced the match and the surrounding command text into the path.
    expect(substitute("cd $ROOT_PROJECT_PATH", "/Users/me/co$$op")).toBe("cd /Users/me/co$$op")
    expect(substitute("cd $ROOT_PROJECT_PATH", "/Users/me/app$&x")).toBe("cd /Users/me/app$&x")
    expect(substitute("cd $ROOT_PROJECT_PATH", "/Users/me/app$`x")).toBe("cd /Users/me/app$`x")
  })

  test("does not substitute a path that itself looks like the variable", () => {
    expect(substitute("cd $ROOT_PROJECT_PATH", "/work/$ROOT_WORKTREE_PATH")).toBe("cd /work/$ROOT_WORKTREE_PATH")
  })
})
