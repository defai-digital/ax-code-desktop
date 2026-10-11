import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { axCodeClient } from "./client"
import { useI18nStore } from "../i18n/store"

beforeEach(() => {
  axCodeClient.setDirectory("")
  useI18nStore.setState({ conversation: "auto" })
})
afterEach(() => {
  vi.unstubAllGlobals()
  useI18nStore.setState({ conversation: "auto" })
  axCodeClient.setDirectory("")
})

test("normal prompts carry an independent preference without rewriting user parts", async () => {
  useI18nStore.setState({ conversation: "zh-TW", locale: "en" })
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal("fetch", fetch)
  const text = "Keep {path}, $& and git status unchanged."
  await axCodeClient.sendMessage({ id: "ses_language", providerID: "language-test", modelID: "model", text })
  const payload = JSON.parse(fetch.mock.calls[0][1].body)
  expect(payload.system).toContain("Traditional Chinese")
  expect(payload.system).toContain("Explicit user language requests and project instructions take precedence")
  expect(payload.parts).toContainEqual(expect.objectContaining({ type: "text", text }))
})

test("model-backed slash commands preserve arguments and use the same preference", async () => {
  useI18nStore.setState({ conversation: "ja" })
  const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }))
  vi.stubGlobal("fetch", fetch)
  await axCodeClient.sendCommand({
    id: "ses_language",
    providerID: "language-test",
    modelID: "model",
    command: "review",
    arguments: "src/{file}.ts $&",
  })
  const payload = JSON.parse(fetch.mock.calls[0][1].body)
  expect(payload.system).toContain("Japanese")
  expect(payload.command).toBe("review")
  expect(payload.arguments).toBe("src/{file}.ts $&")
})

test("auto omits system even when the interface language is not English", async () => {
  useI18nStore.setState({ conversation: "auto", locale: "zh-TW" })
  const fetch = vi.fn().mockImplementation(async () => new Response(null, { status: 204 }))
  vi.stubGlobal("fetch", fetch)
  await axCodeClient.sendMessage({
    id: "ses_language",
    providerID: "language-test",
    modelID: "model",
    text: "Original",
  })
  await axCodeClient.sendCommand({
    id: "ses_language",
    providerID: "language-test",
    modelID: "model",
    command: "review",
    arguments: "original",
  })
  for (const call of fetch.mock.calls) expect(JSON.parse(call[1].body)).not.toHaveProperty("system")
})
