import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { expect, test } from "vitest"
import { assertHostedRunner, digest, verifyPreserved } from "./native-installer-qualification.mjs"

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
