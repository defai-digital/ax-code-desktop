import { compareAxCodeVersions, parseAxCodeVersion } from "../../../../../shared/ax-code-version.mjs"

/**
 * Compatibility gate between this app and the installed ax-code runtime.
 *
 * The desktop consumes an exact published SDK version, but the ax-code CLI on the
 * user's machine can update independently. This module defines the oldest
 * runtime the app is known to work with and evaluates the version reported by
 * the runtime's /global/health endpoint against it.
 *
 * Bump MIN_SUPPORTED_AX_CODE_VERSION whenever the app starts depending on a
 * newer server API.
 */

// v6.8.0 added the ax-engine local-model routes (/provider/ax-engine/*) the
// Models tab depends on. Without them, older runtimes return a bare 404 that
// surfaces as a cryptic "Provider request failed (404)" instead of the
// incompatible-runtime warning. Earlier baseline was v5.11.1 (server fixes for
// config PATCH, command handling, and route validation this app relies on).
export const MIN_SUPPORTED_AX_CODE_VERSION = "6.8.0"

/** Report unknown compatibility when the runtime version cannot be compared. */
export const evaluateAxCodeCompatibility = (rawVersion, minSupportedVersion = MIN_SUPPORTED_AX_CODE_VERSION) => {
  const parsed = parseAxCodeVersion(rawVersion)
  const version = parsed?.version.split("+")[0] ?? null
  const order = compareAxCodeVersions(version, minSupportedVersion)
  return {
    version,
    minSupportedVersion,
    compatible: order === null ? null : order >= 0,
  }
}
