import runner from "./streamlitRunner.py?raw"
import type { OpenChamberProjectAction } from "./openchamberConfig"

export type StreamlitRecipe = { version: 1; entrypoint: string; interpreter?: string; port?: number }
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
const safeText = (value: string) => !Array.from(value).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)

export function sanitizeStreamlitRecipe(value: unknown): StreamlitRecipe | undefined {
  if (!value || typeof value !== "object") return undefined
  const r = value as Partial<StreamlitRecipe>
  if (
    r.version !== 1 ||
    typeof r.entrypoint !== "string" ||
    !safeText(r.entrypoint) ||
    !r.entrypoint.endsWith(".py") ||
    r.entrypoint.startsWith("/") ||
    r.entrypoint.startsWith("-") ||
    r.entrypoint.split(/[\\/]/).includes("..") ||
    r.entrypoint.length > 1000
  )
    return undefined
  if (
    r.interpreter !== undefined &&
    (typeof r.interpreter !== "string" || !r.interpreter.trim() || !safeText(r.interpreter))
  )
    return undefined
  if (r.port !== undefined && (!Number.isInteger(r.port) || r.port < 1 || r.port > 65535)) return undefined
  return {
    version: 1,
    entrypoint: r.entrypoint,
    ...(r.interpreter ? { interpreter: r.interpreter.trim() } : {}),
    ...(r.port ? { port: r.port } : {}),
  }
}

export function createManagedStreamlitAction(
  id: string,
  name: string,
  recipe: StreamlitRecipe,
): OpenChamberProjectAction {
  return {
    id,
    name,
    command: `python -m streamlit run ${quote(recipe.entrypoint)}`,
    icon: "server",
    autoOpenUrl: true,
    waitForUrl: true,
    shell: "posix",
    streamlit: recipe,
  }
}

export async function streamlitRunCommand(input: StreamlitRecipe, token: string, setup = false): Promise<string> {
  const recipe = sanitizeStreamlitRecipe(input)
  if (!recipe || !/^[a-zA-Z0-9-]+$/.test(token)) throw new Error("Invalid Streamlit recipe")
  const compressed = new Response(new TextEncoder().encode(runner)).body!.pipeThrough(new CompressionStream("deflate"))
  const bytes = new Uint8Array(await new Response(compressed).arrayBuffer())
  const encoded = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
  const bootstrap = `import base64,zlib;exec(zlib.decompress(base64.b64decode(${JSON.stringify(encoded)})))`
  const missing = `AX_CODE_STREAMLIT ${JSON.stringify({ token, stage: "failed", code: "python" })}`
  // A subshell avoids changing the user's shell variables. Newlines keep PTY input
  // lines bounded; every argument (including source) remains a single quoted value.
  const choose = recipe.interpreter
    ? `ax_streamlit_python=${quote(recipe.interpreter)}`
    : `if [ -x .venv/bin/python ]; then ax_streamlit_python=.venv/bin/python; elif [ -x venv/bin/python ]; then ax_streamlit_python=venv/bin/python; elif command -v python3 >/dev/null 2>&1; then ax_streamlit_python=python3; else ax_streamlit_python=python; fi`
  return `(\n${choose}\nif command -v "$ax_streamlit_python" >/dev/null 2>&1 && "$ax_streamlit_python" -c 'import sys;sys.exit(sys.version_info < (3, 11))' >/dev/null 2>&1; then\n"$ax_streamlit_python" -c ${quote(bootstrap)} ${quote(JSON.stringify({ ...recipe, token, setup }))}\nelse\nprintf '%s\\n' ${quote(missing)}\nexit 1\nfi\n)`
}

export type StreamlitProgress = {
  stage: "preparing" | "installing" | "setup-required" | "launching" | "failed"
  source?: "uv" | "requirements" | "simple"
  code?: string
  url?: string
}

export function streamlitProgress(output: string, token: string): StreamlitProgress[] {
  const result: StreamlitProgress[] = []
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith("AX_CODE_STREAMLIT ")) continue
    try {
      const event = JSON.parse(line.slice(18))
      if (
        event.token !== token ||
        !["preparing", "installing", "setup-required", "launching", "failed"].includes(event.stage)
      )
        continue
      if (event.stage === "launching") {
        const url = new URL(event.url)
        if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.username || url.password)
          continue
      }
      result.push(event)
    } catch {
      /* Partial terminal lines are retained by the caller. */
    }
  }
  return result
}
