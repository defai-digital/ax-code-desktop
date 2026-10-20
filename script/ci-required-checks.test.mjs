import { describe, expect, test } from "vitest"
import { requiredCheckFailures } from "./ci-required-checks.mjs"
import { classifyChanges } from "./ci-scope.mjs"

const green = {
  CI_CHANGES: "success",
  CI_VERIFY_REQUIRED: "true",
  CI_VERIFY: "success",
  CI_NATIVE_REQUIRED: "true",
  CI_NATIVE: "success",
  CI_PACKAGED_REQUIRED: "true",
  CI_PACKAGED: "success",
}

describe("required CI results", () => {
  test.each([["README.md"], ["script/example.test.mjs"], ["desktop/packages/ui/src/App.tsx"], ["package.json"]])(
    "accepts only the jobs selected for %s",
    (file) => {
      const scope = classifyChanges([file])
      const env = { CI_CHANGES: "success" }
      for (const name of ["VERIFY", "NATIVE", "PACKAGED"]) {
        env[`CI_${name}_REQUIRED`] = String(scope[name.toLowerCase()])
        env[`CI_${name}`] = scope[name.toLowerCase()] ? "success" : "skipped"
      }
      expect(requiredCheckFailures(env)).toEqual([])
    },
  )
  for (const name of ["CHANGES", "VERIFY", "NATIVE", "PACKAGED"]) {
    test.each(["failure", "cancelled", "skipped", "", undefined])(`rejects ${name} result %s`, (status) => {
      expect(requiredCheckFailures({ ...green, [`CI_${name}`]: status }).length).toBeGreaterThan(0)
    })
  }
  test("rejects missing or malformed scope outputs", () => {
    for (const required of [undefined, "", "maybe"]) {
      expect(requiredCheckFailures({ ...green, CI_NATIVE_REQUIRED: required, CI_NATIVE: "skipped" })).not.toEqual([])
    }
  })
})
