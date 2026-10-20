import type { PermissionActionConfig, PermissionConfig } from "@defai-digital/ax-code-sdk/v2"

type PermissionFields = Exclude<PermissionConfig, string>
type DeclaredFields = {
  [Key in keyof PermissionFields as string extends Key ? never : number extends Key ? never : Key]: PermissionFields[Key]
}
type ActionOnlyName = {
  [Key in keyof DeclaredFields]-?: NonNullable<DeclaredFields[Key]> extends PermissionActionConfig ? Key : never
}[keyof DeclaredFields]

// Both missing and extra entries fail type checking when the pinned SDK changes.
// Unknown tool names remain pattern-capable through PermissionConfig's catchall.
const actionOnlyPermissions = {
  todowrite: true,
  todoread: true,
  question: true,
  webfetch: true,
  websearch: true,
  codesearch: true,
  doom_loop: true,
} satisfies Record<ActionOnlyName, true>

export const supportsPermissionPatterns = (name: string): boolean => !Object.hasOwn(actionOnlyPermissions, name)
