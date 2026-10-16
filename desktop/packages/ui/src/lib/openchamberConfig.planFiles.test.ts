import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { files } = vi.hoisted(() => ({ files: { current: new Map<string, string>() } }))

vi.mock("./desktop", () => ({ getDesktopHomeDirectory: async () => "/home/user" }))

const HOME = "/home/user"
const PROJECT = { id: "proj", path: "/repo" }

// Resolve the way a filesystem does, so a path that climbs out of the plans directory lands on the
// file it really names instead of on a key that merely looks like it.
const normalizeFsPath = (path: string): string => {
  const segments: string[] = []
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue
    if (segment === "..") {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return `/${segments.join("/")}`
}

const setRuntimeFiles = (value: { files: unknown } | undefined) => {
  ;(window as unknown as { __AX_CODE_DESKTOP_RUNTIME_APIS__?: unknown }).__AX_CODE_DESKTOP_RUNTIME_APIS__ = value
}

const installRuntimeFiles = () => {
  const store = files.current
  setRuntimeFiles({
    files: {
      readFile: async (path: string) => {
        const content = store.get(normalizeFsPath(path))
        if (content === undefined) throw new Error("ENOENT")
        return { content, path }
      },
      writeFile: async (path: string, content: string) => {
        store.set(normalizeFsPath(path), content)
        return { success: true, path }
      },
      createDirectory: async (path: string) => ({ success: true, path }),
      delete: async (path: string) => ({ success: store.delete(normalizeFsPath(path)) }),
    },
  })
}

const {
  createProjectPlanFile,
  deleteProjectPlanFile,
  getProjectContextData,
  readProjectPlanFile,
} = await import("./openchamberConfig")

const configPaths = () => [...files.current.keys()].filter((key) => key.endsWith(".json"))

const planDirectoryOf = (planPath: string) => planPath.slice(0, planPath.lastIndexOf("/"))

describe("project plan files", () => {
  beforeEach(() => {
    files.current = new Map<string, string>()
    // `resolveHomeDirectory` asks the API first; the runtime files API below answers every other call.
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))))
    installRuntimeFiles()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setRuntimeFiles(undefined)
  })

  test("two plans created at once both keep their link", async () => {
    // Both creations write a markdown file, then append its link to the project config. Reading the
    // link list outside the write queue let the second append overwrite the first, leaving a plan
    // whose file exists but which the panel never lists.
    const created = await Promise.all([
      createProjectPlanFile(PROJECT, { title: "alpha", body: "first" }),
      createProjectPlanFile(PROJECT, { title: "beta", body: "second" }),
    ])

    expect(created.filter(Boolean)).toHaveLength(2)
    const { plans } = await getProjectContextData(PROJECT)
    expect(plans.map((plan) => plan.path).sort()).toEqual(created.map((plan) => plan!.path).sort())
  })

  test("reads a plan file that sits in the plans directory", async () => {
    const created = await createProjectPlanFile(PROJECT, { title: "alpha", body: "first" })
    expect(created).not.toBeNull()

    const file = await readProjectPlanFile(PROJECT, created!.path)

    expect(file?.title).toBe("alpha")
    expect(file?.body).toContain("first")
  })

  // The link comes from the config, and a config cloned into a repository can name any path: reading
  // whatever it pointed at showed another file's first line as this plan's title.
  test("refuses to read a named path outside the plans directory", async () => {
    const created = await createProjectPlanFile(PROJECT, { title: "alpha", body: "first" })
    const plansDirectory = planDirectoryOf(created!.path)
    files.current.set(`${HOME}/.ssh/id_rsa`, "PRIVATE KEY")
    files.current.set("/etc/passwd", "root:x:0:0")

    await expect(readProjectPlanFile(PROJECT, `${HOME}/.ssh/id_rsa`)).resolves.toBeNull()
    await expect(readProjectPlanFile(PROJECT, "/etc/passwd")).resolves.toBeNull()
    await expect(readProjectPlanFile(PROJECT, `${plansDirectory}/${"../".repeat(8)}etc/passwd`)).resolves.toBeNull()
    await expect(readProjectPlanFile(PROJECT, `${plansDirectory}-elsewhere/alpha.md`)).resolves.toBeNull()
  })

  test("removes a link without deleting what an escaping path points at", async () => {
    const created = await createProjectPlanFile(PROJECT, { title: "alpha", body: "first" })
    const plansDirectory = planDirectoryOf(created!.path)
    const outsidePath = `${plansDirectory}/${"../".repeat(8)}etc/passwd`
    files.current.set("/etc/passwd", "root:x:0:0")
    files.current.set(
      configPaths()[0],
      JSON.stringify({ projectPlanFiles: [{ ...created, path: outsidePath }] }),
    )

    await expect(deleteProjectPlanFile(PROJECT, created!.id)).resolves.toBe(true)

    expect(files.current.has("/etc/passwd")).toBe(true)
    const { plans } = await getProjectContextData(PROJECT)
    expect(plans).toHaveLength(0)
  })
})
