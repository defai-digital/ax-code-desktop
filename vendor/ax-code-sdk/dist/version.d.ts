/**
 * SDK version and compatibility check.
 *
 * @example
 * ```ts
 * import { SDK_VERSION, isSDKVersionCompatible } from "@ax-code/sdk"
 *
 * console.log(SDK_VERSION) // "2.0.0"
 * if (!isSDKVersionCompatible("^2.0.0")) {
 *   throw new Error("This plugin requires @ax-code/sdk ^2.0.0")
 * }
 * ```
 */
/** Current SDK version. Matches the `version` field in package.json. */
export declare const SDK_VERSION = "2.0.0";
/**
 * Check whether the current SDK version satisfies a semver range.
 * Uses a simple major.minor check — does NOT pull in the full `semver`
 * package. Supports `^X.Y.Z` (caret) and `X.Y.Z` (exact) patterns.
 *
 * For full semver range evaluation (tilde, hyphen ranges, pre-release
 * tags), use the `semver` package directly against `SDK_VERSION`.
 */
export declare function isSDKVersionCompatible(required: string): boolean;
