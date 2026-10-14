import { afterEach, describe, expect, test, vi } from "vitest"

// The generated SDK resolves with `{ error }` instead of throwing, so a list
// call that only reads `.data` reports a failed request as an empty result.
// listAgents already throws for this reason (see its comment); these cover the
// siblings that used to swallow it.
type SdkResult = { data?: unknown; error?: unknown }

const sdk = {
  command: { list: vi.fn(async (): Promise<SdkResult> => ({ error: { message: "boom" } })) },
  app: { skills: vi.fn(async (): Promise<SdkResult> => ({ error: { message: "boom" } })) },
  tool: { ids: vi.fn(async (): Promise<SdkResult> => ({ error: { message: "boom" } })) },
}

vi.doMock("@defai-digital/ax-code-sdk/v2/client", () => ({
  createAxCodeClient: () => sdk,
}))

const { axCodeClient } = await import("./client")

describe("axCodeClient list failures", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("listCommands rejects instead of reporting an empty command list", async () => {
    await expect(axCodeClient.listCommands()).rejects.toThrow(/command\.list failed: boom/)
  })

  test("listCommandsWithDetails rejects instead of reporting an empty command list", async () => {
    await expect(axCodeClient.listCommandsWithDetails()).rejects.toThrow(/command\.list failed: boom/)
  })

  test("listSkillsWithDetails rejects instead of reporting no skills", async () => {
    await expect(axCodeClient.listSkillsWithDetails()).rejects.toThrow(/app\.skills failed: boom/)
  })

  test("listToolIds rejects instead of reporting no tools", async () => {
    await expect(axCodeClient.listToolIds()).rejects.toThrow(/tool\.ids failed: boom/)
  })

  test("a successful response still maps through", async () => {
    sdk.command.list.mockResolvedValueOnce({ data: [{ name: "review", description: "Review the diff" }] })

    await expect(axCodeClient.listCommands()).resolves.toEqual([
      { name: "review", description: "Review the diff", agent: undefined, model: undefined, source: undefined },
    ])
  })
})
