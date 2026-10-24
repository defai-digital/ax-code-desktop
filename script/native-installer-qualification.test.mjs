import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, test, vi } from "vitest"
import { createRequire } from "node:module"
import { finished } from "node:stream/promises"
import { spawnSync } from "node:child_process"
import {
  readInstalledVersion,
  validateAppleTicket,
  assertHostedRunner,
  digest,
  verifyPreserved,
  writeSyntheticIfAbsent,
  capturePreservedFile,
  qualificationVersion,
  prepareCanonicalAuthFixture,
  writeSyntheticAuthFixture,
} from "./native-installer-qualification.mjs"

test("seeds a canary-only store created by an earlier GUI smoke", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-empty-auth-"))
  const file = path.join(root, "auth.json")
  try {
    fs.writeFileSync(file, '{"__canary":{"synthetic":true}}', { mode: 0o600 })
    const fixture = '{"qualification":{"type":"api","key":"synthetic-only"}}'
    writeSyntheticAuthFixture(file, fixture)
    expect(fs.readFileSync(file, "utf8")).toBe(fixture)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test("refuses to replace a preexisting credential store when preparing fixtures", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-existing-auth-"))
  const file = path.join(root, "auth.json")
  try {
    const original = '{"existing-provider":{"type":"api","key":"synthetic-existing"}}'
    fs.writeFileSync(file, original, { mode: 0o600 })
    expect(() => writeSyntheticAuthFixture(file, "{}")).toThrow(/Refusing to replace/)
    expect(fs.readFileSync(file, "utf8")).toBe(original)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test.each(["stable", "missing-provider", "rewritten"])(
  "canonical credential fixture rejects unsafe runtime reads: %s",
  (behavior) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-canonical-auth-"))
    const auth = path.join(root, "auth.json")
    const references = path.join(root, "references.json")
    let reads = 0
    try {
      fs.writeFileSync(auth, "synthetic plaintext", { mode: 0o600 })
      const prepare = () =>
        prepareCanonicalAuthFixture(root, auth, references, {
          run: (_node, args) => {
            expect(args.slice(-5)).toEqual(["providers", "auth", "export", "--output-file", references])
            reads++
            if (reads === 1 || behavior === "rewritten") fs.writeFileSync(auth, `synthetic canonical ${reads}`)
            fs.writeFileSync(
              references,
              JSON.stringify({
                providers:
                  behavior === "missing-provider" ? {} : { qualification: { type: "summary", summary: "api" } },
              }),
            )
          },
        })
      if (behavior === "stable") {
        const record = prepare()
        expect(reads).toBe(2)
        expect(record.sha256).toBe(digest(auth))
        expect(() => verifyPreserved([record])).not.toThrow()
      } else {
        expect(prepare).toThrow(behavior === "missing-provider" ? /not readable/ : /changed profile/)
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  },
)

test("refuses native installation on developer or self-hosted machines", () => {
  expect(() => assertHostedRunner({}, `${process.platform}-${process.arch}`)).toThrow(/disposable/)
  expect(() =>
    assertHostedRunner(
      { GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "self-hosted" },
      `${process.platform}-${process.arch}`,
    ),
  ).toThrow(/Self-hosted/)
})

test("resolves the candidate version independently of the caller working directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-decoy-version-"))
  try {
    fs.writeFileSync(path.join(root, "package.json"), '{"version":"0.0.1"}')
    const module = new URL("./native-installer-qualification.mjs", import.meta.url).href
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {qualificationVersion} from ${JSON.stringify(module)}; process.stdout.write(qualificationVersion())`,
      ],
      { cwd: root, encoding: "utf8" },
    )
    expect(result.status).toBe(0)
    expect(result.stdout).toBe(qualificationVersion())
    expect(result.stdout).not.toBe("0.0.1")
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test.skipIf(process.platform === "win32")(
  "rejects permission weakening and symlink replacement of preserved credentials",
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-continuity-permissions-"))
    const file = path.join(root, "auth.json")
    try {
      fs.writeFileSync(file, "synthetic", { mode: 0o600 })
      const records = [capturePreservedFile(file)]
      fs.chmodSync(file, 0o644)
      expect(() => verifyPreserved(records)).toThrow(/mode/)
      fs.chmodSync(file, 0o600)
      expect(() => verifyPreserved(records)).not.toThrow()
      const target = path.join(root, "replacement.json")
      fs.renameSync(file, target)
      fs.symlinkSync(target, file)
      expect(() => verifyPreserved(records)).toThrow(/replaced/)
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  },
)
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
    for (const [version, size] of [
      ["7.24.5", 1024],
      ["7.10.2", 2048],
      ["7.24.5", 1024],
    ]) {
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

const ticketFixtures = []
afterEach(() => {
  vi.unstubAllEnvs()
  for (const root of ticketFixtures.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

function ticketLookupFixture(failures) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apple ticket lookup "))
  ticketFixtures.push(root)
  const counter = path.join(root, "attempts.json")
  const app = path.join(root, "AX Code.app")
  fs.writeFileSync(path.join(root, "xcrun"), `#!${process.execPath}
const fs = require("node:fs")
const file = ${JSON.stringify(counter)}
const attempts = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : []
attempts.push(process.argv.slice(2))
fs.writeFileSync(file, JSON.stringify(attempts))
if (attempts.length <= ${failures}) {
  console.error("Ticket lookup connection lost")
  process.exitCode = 68
} else console.log("Ticket validated")
`, { mode: 0o755 })
  vi.stubEnv("PATH", `${root}${path.delimiter}${process.env.PATH ?? ""}`)
  vi.stubEnv("CI_RETRY_ATTEMPTS", "3")
  vi.stubEnv("CI_RETRY_DELAY_SECONDS", "0")
  return { app, attempts: () => JSON.parse(fs.readFileSync(counter, "utf8")) }
}

test.skipIf(process.platform === "win32")("ticket validation recovers lost connections without changing the app or validation arguments", () => {
  const fixture = ticketLookupFixture(2)
  expect(validateAppleTicket(fixture.app)).toBe("Ticket validated\n")
  expect(fixture.attempts()).toEqual(Array.from({ length: 3 }, () => ["stapler", "validate", fixture.app]))
})

test.skipIf(process.platform === "win32")("ticket validation fails closed when every bounded attempt fails", () => {
  const fixture = ticketLookupFixture(10)
  expect(() => validateAppleTicket(fixture.app)).toThrow()
  expect(fixture.attempts()).toHaveLength(3)
})

test.skipIf(process.platform === "win32")("ticket validation stops after the first successful attempt", () => {
  const fixture = ticketLookupFixture(0)
  expect(validateAppleTicket(fixture.app)).toBe("Ticket validated\n")
  expect(fixture.attempts()).toHaveLength(1)
})
