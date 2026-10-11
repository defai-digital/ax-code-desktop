export type PermissionAction = "allow" | "deny" | "ask"

export type PermissionRule = {
  permission: string
  pattern: string
  action: PermissionAction
}

export type PermissionConfigValue = PermissionAction | Record<string, PermissionAction>
export type PermissionRuleKey = `${string}::${string}`

export const isPermissionAction = (value: unknown): value is PermissionAction =>
  value === "allow" || value === "ask" || value === "deny"

export const buildPermissionRuleKey = (permission: string, pattern: string): PermissionRuleKey =>
  `${permission}::${pattern}`

export const normalizePermissionRules = (ruleset: PermissionRule[]): PermissionRule[] => {
  const map = new Map<PermissionRuleKey, PermissionRule>()
  for (const rule of ruleset) {
    if (!rule.permission || rule.permission === "invalid") {
      continue
    }
    if (!rule.pattern) {
      continue
    }
    if (!isPermissionAction(rule.action)) {
      continue
    }
    map.set(buildPermissionRuleKey(rule.permission, rule.pattern), {
      permission: rule.permission,
      pattern: rule.pattern,
      action: rule.action,
    })
  }
  return Array.from(map.values())
}

export const parsePermissionRuleset = (ruleset: unknown): PermissionRule[] => {
  if (!Array.isArray(ruleset)) {
    return []
  }

  const parsed: PermissionRule[] = []
  for (const entry of ruleset) {
    if (!entry || typeof entry !== "object") {
      continue
    }
    const candidate = entry as Partial<PermissionRule>
    if (typeof candidate.permission !== "string" || typeof candidate.pattern !== "string") {
      continue
    }
    if (!isPermissionAction(candidate.action)) {
      continue
    }
    parsed.push({
      permission: candidate.permission,
      pattern: candidate.pattern,
      action: candidate.action,
    })
  }
  return parsed
}
