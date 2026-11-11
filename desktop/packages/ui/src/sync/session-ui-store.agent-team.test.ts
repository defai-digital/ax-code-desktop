import { beforeEach, describe, expect, test, vi } from "vitest"

const sendMessage = vi.fn<(input: Record<string, unknown>) => Promise<void>>(async () => {})
const sendCommand = vi.fn<(input: Record<string, unknown>) => Promise<void>>(async () => {})

vi.mock("@/lib/ax-code/client", () => ({
  axCodeClient: {
    getDirectory: () => "/proj",
    setDirectory: () => {},
    withDirectory: (_directory: string, run: () => Promise<void>) => run(),
    sendMessage: (input: Record<string, unknown>) => sendMessage(input),
    sendCommand: (input: Record<string, unknown>) => sendCommand(input),
  },
}))

vi.mock("./session-actions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./session-actions")>()),
  // The optimistic insert needs live sync state; the routing under test is what `send` receives.
  optimisticSend: (input: { send: (messageID: string) => Promise<void> }) => input.send("message-1"),
}))

const { routeMessage, useSessionUIStore } = await import("./session-ui-store")
const { useAgentTeamStore } = await import("@/stores/useAgentTeamStore")
const { useWorkModeStore } = await import("@/stores/useWorkModeStore")
const { useCommandsStore } = await import("@/stores/useCommandsStore")

const KIMI = { providerID: "moonshot", modelID: "kimi" }
const GLM = { providerID: "zhipu", modelID: "glm" }
const DEEPSEEK = { providerID: "deepseek", modelID: "v4" }

const send = (content = "fix the login bug") =>
  routeMessage({ sessionId: "session-1", directory: "/proj", content, providerID: "alibaba", modelID: "qwen" })

const sentMessage = () => sendMessage.mock.calls[0]![0] as {
  providerID: string
  modelID: string
  text: string
  additionalParts?: Array<{ text: string; synthetic?: boolean }>
}

describe("agent team send routing", () => {
  beforeEach(() => {
    sendMessage.mockClear()
    sendCommand.mockClear()
    useAgentTeamStore.setState({ teamByDirectory: {} })
    useWorkModeStore.setState({ modeByDirectory: {} })
  })

  test("with no role ticked the message is sent exactly as before", async () => {
    await send()

    expect(sentMessage()).toMatchObject({ providerID: "alibaba", modelID: "qwen", text: "fix the login bug" })
    expect(sentMessage().additionalParts).toBeUndefined()
  })

  test("a single coder runs the message without extra instructions", async () => {
    useAgentTeamStore.getState().toggleModel("/proj", "coder", KIMI)

    await send()

    expect(sentMessage()).toMatchObject({ ...KIMI, text: "fix the login bug" })
    expect(sentMessage().additionalParts).toBeUndefined()
  })

  test("QA adds hidden council instructions and leaves the typed text alone", async () => {
    useAgentTeamStore.getState().toggleModel("/proj", "qa", GLM)
    useAgentTeamStore.getState().toggleModel("/proj", "qa", DEEPSEEK)

    await send()

    const message = sentMessage()
    expect(message).toMatchObject({ providerID: "alibaba", modelID: "qwen", text: "fix the login bug" })
    expect(message.additionalParts).toHaveLength(1)
    expect(message.additionalParts![0]!.synthetic).toBe(true)
    expect(message.additionalParts![0]!.text).toContain("**council**")
    expect(message.additionalParts![0]!.text).toContain(JSON.stringify([GLM, DEEPSEEK]))
  })

  test("a single QA model is not sent, because the runtime's council needs two reviewers", async () => {
    useAgentTeamStore.getState().toggleModel("/proj", "qa", GLM)

    await send()

    expect(sentMessage()).toMatchObject({ providerID: "alibaba", modelID: "qwen", text: "fix the login bug" })
    expect(sentMessage().additionalParts).toBeUndefined()
  })

  test("an unticked role sends nothing even though its models are remembered", async () => {
    useAgentTeamStore.getState().toggleModel("/proj", "qa", GLM)
    useAgentTeamStore.getState().toggleModel("/proj", "qa", DEEPSEEK)
    useAgentTeamStore.getState().setRoleEnabled("/proj", "qa", false)

    await send()

    expect(sentMessage().additionalParts).toBeUndefined()
  })

  test("starting a new chat keeps the team ticked, while work mode still resets to Agent", async () => {
    useAgentTeamStore.getState().toggleModel("/proj", "coder", KIMI)
    useAgentTeamStore.getState().toggleModel("/proj", "qa", GLM)
    useAgentTeamStore.getState().toggleModel("/proj", "qa", DEEPSEEK)
    useWorkModeStore.getState().setMode("/proj", "council")

    useSessionUIStore.getState().openNewSessionDraft({ directoryOverride: "/proj" })

    expect(useWorkModeStore.getState().getMode("/proj")).toBe("agent")
    const team = useAgentTeamStore.getState().getTeam("/proj")
    expect(team.coder).toEqual({ enabled: true, models: [KIMI] })
    expect(team.qa).toEqual({ enabled: true, models: [GLM, DEEPSEEK] })

    await send()
    expect(sentMessage()).toMatchObject(KIMI)
    expect(sentMessage().additionalParts?.[0]?.text).toContain("**council**")
  })

  test("a team picked for another project does not leak into this send", async () => {
    useAgentTeamStore.getState().toggleModel("/other", "coder", KIMI)

    await send()

    expect(sentMessage()).toMatchObject({ providerID: "alibaba", modelID: "qwen" })
  })

  test("Council work mode owns the fan-out: the team is not applied to its command", async () => {
    useAgentTeamStore.getState().toggleModel("/proj", "coder", KIMI)
    useAgentTeamStore.getState().toggleModel("/proj", "qa", GLM)
    useWorkModeStore.getState().setMode("/proj", "council")
    useCommandsStore.setState({ commands: [{ name: "council" }] } as never)

    await send("rate this module")

    expect(sendMessage).not.toHaveBeenCalled()
    expect(sendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ command: "council", providerID: "alibaba", modelID: "qwen" }),
    )
  })
})
