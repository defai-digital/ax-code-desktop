import path from "node:path"
import { fileURLToPath } from "node:url"

export function assertShadowAccess({ confirmed, visibility, signingMode }) {
  if (String(confirmed) !== "true") throw new Error("Confirm that this shadow run must not publish an official release")
  if (!["private", "public"].includes(visibility)) throw new Error("Repository visibility must be known")
  if (!["unsigned", "required"].includes(signingMode)) throw new Error("Unsupported shadow signing mode")
  if (visibility === "public" && signingMode !== "required")
    throw new Error("Public repositories require signed shadow mode; unsigned candidates must stay private")
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assertShadowAccess({
      confirmed: process.env.CONFIRM_SHADOW_ONLY,
      visibility: process.env.REPOSITORY_VISIBILITY,
      signingMode: process.env.SIGNING_MODE,
    })
    console.log("Shadow access policy passed; official publication remains disabled")
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
