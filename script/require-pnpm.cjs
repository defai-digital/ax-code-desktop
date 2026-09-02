"use strict"

const userAgent = process.env.npm_config_user_agent || ""
if (!userAgent.startsWith("pnpm/")) {
  console.error("AX Coder requires pnpm. Run `corepack enable` and `pnpm install`.")
  process.exit(1)
}
