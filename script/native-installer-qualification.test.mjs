import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { expect, test } from "vitest"
import { createRequire } from "node:module"
import { finished } from "node:stream/promises"
import {
  readInstalledVersion,
  assertHostedRunner,
  digest,
  verifyPreserved,
  writeSyntheticIfAbsent,
} from "./native-installer-qualification.mjs"

test("refuses native installation on developer or self-hosted machines", () => {
  expect(() => assertHostedRunner({}, `${process.platform}-${process.arch}`)).toThrow(/disposable/)
  expect(() =>
    assertHostedRunner(
      { GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "self-hosted" },
      `${process.platform}-${process.arch}`,
    ),
  ).toThrow(/Self-hosted/)
})
test("detects credential/profile alteration or removal rather than claiming continuity", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-continuity-test-"))
  const file = path.join(root, "auth.json")
  try {
    fs.writeFileSync(file, "synthetic-original")
    const records = [{ file, sha256: digest(file) }]
    expect(() => verifyPreserved(records)).not.toThrow()
    fs.writeFileSync(file, "synthetic-replacement")
    expect(() => verifyPreserved(records)).toThrow(/changed profile/)
    fs.unlinkSync(file)
    expect(() => verifyPreserved(records)).toThrow()
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
test("writes a missing qualification file and leaves an existing file unchanged", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-synthetic-file-"))
  const file = path.join(root, "auth.json")
  try {
    writeSyntheticIfAbsent(file, "synthetic-first")
    expect(fs.readFileSync(file, "utf8")).toBe("synthetic-first")
    writeSyntheticIfAbsent(file, "synthetic-second")
    expect(fs.readFileSync(file, "utf8")).toBe("synthetic-first")
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})


test("reads replaced installer archives without retaining the previous ASAR header", async () => {
  const require = createRequire(new URL("../desktop/packages/electron/package.json", import.meta.url))
  const asar = require("@electron/asar")
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-replaced-asar-"))
  const archive = path.join(root, "app.asar")
  try {
    for (const [version, size] of [["7.24.5", 1024], ["7.10.2", 2048], ["7.24.5", 1024]]) {
      const source = path.join(root, `source-${size}`)
      fs.mkdirSync(source, { recursive: true })
      fs.writeFileSync(path.join(source, "aaa.bin"), Buffer.alloc(size))
      fs.writeFileSync(path.join(source, "package.json"), JSON.stringify({ version }))
      await finished(await asar.createPackage(source, archive))
      expect(readInstalledVersion(archive)).toBe(version)
    }
  } finally {
    asar.uncache(archive)
    fs.rmSync(root, { recursive: true, force: true })
  }
})
