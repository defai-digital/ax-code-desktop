import { spawnSync } from "node:child_process"
import { appendFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export function resolveNotaryMode(env) {
  if (env.APPLE_TEAM_ID !== "N5ZUZDUJS6") throw new Error("Apple team does not match the frozen signing identity")
  const complete = (names) => names.every((name) => typeof env[name] === "string" && env[name].length > 0)
  const api = ["APPLE_API_KEY_B64", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"]
  const appleId = ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD"]
  const mode = complete(api) ? "api" : complete(appleId) ? "apple-id" : undefined
  if (!mode) throw new Error("Apple notarization requires a complete API key or Apple ID credential set")
  for (const name of mode === "api" ? api : appleId) {
    if (/[\r\n\0]/.test(env[name])) throw new Error(`Invalid single-line credential: ${name}`)
  }
  return mode
}

export function configureNotaryProfile(
  env,
  { run = spawnSync, write = writeFileSync, append = appendFileSync, remove = rmSync } = {},
) {
  const mode = resolveNotaryMode(env)
  if (!env.RUNNER_TEMP || !path.isAbsolute(env.RUNNER_TEMP) || !env.GITHUB_ENV || !path.isAbsolute(env.GITHUB_ENV)) {
    throw new Error("Notarization profile setup requires absolute runner paths")
  }
  const keychain = path.join(env.RUNNER_TEMP, "electron-signing.keychain-db")
  const profile = "desktop-shadow-notary"
  const keyPath = path.join(env.RUNNER_TEMP, "desktop-notary-api-key.p8")
  const args = ["notarytool", "store-credentials", profile, "--keychain", keychain]
  let input
  try {
    if (mode === "api") {
      const key = Buffer.from(env.APPLE_API_KEY_B64, "base64")
      if (!key.toString().includes("-----BEGIN PRIVATE KEY-----"))
        throw new Error("Invalid Apple API private key format")
      write(keyPath, key, { mode: 0o600 })
      args.push("--key", keyPath, "--key-id", env.APPLE_API_KEY_ID, "--issuer", env.APPLE_API_ISSUER)
    } else {
      args.push("--apple-id", env.APPLE_ID, "--team-id", env.APPLE_TEAM_ID)
      input = `${env.APPLE_APP_SPECIFIC_PASSWORD}\n`
    }
    const result = run("xcrun", args, { input, encoding: "utf8", timeout: 120_000, stdio: ["pipe", "pipe", "pipe"] })
    if (result.error || result.status !== 0) throw new Error("Apple notarization credential validation failed")
    append(env.GITHUB_ENV, `APPLE_KEYCHAIN_PROFILE=${profile}\nAPPLE_KEYCHAIN=${keychain}\n`)
    return mode
  } finally {
    if (mode === "api") remove(keyPath, { force: true })
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    console.log(
      process.argv.includes("--configure") ? configureNotaryProfile(process.env) : resolveNotaryMode(process.env),
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
