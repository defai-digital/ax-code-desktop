import { beforeEach, describe, expect, test } from "vitest"
import type { Session } from "@defai-digital/ax-code-sdk/v2"

import { useGlobalSessionsStore } from "@/stores/useGlobalSessionsStore"

import { buildActiveSessionTree, resolveSessionExportTree } from "./sessionExportTree"
import type { SessionNode } from "./types"

const session = (id: string, parentID: string | null, archived = false): Session =>
  ({
    id,
    parentID,
    title: id,
    time: { created: 1, updated: 1, ...(archived ? { archived: 5 } : {}) },
  }) as unknown as Session

const nodeFor = (entry: Session): SessionNode => ({ session: entry, children: [], worktree: null })

describe("session export tree", () => {
  beforeEach(() => {
    useGlobalSessionsStore.setState({ activeSessions: [], archivedSessions: [] })
  })

  test("resolves the whole active subtree a flat row does not render", () => {
    // Live and recent rows render a root without its children, so the export menu read `children.length === 0`
    // and offered no subtasks at all, while the project tree offered them for the same session.
    useGlobalSessionsStore.setState({
      activeSessions: [session("root", null), session("child", "root"), session("grandchild", "child")],
    })

    const tree = resolveSessionExportTree(nodeFor(session("root", null)), session("root", null))

    expect(tree.children.map((child) => child.session.id)).toEqual(["child"])
    expect(tree.children[0].children.map((child) => child.session.id)).toEqual(["grandchild"])
  })

  test("stops at an archived session, as the project tree does", () => {
    useGlobalSessionsStore.setState({
      activeSessions: [
        session("root", null),
        session("child", "root"),
        session("archived-child", "root", true),
        session("below-archived", "archived-child"),
      ],
    })

    expect(buildActiveSessionTree(useGlobalSessionsStore.getState().activeSessions, session("root", null))).toMatchObject({
      children: [{ session: { id: "child" }, children: [] }],
    })
  })

  test("keeps the rendered tree when the row has one", () => {
    const rendered = nodeFor(session("child", "root"))
    const tree = { ...nodeFor(session("root", null)), children: [rendered] }
    useGlobalSessionsStore.setState({ activeSessions: [session("root", null), session("child", "root")] })

    expect(resolveSessionExportTree(tree, session("root", null))).toBe(tree)
  })

  test("resolves an archived session's archived subtasks from the archived bucket", () => {
    // The project tree nests children of the same archived state; the fix read only activeSessions, so an archived
    // root exported from a flat row came back with no subtasks at all.
    const archivedRoot = session("archived-root", null, true)
    const archivedChild = session("archived-child", "archived-root", true)
    useGlobalSessionsStore.setState({ activeSessions: [], archivedSessions: [archivedRoot, archivedChild] })

    const tree = resolveSessionExportTree(nodeFor(archivedRoot), archivedRoot)

    expect(tree.children.map((child) => child.session.id)).toEqual(["archived-child"])
  })

  test("exports a duplicated cache entry once", () => {
    useGlobalSessionsStore.setState({
      activeSessions: [session("root", null), session("child", "root"), session("child", "root")],
    })

    const tree = buildActiveSessionTree(useGlobalSessionsStore.getState().activeSessions, session("root", null))

    expect(tree.children.map((child) => child.session.id)).toEqual(["child"])
  })

  test("stops on a parent cycle instead of recursing forever", () => {
    // The cache is merged from snapshots and is not guaranteed to be acyclic; the project tree builder would recurse
    // just as far, but the export path must not take the click handler down with it.
    useGlobalSessionsStore.setState({ activeSessions: [session("a", "b"), session("b", "a")] })

    const tree = buildActiveSessionTree(useGlobalSessionsStore.getState().activeSessions, session("a", "b"))

    expect(tree.children.map((child) => child.session.id)).toEqual(["b"])
    expect(tree.children[0].children).toEqual([])
  })
})
