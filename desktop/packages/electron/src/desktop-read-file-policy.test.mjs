import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { describe, expect, test } from "vitest"

const require = createRequire(import.meta.url)
const { assertDesktopReadFileAllowed, isInsideOrSameDirectory } = require("./desktop-read-file-policy.js")

describe("desktop read file policy", () => {
  test("allows Windows home paths that differ only by drive-letter or segment case", () => {
    expect(() =>
      assertDesktopReadFileAllowed("c:\\users\\alice\\project\\README.md", {
        home: "C:\\Users\\Alice",
        tmp: "C:\\Users\\Alice\\AppData\\Local\\Temp",
        pathTools: path.win32,
      }),
    ).not.toThrow()
  })

  test("rejects Windows sibling paths outside the home allowlist", () => {
    expect(() =>
      assertDesktopReadFileAllowed("C:\\Users\\Alice2\\project\\README.md", {
        home: "C:\\Users\\Alice",
        tmp: "C:\\Users\\Alice\\AppData\\Local\\Temp",
        pathTools: path.win32,
      }),
    ).toThrow("File is outside the allowed workspace")
  })

  test("keeps denying secret directories after path normalization", () => {
    expect(() =>
      assertDesktopReadFileAllowed("C:\\Users\\Alice\\.ssh\\id_rsa", {
        home: "C:\\Users\\Alice",
        tmp: "C:\\Users\\Alice\\AppData\\Local\\Temp",
        pathTools: path.win32,
      }),
    ).toThrow("Access to this path is not allowed")
  })

  test("keeps denying secret-looking filenames outside denied directories", () => {
    expect(() =>
      assertDesktopReadFileAllowed("/Users/alice/project/private.pem", {
        home: "/Users/alice",
        tmp: "/tmp",
        pathTools: path.posix,
      }),
    ).toThrow("Access to this path is not allowed")
  })

  test("denies credential stores and browser profiles under home", () => {
    const options = { home: "/Users/alice", tmp: "/tmp", pathTools: path.posix }
    for (const target of [
      "/Users/alice/.netrc",
      "/Users/alice/.npmrc",
      "/Users/alice/.git-credentials",
      "/Users/alice/.config/git/credentials",
      "/Users/alice/.docker/config.json",
      "/Users/alice/.kube/config",
      "/Users/alice/.config/gh/hosts.yml",
      // The app's own stores: the loopback session signing secret, and the
      // runtime's provider credentials, MCP credentials and install secret.
      "/Users/alice/.config/openchamber/jwt-secret",
      "/Users/alice/.config/ax-code/ax-code.jsonc",
      "/Users/alice/.local/share/ax-code/auth.json",
      "/Users/alice/.local/share/ax-code/mcp-auth.json",
      "/Users/alice/.local/share/ax-code/.install-secret",
      "/Users/alice/Library/Application Support/Google/Chrome/Default/Cookies",
      // Same class of plaintext or keychain credential store: git tokens, the
      // macOS Keychain, Firefox profiles and the GNOME keyring.
      "/Users/alice/Library/Keychains/login.keychain-db",
      "/Users/alice/Library/Application Support/Firefox/Profiles/abc/logins.json",
      "/Users/alice/.mozilla/firefox/abc/key4.db",
      "/Users/alice/.local/share/keyrings/login.keyring",
    ]) {
      expect(() => assertDesktopReadFileAllowed(target, options)).toThrow("Access to this path is not allowed")
    }
  })

  test("still allows ordinary files next to the denied stores", () => {
    const options = { home: "/Users/alice", tmp: "/tmp", pathTools: path.posix }
    for (const target of [
      "/Users/alice/project/README.md",
      "/Users/alice/.gitconfig",
      "/Users/alice/.config/git/config",
      "/Users/alice/Library/Preferences/com.apple.dock.plist",
      // Only the stores themselves are denied, not paths that share a prefix
      // with the segment name.
      "/Users/alice/.local/share/ax-code-old/notes.md",
      "/Users/alice/.config/openchamber-notes/todo.md",
    ]) {
      expect(() => assertDesktopReadFileAllowed(target, options)).not.toThrow()
    }
  })

  test("allows temp files outside home", () => {
    expect(() =>
      assertDesktopReadFileAllowed("/tmp/ax-code/screenshot.png", {
        home: "/Users/alice",
        tmp: "/tmp",
        pathTools: path.posix,
      }),
    ).not.toThrow()
  })

  test("allows a realpath-resolved file under the default temp directory", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-read-policy-"))
    const file = path.join(dir, "screenshot.png")
    fs.writeFileSync(file, "data")
    try {
      expect(() => assertDesktopReadFileAllowed(fs.realpathSync(file))).not.toThrow()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test("treats a sibling prefix as outside", () => {
    expect(isInsideOrSameDirectory("/tmp/project", "/tmp/project-copy/file.txt", path.posix)).toBe(false)
  })
})
