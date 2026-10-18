import path from "node:path"
import { createRequire } from "node:module"
const root = path.resolve(import.meta.dirname, "../../../..")
const fromWeb = createRequire(path.join(root, "desktop/packages/web/package.json"))
const fromUi = createRequire(path.join(root, "desktop/packages/ui/package.json"))
const fromRoot = createRequire(path.join(root, "package.json"))
const { build } = await import(fromWeb.resolve("vite"))
const react = (await import(fromWeb.resolve("@vitejs/plugin-react"))).default
const tailwind = (await import(fromRoot.resolve("@tailwindcss/postcss"))).default
const ui = path.join(root, "desktop/packages/ui/src")
const preview = process.env.AX_PREVIEW_FIXTURE === "1"
await build({
  configFile: false,
  root: import.meta.dirname,
  base: "./",
  plugins: [
    react(),
    {
      name: "fixture-runtime-boundary",
      enforce: "pre",
      resolveId(id) {
        if (!preview && ["@/hooks/useSupervisionRows", "@/sync/session-actions", "@/components/ui"].includes(id))
          return `\0fixture:${id}`
      },
      load(id) {
        if (id === "\0fixture:@/hooks/useSupervisionRows")
          return `import { useSupervisionStore } from "${ui}/stores/useSupervisionStore"; export function useSupervisionRow(id) { return useSupervisionStore(s => s.rows.find(r => r.sessionId === id)); }`
        if (id === "\0fixture:@/sync/session-actions")
          return "export const captureBlockingRequest=()=>({respond:async()=>{},read:async()=>'pending',isPendingLocally:()=>true}), respondToPermission=async()=>{}, respondToQuestion=async()=>{}, rejectQuestion=async()=>{}, waitForConnectionOrThrow=async()=>{};"
        if (id === "\0fixture:@/components/ui") return "export const toast={error:()=>{}};"
      },
    },
  ],
  resolve: {
    alias: [
      ...(preview ? [] : ["@/hooks/useSupervisionRows", "@/sync/session-actions", "@/components/ui"]).map((find) => ({
        find: new RegExp(`^${find}$`),
        replacement: `\0fixture:${find}`,
      })),
      { find: /^@\//, replacement: `${ui}/` },
      { find: "react-dom", replacement: path.dirname(fromUi.resolve("react-dom/package.json")) },
      { find: "react", replacement: path.dirname(fromUi.resolve("react/package.json")) },
    ],
  },
  worker: { format: "es" },
  css: { postcss: { plugins: [tailwind()] } },
  build: {
    outDir: process.env.AX_UIUX_DIST || (preview ? "/tmp/ax-code-streamlit-project-renderer" : "/tmp/ax-code-supervision-v2-renderer"),
    emptyOutDir: true,
    rollupOptions: { input: path.join(import.meta.dirname, preview ? "preview.html" : "renderer.html") },
  },
})
