const legacyQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
const quote = (value: string) => {
  const single = legacyQuote(value)
  const double = `"${value.replace(/[\\$`"]/g, (character) => `\\${character}`)}"`
  return single.length <= double.length ? single : double
}
const safeText = (value: string) =>
  !Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)

/** Convert retired version-1 metadata once; never execute or provision anything. */
type MigratedAction = { command: string; openUrl?: string; shell?: "posix" }
export function migrateLegacyProjectAction(command: string, metadata: unknown): MigratedAction {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return { command }
  const recipe = metadata as { version?: unknown; entrypoint?: unknown; interpreter?: unknown; port?: unknown }
  const entrypoint = recipe.entrypoint
  if (
    recipe.version !== 1 ||
    typeof entrypoint !== "string" ||
    !safeText(entrypoint) ||
    !entrypoint.endsWith(".py") ||
    entrypoint.length > 1000 ||
    entrypoint.startsWith("/") ||
    entrypoint.startsWith("-") ||
    entrypoint.split(/[\\/]/).includes("..") ||
    (recipe.interpreter !== undefined &&
      (typeof recipe.interpreter !== "string" || !recipe.interpreter.trim() || !safeText(recipe.interpreter))) ||
    (recipe.port !== undefined &&
      (typeof recipe.port !== "number" || !Number.isInteger(recipe.port) || recipe.port < 1 || recipe.port > 65535))
  )
    return { command }
  // User-edited commands are opaque and take precedence over stale metadata.
  if (command !== `python -m streamlit run ${legacyQuote(entrypoint)}`) return { command }
  const port = recipe.port ?? 8501
  const args = `-m streamlit run ${quote(entrypoint)} --server.address=127.0.0.1 --server.headless=true --server.port=${port}`
  const migrated =
    typeof recipe.interpreter === "string"
      ? `${quote(recipe.interpreter.trim())} ${args}`
      : `(if [ -x .venv/bin/python ]; then ax_project_python=.venv/bin/python; elif [ -x venv/bin/python ]; then ax_project_python=venv/bin/python; else ax_project_python=python3; fi; "$ax_project_python" ${args})`
  return { command: migrated, openUrl: `http://127.0.0.1:${port}/`, shell: "posix" }
}
