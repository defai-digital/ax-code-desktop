/** Native, document-local tools for inspecting and exercising the development UI. */
export interface UiTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: { readOnlyHint: boolean }
  execute: (input: unknown) => unknown
}

interface ModelContext {
  registerTool: (tool: UiTool, options: { signal: AbortSignal }) => unknown
}

const CONTROL_SELECTOR =
  'button, input, textarea, a[href], summary, [role="button"], [role="tab"], [role="checkbox"], [role="switch"], [role="radio"], [role="combobox"], [role="option"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]'
const MAX_CONTROLS = 100
const compact = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim().slice(0, 160)

function visible(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false
  const style = element.ownerDocument.defaultView!.getComputedStyle(element)
  return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0
}

function nameOf(element: HTMLElement): string {
  const doc = element.ownerDocument
  const labelledBy = element.getAttribute("aria-labelledby")
  if (labelledBy) {
    return compact(
      labelledBy
        .split(/\s+/)
        .map((id) => doc.getElementById(id)?.textContent ?? "")
        .join(" "),
    )
  }
  const label = element.getAttribute("aria-label")
  if (label) return compact(label)
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return compact(
      Array.from(element.labels ?? [])
        .map((entry) => entry.textContent)
        .join(" ") ||
        element.placeholder ||
        element.title,
    )
  }
  return compact(element.textContent || element.title)
}

const TEXT_INPUT_TYPES = ["text", "search", "email", "url", "tel", "number"]

function sensitive(element: HTMLInputElement | HTMLTextAreaElement): boolean {
  const describedBy = (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
    .join(" ")
  return /password|passphrase|secret|token|credential|api.?key|private.?key|bearer|recovery|seed.?phrase|credit|card|cc-|one-time-code/i.test(
    [element.id, element.name, element.autocomplete, element.placeholder, nameOf(element), describedBy].join(" "),
  )
}

function fillable(element: HTMLElement): element is HTMLInputElement | HTMLTextAreaElement {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return false
  if (element.readOnly || element.disabled || element.getAttribute("aria-disabled") === "true") return false
  if (element instanceof HTMLInputElement && !TEXT_INPUT_TYPES.includes(element.type)) return false
  // Keep credential, payment and file inputs outside the developer tool surface.
  return !sensitive(element)
}

function inputObject(input: unknown, keys: string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected an input object")
  if (Object.keys(input).some((key) => !keys.includes(key))) throw new Error("Unknown input property")
  return input as Record<string, unknown>
}

export function createDesktopUiTools(doc: Document) {
  const epoch = crypto.randomUUID()
  let generation = 0
  let currentOffset = 0
  let active = true
  const targets = new Map<string, { element: HTMLElement; name: string; role: string }>()
  const assertActive = () => {
    if (!active) throw new Error("UI tools have been disconnected")
  }
  const snapshot = (offset = currentOffset) => {
    assertActive()
    currentOffset = offset
    targets.clear()
    generation += 1
    const elements = Array.from(doc.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)).filter(visible)
    const controls = elements.slice(offset, offset + MAX_CONTROLS).map((element, index) => {
      const ref = `${epoch}:${generation}:${index}`
      const name = nameOf(element)
      const role = element.getAttribute("role") || element.tagName.toLowerCase()
      const disabled = element.matches(":disabled") || element.getAttribute("aria-disabled") === "true"
      targets.set(ref, { element, name, role })
      return {
        ref,
        name,
        role,
        disabled,
        fillable: fillable(element),
        selected: element.getAttribute("aria-selected"),
        expanded: element.getAttribute("aria-expanded"),
        checked: element instanceof HTMLInputElement ? element.checked : element.getAttribute("aria-checked"),
      }
    })
    return {
      title: compact(doc.title),
      ready: Boolean(doc.querySelector("#root > :not(#initial-loading)")),
      documentFocused: doc.hasFocus(),
      settingsOpen: Boolean(doc.querySelector("[data-settings-view]")),
      headings: Array.from(doc.querySelectorAll<HTMLElement>('h1,h2,h3,[role="heading"]'))
        .filter(visible)
        .slice(0, 30)
        .map((element) => compact(element.textContent)),
      controls,
      offset,
      total: elements.length,
      nextOffset: elements.length > offset + MAX_CONTROLS ? offset + MAX_CONTROLS : null,
      truncated: elements.length > offset + MAX_CONTROLS,
    }
  }
  const resolve = (ref: unknown) => {
    assertActive()
    if (typeof ref !== "string") throw new Error("A control ref from the latest UI snapshot is required")
    const target = targets.get(ref)
    if (!target || !visible(target.element)) throw new Error("Stale control ref; read the UI again")
    const { element, name, role } = target
    if (name !== nameOf(element) || role !== (element.getAttribute("role") || element.tagName.toLowerCase())) {
      throw new Error("Control changed; read the UI again")
    }
    if (element.matches(":disabled") || element.getAttribute("aria-disabled") === "true") {
      throw new Error("Control is disabled")
    }
    return element
  }
  const refSchema = { type: "string", description: "Opaque ref from the most recent UI snapshot" }
  const tools: UiTool[] = [
    {
      name: "ax_desktop_get_ui_state",
      description:
        "Inspect the rendered AX Code Desktop development UI. Reports document focus, headings and up to 100 controls per page, without input values or chat content. Pass nextOffset as offset to read further controls. Refs expire after another snapshot or action. Poll to verify asynchronous UI changes.",
      inputSchema: {
        type: "object",
        properties: { offset: { type: "integer", minimum: 0, maximum: 100000 } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: (input) => {
        const { offset = 0 } = inputObject(input, ["offset"])
        if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 100000)
          throw new Error("Invalid control offset")
        return snapshot(offset)
      },
    },
    {
      name: "ax_desktop_click",
      description:
        "Click a rendered control by its current snapshot ref through the normal UI event handler. Returns a fresh snapshot; verify the resulting UI separately. No JavaScript, selectors, IPC or runtime calls are accepted.",
      inputSchema: { type: "object", properties: { ref: refSchema }, required: ["ref"], additionalProperties: false },
      annotations: { readOnlyHint: false },
      execute: (input) => {
        const { ref } = inputObject(input, ["ref"])
        const element = resolve(ref)
        if (
          element instanceof HTMLInputElement &&
          ![...TEXT_INPUT_TYPES, "button", "submit", "reset", "checkbox", "radio"].includes(element.type)
        ) {
          throw new Error("This input type is unavailable")
        }
        if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && sensitive(element)) {
          throw new Error("Sensitive fields are unavailable")
        }
        targets.clear()
        element.scrollIntoView?.({ block: "nearest" })
        element.focus({ preventScroll: true })
        element.click()
        return { performed: true, ui: snapshot() }
      },
    },
    {
      name: "ax_desktop_fill",
      description:
        "Fill an ordinary text, search, email, URL, telephone or number field, or textarea, by its current ref using native input/change events. Leaves focus in the field; click another control to test blur validation. Does not submit. Password, credential, file, payment and read-only fields are excluded. Values are not echoed.",
      inputSchema: {
        type: "object",
        properties: { ref: refSchema, value: { type: "string", maxLength: 4000 } },
        required: ["ref", "value"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input) => {
        const { ref, value } = inputObject(input, ["ref", "value"])
        if (typeof value !== "string" || value.length > 4000)
          throw new Error("Value must be a string of at most 4000 characters")
        const element = resolve(ref)
        if (!fillable(element)) throw new Error("Field is not available for filling")
        targets.clear()
        element.scrollIntoView?.({ block: "nearest" })
        element.focus({ preventScroll: true })
        const prototype =
          element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
        Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value)
        element.dispatchEvent(new Event("input", { bubbles: true }))
        element.dispatchEvent(new Event("change", { bubbles: true }))
        return { performed: true, ui: snapshot() }
      },
    },
  ]
  return {
    tools,
    dispose: () => {
      active = false
      targets.clear()
    },
  }
}

export async function installDesktopUiWebMcp(doc: Document): Promise<() => void> {
  const win = doc.defaultView
  const bridge = win as unknown as { __AX_CODE_DESKTOP_ELECTRON__?: { uiWebMcpEnabled?: boolean } } | null
  const context = (doc as Document & { modelContext?: ModelContext }).modelContext
  if (!win || win.top !== win || !win.isSecureContext || !bridge?.__AX_CODE_DESKTOP_ELECTRON__?.uiWebMcpEnabled) {
    return () => {}
  }
  if (!context?.registerTool) throw new Error("Native document.modelContext is unavailable")
  const controller = new AbortController()
  const provider = createDesktopUiTools(doc)
  const dispose = () => {
    provider.dispose()
    controller.abort()
    win.removeEventListener("pagehide", dispose)
  }
  win.addEventListener("pagehide", dispose, { once: true })
  try {
    for (const tool of provider.tools) {
      if (controller.signal.aborted) break
      await context.registerTool(tool, { signal: controller.signal })
    }
  } catch (error) {
    dispose()
    throw error
  }
  return dispose
}
