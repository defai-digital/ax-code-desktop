/**
 * Answer an unexpected failure with a stable message and log the detail. The raw exception
 * message can carry absolute paths (fs errors, the quota module specifier), and the sibling
 * ax-code routes keep it out of the response for the same reason.
 */
const sendQuotaError = (res, message, error) => {
  console.error(`${message}:`, error)
  if (res.headersSent) {
    return
  }
  res.status(500).json({ error: message })
}

export function registerQuotaRoutes(app, { getQuotaProviders }) {
  app.get("/api/quota/providers", async (_req, res) => {
    try {
      const { listConfiguredQuotaProviders } = await getQuotaProviders()
      const providers = listConfiguredQuotaProviders()
      res.json({ providers })
    } catch (error) {
      sendQuotaError(res, "Failed to list quota providers", error)
    }
  })

  app.get("/api/quota/:providerId", async (req, res) => {
    try {
      const { providerId } = req.params
      if (!providerId) {
        return res.status(400).json({ error: "Provider ID is required" })
      }
      const { fetchQuotaForProvider } = await getQuotaProviders()
      const result = await fetchQuotaForProvider(providerId)
      res.json(result)
    } catch (error) {
      sendQuotaError(res, "Failed to fetch quota", error)
    }
  })
}
