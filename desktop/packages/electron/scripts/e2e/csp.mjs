/** Sources of one directive in a (possibly combined, comma-joined) CSP header value. */
export const parseCspDirectiveSources = (csp, name) => {
  const wanted = String(name).toLowerCase()
  const sources = []
  for (const policy of String(csp || "").split(",")) {
    for (const part of policy.split(";")) {
      const tokens = part.trim().split(/\s+/).filter(Boolean)
      if (tokens.length > 0 && tokens[0].toLowerCase() === wanted) sources.push(...tokens.slice(1))
    }
  }
  return sources
}
