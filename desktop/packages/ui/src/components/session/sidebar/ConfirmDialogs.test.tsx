import React, { act } from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@/test/dom"
import {
  BulkSessionDeleteConfirmDialog,
  SessionDeleteConfirmDialog,
  type BulkDeleteSessionsConfirmState,
  type DeleteSessionConfirmState,
} from "./ConfirmDialogs"
import type { Session } from "@defai-digital/ax-code-sdk/v2"

vi.mock("@/lib/i18n", async () => {
  const { dict } = await import("@/lib/i18n/messages/en")
  return {
    useI18n: () => ({
      t: (key: keyof typeof dict, params: Record<string, string | number> = {}) =>
        (dict[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? name)),
      number: (value: number) => String(value),
    }),
  }
})

const makeSession = (id: string): Session => ({ id, title: `Session ${id}` }) as Session

function Harness({ onConfirm }: { onConfirm: () => Promise<void> | void }) {
  const [value, setValue] = React.useState<DeleteSessionConfirmState>(null)
  const confirm = React.useCallback(async () => {
    // Mirror the app's confirmDeleteSession: the dialog state clears before the action runs.
    setValue(null)
    await onConfirm()
  }, [onConfirm])
  return (
    <>
      <button
        type="button"
        onClick={() =>
          setValue({ session: makeSession("ses_a"), descendantCount: 0, descendantIds: [], archivedBucket: false })
        }
      >
        open
      </button>
      <SessionDeleteConfirmDialog
        value={value}
        setValue={setValue}
        showDeletionDialog
        setShowDeletionDialog={() => {}}
        onConfirm={confirm}
      />
    </>
  )
}

describe("SessionDeleteConfirmDialog", () => {
  afterEach(() => cleanup())

  test("cancel closes the dialog", async () => {
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole("button", { name: "open" }))

    const dialog = screen.getByRole("dialog")
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    })

    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: 1500 })
    expect(onConfirm).not.toHaveBeenCalled()
  })

  test("confirm runs the action and closes the dialog", async () => {
    const onConfirm = vi.fn()
    render(<Harness onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole("button", { name: "open" }))

    const dialog = screen.getByRole("dialog")
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Archive" }))
    })

    expect(onConfirm).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: 1500 })
  })

  test("shows the quoted session title for a single archive", async () => {
    render(<Harness onConfirm={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "open" }))

    expect(screen.getByRole("dialog").textContent).toContain('"Session ses_a" will be archived.')
  })
})

function BulkHarness({ count, projectName }: { count: number; projectName: string }) {
  const [value, setValue] = React.useState<BulkDeleteSessionsConfirmState>({
    sessionCount: count,
    archivedBucket: false,
  })
  return (
    <BulkSessionDeleteConfirmDialog
      value={value}
      setValue={setValue}
      showDeletionDialog
      setShowDeletionDialog={() => {}}
      projectName={projectName}
      onConfirm={() => {}}
    />
  )
}

describe("BulkSessionDeleteConfirmDialog project copy", () => {
  afterEach(() => cleanup())

  test("uses a singular description for the last session in a project", () => {
    render(<BulkHarness count={1} projectName="Shared (/repo)" />)

    const text = screen.getByRole("dialog").textContent
    expect(text).toContain('The session in "Shared (/repo)" will be archived.')
    expect(text).not.toContain("All 1 sessions")
  })

  test("keeps the project count in the plural description", () => {
    render(<BulkHarness count={3} projectName="Shared (/repo)" />)

    expect(screen.getByRole("dialog").textContent).toContain('All 3 sessions in "Shared (/repo)" will be archived.')
  })
})
