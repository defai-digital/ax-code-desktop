import React from "react"
import { afterEach, expect, test } from "vitest"
import { cleanup, render } from "@/test/dom"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { ProjectIdentityText } from "./ProjectIdentityText"

afterEach(cleanup)

test("same-name projects retain distinct visible suffixes and complete accessible identity", () => {
  const paths = ["/work/alice/packages/web", "/work/bob/packages/web"]
  useDirectoryStore.setState({ homeDirectory: "/home/me" })
  useProjectsStore.setState({
    projects: paths.map((path, index) => ({ id: String(index), path, label: "Shared", addedAt: 0, lastOpenedAt: 0 })),
  })
  const view = render(
    <>
      {paths.map((path) => (
        <ProjectIdentityText key={path} label={`Shared · ${path}`} />
      ))}
    </>,
  )
  const labels = view.container.querySelectorAll("[title]")
  expect(Array.from(labels, (label) => label.lastElementChild?.textContent)).toEqual([
    "…/alice/packages/web",
    "…/bob/packages/web",
  ])
  for (const [index, label] of labels.entries()) {
    expect(label.getAttribute("title")).toBe(`Shared · ${paths[index]}`)
    expect(label.getAttribute("aria-label")).toBe(`Shared · ${paths[index]}`)
  }
})

test("a long project name cannot displace its distinguishing path line", () => {
  const name = "Long project ".repeat(40)
  const view = render(<ProjectIdentityText label={`${name} · /work/alice/app`} />)
  const identity = view.container.querySelector("[title]")!
  expect(identity.children).toHaveLength(2)
  expect(identity.lastElementChild?.textContent).toBe("…/alice/app")
  expect(identity.getAttribute("aria-label")).toBe(`${name} · /work/alice/app`)
})

test("a separator inside a project name does not turn its name into path context", () => {
  const view = render(<ProjectIdentityText label="Team · Service" />)
  const identity = view.container.querySelector("[title]")!
  expect(identity.children).toHaveLength(1)
  expect(identity.textContent).toBe("Team · Service")
})
