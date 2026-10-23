import { afterEach, describe, expect, test } from "vitest"

import { cleanup, render } from "@/test/dom"

import { Button } from "./button"

describe("Button", () => {
  afterEach(cleanup)

  test("defaults native buttons to type button", () => {
    const { container } = render(<Button>Cancel</Button>)

    expect(container.querySelector("button")?.getAttribute("type")).toBe("button")
  })

  test("preserves explicit native button types", () => {
    const { container } = render(<Button type="submit">Save</Button>)

    expect(container.querySelector("button")?.getAttribute("type")).toBe("submit")
  })

  test("does not default asChild buttons", () => {
    const { container } = render(
      <Button asChild>
        <a href="/link">Link</a>
      </Button>,
    )

    expect(container.querySelector("a")?.getAttribute("type")).toBeNull()
  })
})
