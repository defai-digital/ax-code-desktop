// Formatting for the model-metadata panel. The knowledge cutoff (`YYYY-MM`) and the release date
// (`YYYY-MM-DD`) are calendar values, not instants, and both are parsed as UTC: formatting them in
// the machine zone shows the previous month ("Jan 2026" for 2026-02) or the previous day
// ("Dec 31, 2025" for 2026-01-01) anywhere west of UTC. Format in UTC so a label matches the value
// the metadata carries.

const KNOWLEDGE_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

export const formatKnowledge = (knowledge?: string) => {
  if (!knowledge) {
    return "—"
  }

  const match = knowledge.match(/^(\d{4})-(\d{2})$/)
  if (match) {
    const year = Number.parseInt(match[1], 10)
    const monthIndex = Number.parseInt(match[2], 10) - 1
    const knowledgeDate = new Date(Date.UTC(year, monthIndex, 1))
    if (!Number.isNaN(knowledgeDate.getTime())) {
      return KNOWLEDGE_DATE_FORMATTER.format(knowledgeDate)
    }
  }

  return knowledge
}

export const formatDate = (value?: string) => {
  if (!value) {
    return "—"
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return DATE_FORMATTER.format(parsedDate)
}
