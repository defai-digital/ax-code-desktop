import { describe, expect, it } from "vitest"

import { parseServeCliOptions } from "./cli-options.js"

describe("parseServeCliOptions", () => {
  it("parses port and trims non-empty host values", () => {
    expect(
      parseServeCliOptions({
        argv: ["--port", "4123", "--host= 127.0.0.1 "],
        defaultPort: 3902,
      }),
    ).toMatchObject({
      port: 4123,
      host: "127.0.0.1",
    })
  })

  it("parses the documented -p port shorthand", () => {
    expect(
      parseServeCliOptions({
        argv: ["-p", "4123"],
        defaultPort: 3902,
      }).port,
    ).toBe(4123)
  })

  it("falls back to default port for invalid port values", () => {
    expect(
      parseServeCliOptions({
        argv: ["--port", "not-a-port"],
        defaultPort: 3902,
      }).port,
    ).toBe(3902)
  })

  it("preserves explicit ui password values", () => {
    expect(
      parseServeCliOptions({
        argv: ["--ui-password", "  keep spaces  "],
        env: { AX_CODE_DESKTOP_UI_PASSWORD: "from-env" },
        defaultPort: 3902,
      }).uiPassword,
    ).toBe("  keep spaces  ")
  })

  it("refuses a --ui-password without a value instead of turning authentication off", () => {
    // "" is the "no UI password" sentinel, so a missing operand disabled authentication and overwrote the
    // password seeded from the environment: the server came up unauthenticated with the flag present.
    for (const argv of [["--ui-password"], ["--ui-password="], ["--ui-password", "--port", "3902"]]) {
      expect(() =>
        parseServeCliOptions({
          argv,
          env: { AX_CODE_DESKTOP_UI_PASSWORD: "from-env" },
          defaultPort: 3902,
        }),
        argv.join(" "),
      ).toThrow("--ui-password requires a value")
    }

    // The environment password still stands on its own.
    expect(
      parseServeCliOptions({ argv: [], env: { AX_CODE_DESKTOP_UI_PASSWORD: "from-env" }, defaultPort: 3902 })
        .uiPassword,
    ).toBe("from-env")
  })

  it("rejects non-loopback bind hosts", () => {
    expect(() =>
      parseServeCliOptions({
        argv: ["--host", "0.0.0.0"],
        defaultPort: 3902,
      }),
    ).toThrow("loopback")
  })
})
