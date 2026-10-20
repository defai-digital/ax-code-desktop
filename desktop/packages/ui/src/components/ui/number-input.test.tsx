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

  const render = (props: { initial: number; min: number; max: number; step: number; label?: string }) => {
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
            aria-label={props.label}
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

  test("identifies both stepper actions by their field name", () => {
    const { container } = render({ initial: 13, min: 9, max: 52, step: 1, label: "Terminal Font Size" })
    const buttons = container.querySelectorAll("button")
    expect(buttons[0].getAttribute("aria-label")).toBe("Decrease value: Terminal Font Size")
    expect(buttons[1].getAttribute("aria-label")).toBe("Increase value: Terminal Font Size")
    act(() => buttons[1].click())
    expect(container.querySelector("input")!.value).toBe("14")
  })

  test("commits a typed value that is already in range and on step", () => {
    const { input, changes } = render({ initial: 10, min: 0, max: 100, step: 1 })

    act(() => type(input, "42"))

    expect(changes.at(-1)).toBe(42)
    expect(input.value).toBe("42")
  })

  test("rounds a fractional entry in a whole-number field on blur", () => {
    // `normalizeToStep` returned the value untouched when the step had no decimals, so the blur that is meant to
    // force an off-step entry into range kept "1.5" in a field whose callers store px, days or line numbers.
    const { input, changes } = render({ initial: 10, min: 0, max: 100, step: 1 })

    act(() => type(input, "1.5"))
    act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })))

    expect(changes.at(-1)).toBe(2)
    expect(input.value).toBe("2")
  })

  test("keeps the precision a fractional step declares", () => {
    const { input, changes } = render({ initial: 0, min: 0, max: 10, step: 0.5 })

    act(() => type(input, "1.25"))
    act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })))

    expect(changes.at(-1)).toBe(1.3)
    expect(input.value).toBe("1.3")
  })
})
