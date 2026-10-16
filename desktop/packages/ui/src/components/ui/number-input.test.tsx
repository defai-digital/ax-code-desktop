import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"

vi.doMock("@/lib/device", () => ({
  useDeviceInfo: () => ({ isMobile: false, hasTouchInput: false }),
}))

const { NumberInput } = await import("./number-input")

// React tracks the last value it wrote on the node, so a plain assignment is swallowed:
// the native setter is what makes its change detection see the edit.
const type = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("NumberInput typing", () => {
  const roots: Array<ReturnType<typeof createRoot>> = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount())
    }
    vi.restoreAllMocks()
  })

  const render = (props: { initial: number; min: number; max: number; step: number }) => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)
    const changes: number[] = []

    const Probe = () => {
      const [value, setValue] = React.useState(props.initial)
      return (
        <I18nProvider>
          <NumberInput
            value={value}
            min={props.min}
            max={props.max}
            step={props.step}
            onValueChange={(next) => {
              changes.push(next)
              setValue(next)
            }}
          />
        </I18nProvider>
      )
    }

    act(() => {
      root.render(<Probe />)
    })

    return { container, changes, input: container.querySelector("input") as HTMLInputElement }
  }

  test("keeps an in-progress entry below the minimum instead of committing it clamped", () => {
    // Committing the clamp fed the value straight back into the field, so typing "75" into a
    // min-50 field showed "50", then "505" clamped to 200: the intended value was unreachable.
    const { input, changes } = render({ initial: 100, min: 50, max: 200, step: 5 })

    act(() => type(input, "7"))
    expect(input.value).toBe("7")
    expect(changes).not.toContain(50)

    act(() => type(input, "75"))
    expect(changes.at(-1)).toBe(75)
    expect(input.value).toBe("75")
  })

  test("commits a typed value that is already in range and on step", () => {
    const { input, changes } = render({ initial: 10, min: 0, max: 100, step: 1 })

    act(() => type(input, "42"))

    expect(changes.at(-1)).toBe(42)
    expect(input.value).toBe("42")
  })
})
