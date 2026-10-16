/**
 * The payload an armed CTRL/CMD quick key sends for a viewport input.
 *
 * The arm applies to a single character — the keyboard path derives it from one-character keys — so a
 * longer input passes through untouched. A paste arrives as one multi-character string, and turning
 * its first letter into a control code dropped the rest of it: `echo hello` reached the shell as a
 * single `0x05`. The escape-sequence branch already passed everything through unchanged.
 *
 * Returns the control payload, or null when the input should be sent as it is.
 */
export const quickKeyControlPayload = (data: string, activeModifier: string | null | undefined): string | null => {
  if (!activeModifier || data.length !== 1) {
    return null
  }
  if (!/[a-zA-Z]/.test(data)) {
    return null
  }
  if (activeModifier !== "ctrl" && activeModifier !== "cmd") {
    return null
  }
  return String.fromCharCode(data.toUpperCase().charCodeAt(0) & 0b11111)
}
