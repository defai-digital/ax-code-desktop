export function parseAxCodeVersion(value: unknown): {
  version: string
  parts: readonly number[]
  prerelease: boolean
} | null

export function compareAxCodeVersions(left: unknown, right: unknown): number | null
