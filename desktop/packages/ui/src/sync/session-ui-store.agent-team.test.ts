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
  ascendingId: (prefix: string) => `${prefix}_minted`,
  isValidMessageId: (id: string) => id.startsWith("msg_"),
}))

vi.mock("./session-actions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./session-actions")>()),
  // The optimistic insert needs live sync state; the routing under test is what `send` receives.
  optimisticSend: (input: { messageId?: string; send: (messageID: string) => Promise<void> }) =>
    input.send(input.messageId ?? "msg_optimistic"),
}))

const { routeMessage, useSessionUIStore } = await import("./session-ui-store")
const { useAgentTeamStore } = await import("@/stores/useAgentTeamStore")
const { useWorkModeStore } = await import("@/stores/useWorkModeStore")
const { useCommandsStore } = await import("@/stores/useCommandsStore")
const { useConfigStore } = await import("@/stores/useConfigStore")

const KIMI = { providerID: "moonshot", modelID: "kimi" }
const GLM = { providerID: "zhipu", modelID: "glm" }
const DEEPSEEK = { providerID: "deepseek", modelID: "v4" }
// A CLI provider runs its own agent loop, so the runtime never gives it arena/council.
const CLI_LEAD = { providerID: "claude-code", modelID: "claude-fable-5-2" }
const CLI_CODER = { providerID: "codex-cli", modelID: "codex-large" }
const CLI_CODER_B = { providerID: "dsh-cli", modelID: "dsh-pro" }

// The composer passes the team it shows; `withTeam: false` is any other sender.
const send = (
  content = "fix the login bug",
  options: { withTeam?: boolean; variant?: string; lead?: { providerID: string; modelID: string } } = {},
) =>
  routeMessage({
    sessionId: "session-1",
    directory: "/proj",
    content,
    providerID: options.lead?.providerID ?? "alibaba",
    modelID: options.lead?.modelID ?? "qwen",
    variant: options.variant,
    agentTeam: options.withTeam === false ? undefined : useAgentTeamStore.getState().getTeam("/proj"),
  })

const sentMessage = () => sendMessage.mock.calls[0]![0] as {
  providerID: string
  modelID: string
  text: string
  variant?: string
  messageId?: string
  additionalParts?: Array<{ text: string; synthetic?: boolean }>
}

describe("agent team send routing", () => {
  beforeEach(() => {
    sendMessage.mockClear()
    sendCommand.mockClear()
    useAgentTeamStore.setState({ teamByDirectory: {}, coderMessageIds: [] })
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

  test("a sender that does not pass the team is sent exactly as requested", async () => {
    // Plans, quick dispatch, reviews, retries and queued follow-ups picked their own model.
    useAgentTeamStore.getState().toggleModel("/proj", "coder", KIMI)
    useAgentTeamStore.getState().toggleModel("/proj", "qa", GLM)
    useAgentTeamStore.getState().toggleModel("/proj", "qa", DEEPSEEK)

    await send("run the plan", { withTeam: false, variant: "high" })

    expect(sentMessage()).toMatchObject({ providerID: "alibaba", modelID: "qwen", variant: "high" })
    expect(sentMessage().additionalParts).toBeUndefined()
    expect(useAgentTeamStore.getState().coderMessageIds).toEqual([])
  })

  test("a turn a single coder runs is recorded, so the composer does not adopt the coder", async () => {
    useAgentTeamStore.getState().toggleModel("/proj", "coder", KIMI)

    await send()

    expect(sentMessage().messageId).toBe("msg_minted")
    expect(useAgentTeamStore.getState().isCoderMessage("msg_minted")).toBe(true)
  })

  test("a turn the composer model runs is not recorded as a coder turn", async () => {
    useAgentTeamStore.getState().toggleModel("/proj", "qa", GLM)
    useAgentTeamStore.getState().toggleModel("/proj", "qa", DEEPSEEK)

    await send()

    expect(useAgentTeamStore.getState().coderMessageIds).toEqual([])
  })

  test("a CLI lead is not given the directive: a non-CLI coder runs the turn and it is recorded", async () => {
    useAgentTeamStore.getState().toggleModel("/proj", "coder", KIMI)
    useAgentTeamStore.getState().toggleModel("/proj", "coder", GLM)

    await send("fix the login bug", { lead: CLI_LEAD })

    const message = sentMessage()
    // The CLI lead cannot call arena, so the directive goes to the coder; both coders stay members.
    expect(message).toMatchObject({ ...KIMI, text: "fix the login bug" })
    expect(message.additionalParts).toHaveLength(1)
    expect(message.additionalParts![0]!.synthetic).toBe(true)
    expect(message.additionalParts![0]!.text).toContain("**arena**")
    expect(message.additionalParts![0]!.text).toContain(JSON.stringify([KIMI, GLM]))
    // A substituted runner is not the composer pick, so the composer must not adopt it.
    expect(useAgentTeamStore.getState().isCoderMessage(message.messageId!)).toBe(true)
  })

  test("a single CLI coder with QA sends no directive: the QA step is skipped", async () => {
    useAgentTeamStore.getState().toggleModel("/proj", "coder", CLI_CODER)
    useAgentTeamStore.getState().toggleModel("/proj", "qa", GLM)
    useAgentTeamStore.getState().toggleModel("/proj", "qa", DEEPSEEK)

    await send()

    // The coder still runs the message; the council instructions a CLI coder cannot follow are dropped.
    expect(sentMessage()).toMatchObject({ ...CLI_CODER, text: "fix the login bug" })
    expect(sentMessage().additionalParts).toBeUndefined()
  })

  test("a CLI lead with an all-CLI team is sent the message alone, with the team skipped", async () => {
    useAgentTeamStore.getState().toggleModel("/proj", "coder", CLI_CODER)
    useAgentTeamStore.getState().toggleModel("/proj", "coder", CLI_CODER_B)

    await send("fix the login bug", { lead: CLI_LEAD })

    expect(sentMessage()).toMatchObject({ ...CLI_LEAD, text: "fix the login bug" })
    expect(sentMessage().additionalParts).toBeUndefined()
  })

  test("the composer's effort variant goes to a coder only when the coder offers it", async () => {
    useConfigStore.setState({
      providers: [
        { id: "moonshot", models: [{ id: "kimi", variants: { high: {} } }] },
        { id: "zhipu", models: [{ id: "glm" }] },
      ],
    } as never)

    useAgentTeamStore.getState().toggleModel("/proj", "coder", KIMI)
    await send("a", { variant: "high" })
    expect(sentMessage()).toMatchObject({ ...KIMI, variant: "high" })

    sendMessage.mockClear()
    useAgentTeamStore.getState().toggleModel("/proj", "coder", KIMI)
    useAgentTeamStore.getState().toggleModel("/proj", "coder", GLM)
    await send("b", { variant: "high" })
    expect(sentMessage()).toMatchObject(GLM)
    expect(sentMessage().variant).toBeUndefined()
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
