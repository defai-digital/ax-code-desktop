// Fixture files may select a port, never an arbitrary network destination.
export const parseStubOrigin = (value) => {
  const match = typeof value === "string" ? /^http:\/\/127\.0\.0\.1:([0-9]{1,5})$/.exec(value.trim()) : null
  const port = match ? Number(match[1]) : 0
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid loopback stub origin")
  return `http://127.0.0.1:${port}`
}
