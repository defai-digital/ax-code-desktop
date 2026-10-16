export const UI_SESSION_COOKIE_NAME = "oc_ui_session"

/**
 * The UI session cookie's name for this request's origin.
 *
 * Browsers key cookies by host, not by port (RFC 6265), so two instances on one machine -
 * `http://192.168.0.1:3000` and `http://192.168.0.1:3001` - shared one cookie: whichever logged in
 * last overwrote the other's token, so the first tab was logged out and the request-security read
 * handed back the other instance's token. The port becomes part of the cookie's name when the
 * request carries one; a host without a port keeps the bare name, which is what a single installed
 * instance addressed by name uses.
 *
 * The forwarded host wins over the Host header so a proxied request is keyed by the origin the
 * browser actually used.
 */
export const resolveUiSessionCookieName = (req, baseName = UI_SESSION_COOKIE_NAME) => {
  const forwarded = req?.headers?.["x-forwarded-host"]
  const rawHost = typeof forwarded === "string" && forwarded.trim() ? forwarded : req?.headers?.host
  const host = typeof rawHost === "string" ? rawHost.split(",")[0].trim() : ""
  if (!host) {
    return baseName
  }

  // An IPv6 literal carries colons of its own, so only a trailing ":<digits>" is a port.
  const port = host.match(/:(\d{1,5})$/)?.[1]
  return port ? `${baseName}_${port}` : baseName
}
