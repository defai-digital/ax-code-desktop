import { describe, expect, test } from "vitest"
import { parseStubOrigin } from "./stub-origin.mjs"

describe("stub runtime origin", () => {
  test("reconstructs only an HTTP IPv4 loopback origin with a valid port", () => {
    expect(parseStubOrigin("http://127.0.0.1:49152\n")).toBe("http://127.0.0.1:49152")
    expect(parseStubOrigin("http://127.0.0.1:00080")).toBe("http://127.0.0.1:80")
  })

  test.each([
    null, "", "http://example.com:80", "http://127.0.0.1.example.com:80", "https://127.0.0.1:80",
    "http://user@127.0.0.1:80", "http://127.0.0.1:80/path", "http://127.0.0.1:80?token=value",
    "http://127.0.0.1:80#fragment", "http://127.0.0.1:0", "http://127.0.0.1:65536",
    "http://127.0.0.1:-1", "http://127.0.0.1:1e3", "http://127.0.0.1:80\nhttp://example.com:80",
  ])("rejects an invalid or non-loopback origin: %s", (value) => {
    expect(() => parseStubOrigin(value)).toThrow("Invalid loopback stub origin")
  })
})
