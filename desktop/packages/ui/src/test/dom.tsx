import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

/**
 * A small subset of Testing Library's queries over createRoot + act. The UI package does not depend on
 * Testing Library; these helpers keep component tests readable without adding it.
 */

let mounted: { root: Root; container: HTMLDivElement } | null = null

export function render(element: React.ReactElement): {
  container: HTMLDivElement
  rerender: (next: React.ReactElement) => void
} {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  cleanup()
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(element))
  mounted = { root, container }
  return { container, rerender: (next) => act(() => root.render(next)) }
}

export function cleanup(): void {
  if (!mounted) return
  const { root, container } = mounted
  act(() => root.unmount())
  container.remove()
  mounted = null
}

const IMPLICIT_ROLES: Record<string, string> = { BUTTON: "button", SELECT: "combobox", LI: "listitem", UL: "list", OL: "list" }

function roleOf(element: Element): string | null {
  const explicit = element.getAttribute("role")
  if (explicit) return explicit
  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox") return "checkbox"
    if (element.type === "search") return "searchbox"
    return "textbox"
  }
  return IMPLICIT_ROLES[element.tagName] ?? null
}

function nameOf(element: Element): string {
  const label = element.getAttribute("aria-label")
  if (label !== null) return label
  if (element instanceof HTMLInputElement && element.placeholder) return element.placeholder
  return element.textContent?.trim() ?? ""
}

function only<T>(matches: T[], what: string): T {
  if (matches.length !== 1) throw new Error(`Expected one ${what}, found ${matches.length}`)
  return matches[0]
}

interface RoleOptions {
  name?: string
  current?: boolean
}

export function within(scope: ParentNode) {
  const all = () => Array.from(scope.querySelectorAll<HTMLElement>("*"))
  const byRole = (role: string, options: RoleOptions = {}) =>
    all().filter(
      (element) =>
        roleOf(element) === role &&
        (options.name === undefined || nameOf(element) === options.name) &&
        (options.current === undefined ||
          (element.getAttribute("aria-current") !== null && element.getAttribute("aria-current") !== "false") ===
            options.current),
    )
  // The deepest elements whose text is exactly `text`, like Testing Library's default matcher.
  const byText = (text: string) =>
    all().filter(
      (element) => element.textContent === text && !Array.from(element.children).some((child) => child.textContent === text),
    )
  const byAttribute = (name: string, value: string) => all().filter((element) => element.getAttribute(name) === value)
  return {
    getByRole: (role: string, options?: RoleOptions) => only(byRole(role, options), `${role} ${options?.name ?? ""}`),
    getAllByRole: (role: string, options?: RoleOptions) => byRole(role, options),
    queryAllByRole: (role: string, options?: RoleOptions) => byRole(role, options),
    queryByRole: (role: string, options?: RoleOptions) => byRole(role, options)[0] ?? null,
    getByText: (text: string) => only(byText(text), `text ${text}`),
    queryByText: (text: string) => byText(text)[0] ?? null,
    getByLabelText: (label: string) => only(byAttribute("aria-label", label), `label ${label}`),
    getByTitle: (title: string) => only(byAttribute("title", title), `title ${title}`),
    getByTestId: (id: string) => only(byAttribute("data-testid", id), `test id ${id}`),
  }
}

export const screen = within(document.body)

export const fireEvent = {
  click: (element: Element) => act(() => (element as HTMLElement).click()),
  keyDown: (element: Element, init: KeyboardEventInit) =>
    act(() => {
      element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }))
    }),
  change: (element: Element, { target }: { target: { value: string } }) =>
    act(() => {
      const prototype =
        element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : element instanceof HTMLSelectElement
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, target.value)
      // React's <select onChange> listens for `change`. Inputs and textareas listen for `input`.
      element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }))
    }),
}
