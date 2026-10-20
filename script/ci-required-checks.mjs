import { fileURLToPath } from "node:url"
import path from "node:path"

export function requiredCheckFailures(env) {
  const failures = []
  if (env.CI_CHANGES !== "success") failures.push(`changes: ${env.CI_CHANGES || "missing"}`)
  for (const name of ["VERIFY", "NATIVE", "PACKAGED"]) {
    const required = env[`CI_${name}_REQUIRED`]
    if (!["true", "false"].includes(required)) failures.push(`${name}: invalid scope`)
    const expected = required === "true" ? "success" : "skipped"
    if (env[`CI_${name}`] !== expected)
      failures.push(`${name}: ${env[`CI_${name}`] || "missing"}; expected ${expected}`)
  }
  return failures
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = requiredCheckFailures(process.env)
  for (const failure of failures) console.error(failure)
  process.exitCode = failures.length ? 1 : 0
}
