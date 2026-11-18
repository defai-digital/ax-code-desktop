import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import type { GitIdentityProfile } from "@/lib/api/types"
import { IdentityDropdown } from "./GitHeader"

const profile: GitIdentityProfile = {
  id: "fixture",
  name: "Repository author",
  userName: "Fixture",
  userEmail: "fixture@example.invalid",
}
let root: ReturnType<typeof createRoot> | null = null
let container: HTMLDivElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  vi.unstubAllGlobals()
})

test.each([null, profile])(
  "the icon-only identity control exposes its current value to assistive technology: %j",
  (activeProfile) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    act(() =>
      root?.render(
        <I18nProvider>
          <IdentityDropdown
            activeProfile={activeProfile}
            identities={[profile]}
            onSelect={() => {}}
            isApplying={false}
            iconOnly
          />
        </I18nProvider>,
      ),
    )
    const button = container.querySelector("button")
    expect(button?.getAttribute("aria-label")).toBe(`Git identity: ${activeProfile?.name ?? "No identity"}`)
    expect(button?.disabled).toBe(false)
  },
)
