"use strict"

/** Opt-in global shortcut. Off unless settings.json says so. */
const QUICK_DISPATCH_ACCELERATOR = "Alt+Space"

const readQuickDispatchShortcutEnabled = (settings) =>
  Boolean(
    settings &&
      typeof settings === "object" &&
      !Array.isArray(settings) &&
      settings.quickDispatchGlobalShortcut === true,
  )

/**
 * Register or release the accelerator so it matches `enabled`.
 * `register` returns whether the OS accepted it. A failed or thrown register leaves the
 * shortcut unregistered. A thrown unregister while disabling is treated as already released.
 * Returns the registered flag the caller should keep.
 */
const syncQuickDispatchShortcut = ({ enabled, registered, register, unregister }) => {
  if (!enabled) {
    if (registered) {
      try {
        unregister()
      } catch {
        // The OS may already have dropped the accelerator.
      }
    }
    return false
  }
  if (registered) return true
  try {
    return register() === true
  } catch {
    return false
  }
}

module.exports = {
  QUICK_DISPATCH_ACCELERATOR,
  readQuickDispatchShortcutEnabled,
  syncQuickDispatchShortcut,
}
