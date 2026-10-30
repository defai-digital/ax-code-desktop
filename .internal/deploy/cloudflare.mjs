#!/usr/bin/env node
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { qualifiedDirectory, releaseObjects, verifyReleaseObjects } from "./distribution.mjs"

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
  let publicEnabled = false
  if (route) {
    const settings = await api(`/accounts/${ACCOUNT}/workers/scripts/ax-code-desktop-downloads/settings`)
    const binding = settings.bindings.find((item) => item.name === "PUBLIC_RELEASE_ENABLED")
    requireCondition(
      binding?.type === "plain_text" && ["false", "true"].includes(binding.text),
      "Unexpected gateway publication binding",
    )
    publicEnabled = binding.text === "true"
  }
  return { route, domain, publicEnabled, bucket: buckets.buckets.some((item) => item.name === BUCKET) }
}

export async function checkPublic(publicEnabled = false, fetcher = fetch) {
  const response = await fetcher("https://download.automatosx.com/ax-code-desktop/install", {
    signal: AbortSignal.timeout(30000),
  })
  const body = await response.text()
  requireCondition(
    publicEnabled
      ? response.status === 200 && body.length > 100
      : response.status === 503 && body.includes("Desktop public release is not enabled"),
    "Desktop gateway does not match its configured publication state",
  )
  const cli = await fetcher("https://download.automatosx.com/ax-code/install", {
    signal: AbortSignal.timeout(30000),
  })
  requireCondition(cli.ok && (await cli.text()).length > 100, "Existing AX Code installer is unavailable")
}

export async function cutover(source, qualificationFile) {
  // All signatures, four platforms and five gates must pass before credentials/network.
  const inventory = qualifiedDirectory(source, qualificationFile)
  const objects = releaseObjects(source, inventory)
  const config = validateConfig(
    JSON.parse(fs.readFileSync(path.join(directory, "download-worker/wrangler.jsonc"), "utf8")),
  )
  const worker = fs.readFileSync(path.join(directory, "download-worker/worker.mjs"))
  const secret = token()
  const options = { account: ACCOUNT, token: secret }
  const api = client(secret)
  const before = await inspect(api)
  requireCondition(before.route && before.bucket, "Desktop route and bucket must exist before cutover")
  await activateVerifiedGateway({ config, worker, objects, before, options, readState: () => inspect(api) })
  console.log(`Desktop ${inventory.version} enabled; all anonymous release bytes verified.`)
}

export async function activateVerifiedGateway({
  config,
  worker,
  objects,
  before,
  options,
  readState,
  deploy = runWrangler,
  check = () => checkPublic(true),
}) {
  validateConfig(config)
  await verifyReleaseObjects(objects, options)
  try {
    deploy({ ...config, vars: { ...config.vars, PUBLIC_RELEASE_ENABLED: "true" } }, worker, false)
    const after = await readState()
    requireCondition(
      after.domain.id === before.domain.id && after.domain.service === before.domain.service,
      "AX Code custom domain changed",
    )
    requireCondition(after.publicEnabled, "Desktop gateway enablement did not take effect")
    await verifyReleaseObjects(objects, { fetcher: options.publicFetcher ?? fetch }, true)
    await check()
  } catch (error) {
    // Restore the disabled gateway if activation or anonymous byte proof fails.
    try {
      deploy(config, worker, false)
    } catch {
      throw new Error("Cutover failed and gateway disable failed; restore PUBLIC_RELEASE_ENABLED=false immediately")
    }
    throw error
  }
}

export async function main(args) {
  const [command, ...flags] = args
  if (command === "gateway-cutover") {
    requireCondition(
      flags.length === 4 && flags[0] === "--source" && flags[2] === "--qualification",
      "Expected gateway-cutover --source DIR --qualification SIGNED_JSON",
    )
    await cutover(path.resolve(flags[1]), path.resolve(flags[3]))
    return
  }
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
    requireCondition(
      !before.publicEnabled,
      "Public gateway is active; refusing to disable it through infrastructure deployment",
    )
    if (!before.bucket) await api(`/accounts/${ACCOUNT}/r2/buckets`, "POST", { name: BUCKET })
    runWrangler(config, worker, false)
  }
  const after = await inspect(api)
  requireCondition(after.route && after.bucket, "Desktop gateway route or bucket is missing")
  requireCondition(
    after.domain.id === before.domain.id && after.domain.service === before.domain.service,
    "AX Code custom domain changed during deployment",
  )
  await checkPublic(after.publicEnabled)
  console.log(
    JSON.stringify(
      {
        worker: config.name,
        route: ROUTE,
        bucket: BUCKET,
        publicReleaseEnabled: after.publicEnabled,
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
