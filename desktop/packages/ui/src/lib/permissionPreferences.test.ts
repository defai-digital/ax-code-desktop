import { expect, test } from "vitest"
import { permissionPreferencePersistence } from "./permissionPreferences"

test("keeps canonical session values before legacy qualified keys and ignores directory wildcards", () => {
  const current = { autoAccept: {}, defaultAutoAccept: false }
  const restored = permissionPreferencePersistence.merge(
    {
      autoAccept: {
        session: false,
        "/repo/session": true,
        "/repo/legacy": "true",
        "/repo/*": true,
        off: 0,
      },
      defaultAutoAccept: " false ",
    },
    current,
  )
  expect(restored).toEqual({ autoAccept: { session: false, legacy: true, off: false }, defaultAutoAccept: false })
})
test.each([true, "true", 1])("preserves the explicitly saved legacy enabled choice %j", (value) => {
  expect(
    permissionPreferencePersistence.merge({ defaultAutoAccept: value }, { autoAccept: {}, defaultAutoAccept: false })
      .defaultAutoAccept,
  ).toBe(true)
})
test.each([false, "false", 0, 42])("preserves the legacy disabled choice %j", (value) => {
  expect(
    permissionPreferencePersistence.merge({ defaultAutoAccept: value }, { autoAccept: {}, defaultAutoAccept: true })
      .defaultAutoAccept,
  ).toBe(false)
})
test.each([{}, [], null, "invalid"])("malformed policy cannot re-enable a current opt-out: %j", (value) => {
  expect(
    permissionPreferencePersistence.merge({ defaultAutoAccept: value }, { autoAccept: {}, defaultAutoAccept: false })
      .defaultAutoAccept,
  ).toBe(false)
})
