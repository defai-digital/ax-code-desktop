import path from "node:path"

// Scripted-session scenario for the Desktop e2e journeys
// (SPEC-2026-10-19-desktop-e2e-journeys-v1). The launcher writes this as JSON
// next to the stub runtime; the stub reads it only when the
// AX_CODE_DESKTOP_E2E_SCENARIO_PATH environment variable points at it. Without
// a scenario the stub behaves exactly like the empty runtime it replaces.

export const E2E_PROJECT_ID = "proj_e2e_scripted"
export const E2E_SESSION_ID = "ses_e2e_scripted"
export const E2E_SESSION_TITLE = "E2E scripted session"
export const E2E_FOREIGN_SESSION_ID = "ses_e2e_foreign"
export const E2E_APPROVE_REQUEST_ID = "perm_e2e_approve"
export const E2E_DENY_REQUEST_ID = "perm_e2e_deny"
export const E2E_APPROVE_PATTERN = "e2e-approve-target.txt"
export const E2E_DENY_PATTERN = "e2e-deny-target.txt"
export const E2E_GOAL_OBJECTIVE = "Ship the scripted e2e session journey"
export const E2E_GOAL_UPDATED_OBJECTIVE = `${E2E_GOAL_OBJECTIVE} (updated)`
export const E2E_GOAL_UPDATED_TOKENS_USED = 200
export const E2E_GOAL_UPDATED_REMAINING_TOKENS = 300
export const E2E_FOREIGN_GOAL_OBJECTIVE = "Foreign goal that must not leak onto the scripted row"
export const E2E_STEP_ROUTE = "/__e2e__/step"

export const buildE2eScenario = ({ directory, now = Date.now(), portfolio = false } = {}) => {
  if (typeof directory !== "string" || !directory.trim()) throw new Error("A scenario project directory is required")
  const time = { created: now, updated: now }
  const scenario = {
    version: 1,
    projectDirectory: directory,
    project: { id: E2E_PROJECT_ID, worktree: directory },
    session: {
      id: E2E_SESSION_ID,
      slug: "e2e-scripted-session",
      projectID: E2E_PROJECT_ID,
      directory,
      title: E2E_SESSION_TITLE,
      version: "0.0.0-e2e",
      time: { ...time },
    },
    approveRequest: {
      id: E2E_APPROVE_REQUEST_ID,
      sessionID: E2E_SESSION_ID,
      permission: "bash",
      patterns: [E2E_APPROVE_PATTERN],
      metadata: {},
      always: [],
    },
    denyRequest: {
      id: E2E_DENY_REQUEST_ID,
      sessionID: E2E_SESSION_ID,
      permission: "edit",
      patterns: [E2E_DENY_PATTERN],
      metadata: {},
      always: [],
    },
    goal: {
      sessionID: E2E_SESSION_ID,
      objective: E2E_GOAL_OBJECTIVE,
      status: "blocked",
      tokenBudget: 500,
      tokensUsed: 125,
      remainingTokens: 375,
      timeUsedSeconds: 65,
      time: { ...time },
    },
    updatedGoal: {
      sessionID: E2E_SESSION_ID,
      objective: E2E_GOAL_UPDATED_OBJECTIVE,
      status: "blocked",
      tokenBudget: 500,
      tokensUsed: E2E_GOAL_UPDATED_TOKENS_USED,
      remainingTokens: E2E_GOAL_UPDATED_REMAINING_TOKENS,
      timeUsedSeconds: 125,
      time: { created: now, updated: now + 120_000 },
    },
    foreignGoal: {
      sessionID: E2E_FOREIGN_SESSION_ID,
      objective: E2E_FOREIGN_GOAL_OBJECTIVE,
      status: "blocked",
      tokenBudget: 900,
      tokensUsed: 10,
      remainingTokens: 890,
      timeUsedSeconds: 5,
      time: { created: now, updated: now + 60_000 },
    },
  }
  if (portfolio) {
    scenario.approveRequest = null
    scenario.session.title = "Review the result"
    const otherDirectory = path.join(path.dirname(directory), "other-project")
    scenario.portfolio = [{
      project: { id: "proj_e2e_other", worktree: otherDirectory },
      session: {
        ...scenario.session, id: "ses_e2e_other", projectID: "proj_e2e_other",
        directory: otherDirectory, slug: "other-project-session",
      },
      goal: { ...scenario.goal, sessionID: "ses_e2e_other" },
    }]
    scenario.portfolioMessages = Object.fromEntries([scenario.session, scenario.portfolio[0].session].map((session, index) => {
      const messageID = `msg_e2e_portfolio_${index}`
      return [session.id, [{
        info: {
          id: messageID, sessionID: session.id, role: "user", time: { created: now },
          agent: "build", model: { providerID: "fixture", modelID: "fixture" },
        },
        parts: [{
          id: `part_e2e_portfolio_${index}`, sessionID: session.id, messageID, type: "text",
          text: `Fixture conversation for project ${index === 0 ? "A" : "B"}`,
        }],
      }]]
    }))
  }
  return scenario
}

/** Parses the stub's reply log: one JSON object per line, blank lines ignored. */
export const parseReplyLog = (text) => {
  const records = []
  for (const line of String(text || "").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    records.push(JSON.parse(trimmed))
  }
  return records
}

/** True when `candidate` resolves strictly inside `directory`. */
export const isPathInsideDirectory = (candidate, directory) => {
  if (typeof candidate !== "string" || !candidate || typeof directory !== "string" || !directory) return false
  const relative = path.relative(path.resolve(directory), path.resolve(candidate))
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)
}

export const assertPathInsideDirectory = (candidate, directory, label = "Path") => {
  if (!isPathInsideDirectory(candidate, directory)) {
    throw new Error(`${label} must be inside ${directory}: ${candidate}`)
  }
  return candidate
}

/**
 * Problems with the recorded attempts for one request. Every attempt the stub
 * received is logged, so exactly one accepted attempt with the renderer's own
 * directory is the only clean outcome; a second (rejected) attempt means the
 * interface submitted twice.
 */
export const findReplyAttemptProblems = (records, { requestID, expectedReply, projectDirectory }) => {
  const attempts = (Array.isArray(records) ? records : []).filter((record) => record?.requestID === requestID)
  const problems = []
  if (attempts.length !== 1) {
    problems.push(`Expected exactly one reply attempt for ${requestID}, found ${attempts.length}`)
    return problems
  }
  const [attempt] = attempts
  if (attempt.accepted !== true) problems.push(`The reply attempt for ${requestID} was not accepted`)
  if (attempt.reply !== expectedReply) {
    problems.push(`Reply for ${requestID} was ${JSON.stringify(attempt.reply)}, not ${JSON.stringify(expectedReply)}`)
  }
  if (attempt.directory !== projectDirectory) {
    problems.push(
      `Reply for ${requestID} sent directory ${JSON.stringify(attempt.directory ?? null)}, not the scenario project`,
    )
  }
  if (attempt.effectiveDirectory !== projectDirectory) {
    problems.push(
      `Reply for ${requestID} took effect in ${JSON.stringify(attempt.effectiveDirectory ?? null)}, not the scenario project`,
    )
  }
  return problems
}
