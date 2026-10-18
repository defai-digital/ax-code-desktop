import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, test, vi } from "vitest"
import type { Part } from "@defai-digital/ax-code-sdk/v2"
vi.mock("@/hooks/useRuntimeAPIs", () => ({ useRuntimeAPIs: () => ({ editor: {} }) }))
vi.mock("@/hooks/useEffectiveDirectory", () => ({ useEffectiveDirectory: () => "/repo" }))
vi.mock("@/contexts/useThemeSystem", () => ({ useOptionalThemeSystem: () => null }))
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/lib/device", () => ({ useDeviceInfo: () => ({ isMobile: false }) }))
import { MarkdownRenderer, SimpleMarkdownRenderer } from "./MarkdownRendererImpl-impl"
const content = '```ax-code-app\n{"version":1,"kind":"streamlit","entrypoint":"app.py"}\n```'
const part = {
  id: "p",
  messageID: "m",
  sessionID: "source-session",
  type: "text",
  text: content,
  time: { start: 1, end: 2 },
} as Part

test("historical app declarations remain readable inert code in every author and streaming state", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }))
  const render = (props = {}) =>
    renderToStaticMarkup(<MarkdownRenderer content={content} part={part} messageId="m" isAnimated={false} {...props} />)
  expect(render()).toContain("app.py")
  expect(render()).not.toContain("data-analysis-app")
  expect(render()).not.toContain(">Run<")
  for (const props of [
    { isStreaming: true },
    { variant: "tool" },
    { variant: "reasoning" },
    { enableFileReferences: false },
    { part: undefined },
    { part: { ...part, time: { start: 1 } } },
  ]) {
    expect(render(props)).not.toContain("data-analysis-app")
  }
  expect(render({ content: content.replace('"version":1', '"version":2') })).not.toContain("data-analysis-app")
  expect(renderToStaticMarkup(<SimpleMarkdownRenderer content={content} />)).not.toContain("data-analysis-app")
  vi.unstubAllGlobals()
})
