#!/usr/bin/env node
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

export const ACCOUNT = "89657c08227b638ab67905e1c5899406"
export const ZONE = "d5743ccd847daa9482a61511cc347065"
export const ROUTE = "download.automatosx.com/ax-code-desktop/*"
export const BUCKET = "ax-code-desktop-releases"
const directory = path.dirname(fileURLToPath(import.meta.url))
const requireCondition = (value, message) => {
  if (!value) throw new Error(message)
}

export function validateConfig(config) {
  requireCondition(config.name === "ax-code-desktop-downloads", "Unexpected Worker name")
  requireCondition(!config.account_id || config.account_id === ACCOUNT, "Unexpected Cloudflare account")
  requireCondition(
    config.main === "worker.mjs" && config.workers_dev === false,
    "Unexpected Worker entry or public alias",
  )
  requireCondition(
    config.vars?.PUBLIC_RELEASE_ENABLED === "false",
    "Gateway deployment must keep public release disabled; use the separate reviewed cutover",
  )
  requireCondition(
    config.routes?.length === 1 &&
      config.routes[0].pattern === ROUTE &&
      config.routes[0].zone_name === "automatosx.com" &&
      !config.routes[0].custom_domain,
    "Unexpected gateway route",
  )
  requireCondition(
    config.r2_buckets?.length === 1 &&
      config.r2_buckets[0].binding === "DESKTOP_RELEASES" &&
      config.r2_buckets[0].bucket_name === BUCKET,
    "Unexpected R2 binding",
  )
  requireCondition(
    Object.keys(config).every((key) =>
      ["name", "account_id", "main", "compatibility_date", "workers_dev", "routes", "vars", "r2_buckets"].includes(key),
    ),
    "Unexpected Worker configuration field",
  )
  return { ...config, account_id: ACCOUNT }
}

export function assertRouteOwnership(routes) {
  const matches = routes.filter((route) => route.pattern === ROUTE)
  requireCondition(
    matches.length <= 1 && matches.every((route) => route.script === "ax-code-desktop-downloads"),
    "Desktop route belongs to another Worker; refusing takeover",
  )
  return matches[0]
}

function token() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN
  const candidates = [
    path.join(os.homedir(), "Library/Preferences/.wrangler/config/default.toml"),
    path.join(os.homedir(), ".config/.wrangler/config/default.toml"),
  ]
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue
    const match = fs.readFileSync(file, "utf8").match(/^oauth_token\s*=\s*"([^"\r\n]+)"\s*$/m)
    if (match) return match[1]
  }
  throw new Error("Set CLOUDFLARE_API_TOKEN or authenticate with wrangler login")
}

function client(secret) {
  return async (endpoint, method = "GET", body) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4${endpoint}`, {
      method,
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    })
    const result = await response.json()
    requireCondition(
      response.ok && result.success,
      `Cloudflare API ${method} ${endpoint} failed (HTTP ${response.status}); check credentials and permissions`,
    )
    return result.result
  }
}

async function inspect(api) {
  const zone = await api(`/zones/${ZONE}`)
  requireCondition(zone.name === "automatosx.com" && zone.account.id === ACCOUNT, "Zone/account identity mismatch")
  const route = assertRouteOwnership(await api(`/zones/${ZONE}/workers/routes`))
  const domains = await api(`/accounts/${ACCOUNT}/workers/domains`)
  const domain = domains.find((item) => item.hostname === "download.automatosx.com")
  requireCondition(domain?.service === "ax-code-downloads", "Existing AX Code download custom domain changed")
  const buckets = await api(`/accounts/${ACCOUNT}/r2/buckets`)
  return { route, domain, bucket: buckets.buckets.some((item) => item.name === BUCKET) }
}

async function checkPublic() {
  const response = await fetch("https://download.automatosx.com/ax-code-desktop/install", {
    signal: AbortSignal.timeout(30000),
  })
  requireCondition(
    response.status === 503 && (await response.text()).includes("Desktop public release is not enabled"),
    "Desktop gateway does not report the expected disabled-publication state",
  )
  const cli = await fetch("https://download.automatosx.com/ax-code/releases/download/v7.24.4/install", {
    signal: AbortSignal.timeout(30000),
  })
  requireCondition(cli.ok && (await cli.text()).length > 100, "Existing AX Code installer is unavailable")
}

export async function main(args) {
  const [command, ...flags] = args
  requireCondition(["gateway-check", "gateway-deploy"].includes(command), "Expected gateway-check or gateway-deploy")
  requireCondition(
    flags.length === 0 || (command === "gateway-deploy" && flags.length === 1 && flags[0] === "--dry-run"),
    "Unexpected gateway arguments",
  )
  const config = validateConfig(
    JSON.parse(fs.readFileSync(path.join(directory, "download-worker/wrangler.jsonc"), "utf8")),
  )
  // Deploy the reviewed bytes, isolated from concurrent changes to the checkout.
  const worker = fs.readFileSync(path.join(directory, "download-worker/worker.mjs"))
  if (flags[0] === "--dry-run") {
    runWrangler(config, worker, true)
    return
  }
  const api = client(token())
  const before = await inspect(api)
  if (command === "gateway-deploy") {
    if (!before.bucket) await api(`/accounts/${ACCOUNT}/r2/buckets`, "POST", { name: BUCKET })
    runWrangler(config, worker, false)
  }
  const after = await inspect(api)
  requireCondition(after.route && after.bucket, "Desktop gateway route or bucket is missing")
  requireCondition(
    after.domain.id === before.domain.id && after.domain.service === before.domain.service,
    "AX Code custom domain changed during deployment",
  )
  await checkPublic()
  console.log(
    JSON.stringify(
      {
        worker: config.name,
        route: ROUTE,
        bucket: BUCKET,
        publicReleaseEnabled: false,
        existingCliInstallerAvailable: true,
      },
      null,
      2,
    ),
  )
}

function runWrangler(config, worker, dryRun) {
  const snapshot = fs.mkdtempSync(path.join(os.tmpdir(), "ax-desktop-gateway-"))
  try {
    fs.writeFileSync(path.join(snapshot, "worker.mjs"), worker)
    fs.writeFileSync(path.join(snapshot, "wrangler.json"), JSON.stringify(config, null, 2))
    execFileSync(
      "wrangler",
      ["deploy", "--config", path.join(snapshot, "wrangler.json"), ...(dryRun ? ["--dry-run"] : [])],
      { stdio: "inherit", timeout: 180000, env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT } },
    )
  } finally {
    fs.rmSync(snapshot, { recursive: true, force: true })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
