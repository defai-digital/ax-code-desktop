import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import type { FilesAPI } from "@/lib/api/types"
import { StrandedFilesDraftBanner } from "./StrandedFilesDraftBanner"
import { useStrandedFilesDraftStore, type StrandedFilesDraft } from "./strandedFilesDraft"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  useStrandedFilesDraftStore.setState({ drafts: [] })
})

const draft: StrandedFilesDraft = {
  root: "/repo",
  path: "/repo/a.txt",
  draftContent: "alpha edited\n",
  displayedContent: "alpha\n",
  loadedContent: "alpha\n",
  lineEnding: "\n",
  allowOutsideWorkspace: false,
}

const saveButton = () => {
  const found = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Save changes")
  if (!found) throw new Error("Save changes button not found")
  return found
}

test("saves a draft to its own project's file when the file is unchanged on disk", async () => {
  useStrandedFilesDraftStore.getState().keep(draft)
  const readFile = vi.fn(async (path: string) => ({ content: "alpha\n", path }))
  const writeFile = vi.fn<NonNullable<FilesAPI["writeFile"]>>(async (path) => ({ success: true, path }))
  await act(async () => {
    root.render(
      <I18nProvider>
        <StrandedFilesDraftBanner readFile={readFile} writeFile={writeFile} />
      </I18nProvider>,
    )
  })

  await act(async () => {
    saveButton().click()
  })

  expect(writeFile).toHaveBeenCalledWith("/repo/a.txt", "alpha edited\n", { allowOutsideWorkspace: false, directory: "/repo" })
  expect(useStrandedFilesDraftStore.getState().drafts).toEqual([])
})

test("does not write a draft the reopened editor took back while the disk was being checked", async () => {
  // The editor now owns the draft and saves it itself; a write from here could land over its newer text.
  useStrandedFilesDraftStore.getState().keep(draft)
  let finishRead: () => void = () => {}
  const readFile = vi.fn(
    (path: string) =>
      new Promise<{ content: string; path: string }>((resolve) => {
        finishRead = () => resolve({ content: "alpha\n", path })
      }),
  )
  const writeFile = vi.fn<NonNullable<FilesAPI["writeFile"]>>(async (path) => ({ success: true, path }))
  await act(async () => {
    root.render(
      <I18nProvider>
        <StrandedFilesDraftBanner readFile={readFile} writeFile={writeFile} />
      </I18nProvider>,
    )
  })

  await act(async () => {
    saveButton().click()
  })
  await act(async () => {
    useStrandedFilesDraftStore.getState().take("/repo", "/repo/a.txt")
    finishRead()
  })

  expect(readFile).toHaveBeenCalled()
  expect(writeFile).not.toHaveBeenCalled()
})
