import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"
import type { GitRemote } from "@/lib/api/types"

import { SyncActions } from "./SyncActions"

const remotes: GitRemote[] = [
  { name: "origin", fetchUrl: "git@example.com:origin.git", pushUrl: "git@example.com:origin.git" },
  { name: "upstream", fetchUrl: "git@example.com:upstream.git", pushUrl: "git@example.com:upstream.git" },
]

describe("SyncActions remote menu", () => {
  let container: HTMLDivElement
  let root: Root
  let onFetch: ReturnType<typeof vi.fn<(remote: GitRemote) => void>>
  let onRemoveRemote: ReturnType<typeof vi.fn<(remote: GitRemote) => void>>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    onFetch = vi.fn()
    onRemoveRemote = vi.fn()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
    vi.unstubAllGlobals()
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
  })

  const renderActions = () => {
    act(() =>
      root.render(
        <I18nProvider>
          <SyncActions
            syncAction={null}
            remotes={remotes}
            onFetch={onFetch}
            onPull={() => {}}
            onPush={() => {}}
            onRemoveRemote={onRemoveRemote}
            disabled={false}
            trackingRemoteName="origin"
          />
        </I18nProvider>,
      ),
    )
  }

  const openMenu = () => {
    const trigger = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${dict["gitView.sync.moreActionsAria"]}"]`,
    )
    expect(trigger).not.toBeNull()
    act(() => trigger?.click())
  }

  test("fetch still works after removing a remote from the menu", () => {
    renderActions()
    openMenu()

    const items = () => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    const upstreamItem = items().find((item) => item.textContent?.includes("Fetch from upstream"))
    expect(upstreamItem).toBeTruthy()

    const removeButton = upstreamItem?.querySelector<HTMLButtonElement>(
      `button[aria-label="${dict["gitView.header.removeRemoteAria"]}"]`,
    )
    expect(removeButton).not.toBeNull()
    act(() => removeButton?.click())
    expect(onRemoveRemote).toHaveBeenCalledWith(remotes[1])

    // The remove click stops propagation, so the menu item's own reset never ran. Without
    // clearing the guard in the remove handler this selection was swallowed and the user had
    // to click the remote twice.
    act(() => upstreamItem?.click())

    expect(onFetch).toHaveBeenCalledTimes(1)
    expect(onFetch).toHaveBeenCalledWith(remotes[1])
  })
})
