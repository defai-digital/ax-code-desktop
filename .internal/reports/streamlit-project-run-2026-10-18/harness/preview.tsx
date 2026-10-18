import React from "react"
import { createRoot } from "react-dom/client"
import { I18nProvider } from "@/lib/i18n"
import { DesktopBrowserPane } from "@/components/layout/ContextPanel-impl"
import { useWebMcpBrowserStore } from "@/stores/useWebMcpBrowserStore"
import { streamlitRunCommand } from "@/lib/streamlitRecipe"
import { CSSVariableGenerator } from "@/lib/theme/cssGenerator"
import { getDefaultTheme } from "@/lib/theme/themes"
import "@/index.css"

const style = document.createElement("style")
style.textContent = `:root { ${new CSSVariableGenerator().generate(getDefaultTheme(false))} } body {margin:0;}`
document.head.appendChild(style)
const root = createRoot(document.getElementById("root")!)
const mount = (url: string, project = "alpha") => root.render(
  <I18nProvider><DesktopBrowserPane key={`${project}:${url}`} initialUrl={url} directory={`/fixture/${project}`} tabID="global-browser" /></I18nProvider>,
)
Object.assign(window, {
  previewFixture: {
    mount,
    hide: () => root.render(null),
    agentEnabled: () => useWebMcpBrowserStore.getState().enabled,
    recipe: async (input: {id: string; interpreter: string; entrypoint: string; port: string}) => ({command: await streamlitRunCommand({version: 1, interpreter: input.interpreter, entrypoint: input.entrypoint.split("/").pop()!, port: Number(input.port)}, `native-${input.id}`)}),
  },
})
mount(new URLSearchParams(location.search).get("url") || "about:blank")
