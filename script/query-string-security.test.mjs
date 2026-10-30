import { createRequire } from "node:module"
import { expect, test } from "vitest"

const webRequire = createRequire(new URL("../desktop/packages/web/package.json", import.meta.url))
const expressRequire = createRequire(webRequire.resolve("express"))
const qs = expressRequire("qs")

test("the web dependency serializes comma arrays with a non-callable own toString", () => {
  // GHSA-6pq8-jhm2-2vcw: the transitive parser must not throw on this ordinary JSON value.
  expect(qs.stringify({ a: [{ toString: 1 }] }, { arrayFormat: "comma" })).toBe("a=%5Bobject%20Object%5D")
})
