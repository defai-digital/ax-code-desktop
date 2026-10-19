import { describe, expect, it } from "vitest"

import * as axCode from "./index.js"
import * as agents from "./agents.js"

// feature-routes-runtime reads these through `await import("./index.js")`. A name the
// barrel omits is undefined at the destructure site, so the DELETE agent route answered
// 500 with "disableBuiltinAgent is not a function" instead of writing the disable marker.
const runtimeConfigEntityExports = [
  "getAgentSources",
  "getAgentConfig",
  "createAgent",
  "updateAgent",
  "deleteAgent",
  "disableBuiltinAgent",
]

describe("ax-code index barrel", () => {
  it("exports every agent helper the config entity routes destructure", () => {
    for (const name of runtimeConfigEntityExports) {
      expect(typeof axCode[name]).toBe("function")
    }
  })

  it("re-exports the real disableBuiltinAgent implementation", () => {
    expect(axCode.disableBuiltinAgent).toBe(agents.disableBuiltinAgent)
  })
})
