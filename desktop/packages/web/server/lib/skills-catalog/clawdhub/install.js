/**
 * ClawdHub skill installation
 *
 * Downloads skills from ClawdHub as ZIP files and extracts them
 * to the appropriate skill directory.
 */

import fs from "fs"
import os from "os"
import path from "path"
import AdmZip from "adm-zip"

import { downloadClawdHubSkill, fetchClawdHubSkillInfo } from "./api.js"
import {
  ensureDir,
  getCatalogItemFromSkillDocument,
  getTargetSkillDir,
  isEnglishOnlyCatalogItem,
  normalizeRepoRelativePath,
  normalizeUserSkillDir,
  safeRm,
  validateSkillName,
} from "../shared.js"

// The high 16 bits of a ZIP entry's external attributes are its Unix mode. A symbolic-link entry passes
// the path-string check below and AdmZip then creates a real link in the skill directory pointing wherever
// the archive says — the escape the GitHub install path already refuses with `lstat().isSymbolicLink()`.
const S_IFMT = 0o170000
const S_IFLNK = 0o120000

export function validateClawdHubZipEntries(zip) {
  for (const entry of zip.getEntries()) {
    if (!normalizeRepoRelativePath(entry.entryName)) {
      return { ok: false, reason: `Invalid ZIP entry path: ${entry.entryName}` }
    }
    if (((entry.attr >>> 16) & S_IFMT) === S_IFLNK) {
      return { ok: false, reason: `Skill package contains a symbolic link: ${entry.entryName}` }
    }
  }
  return { ok: true }
}

/**
 * Install skills from ClawdHub registry
 * @param {Object} options
 * @param {string} options.scope - 'user' or 'project'
 * @param {string} [options.targetSource] - 'ax-code' or 'agents'
 * @param {string} [options.workingDirectory] - Required for project scope
 * @param {string} options.userSkillDir - User skills directory
 * @param {Array} options.selections - Array of { skillDir, clawdhub: { slug, version } }
 * @param {string} [options.conflictPolicy] - 'prompt', 'skipAll', or 'overwriteAll'
 * @param {Object} [options.conflictDecisions] - Per-skill conflict decisions
 * @returns {Promise<{ ok: boolean, installed?: Array, skipped?: Array, error?: Object }>}
 */
export async function installSkillsFromClawdHub({
  scope,
  targetSource,
  workingDirectory,
  userSkillDir,
  selections,
  conflictPolicy,
  conflictDecisions,
} = {}) {
  if (scope !== "user" && scope !== "project") {
    return { ok: false, error: { kind: "invalidSource", message: "Invalid scope" } }
  }

  if (targetSource !== undefined && targetSource !== "ax-code" && targetSource !== "agents") {
    return { ok: false, error: { kind: "invalidSource", message: "Invalid target source" } }
  }

  if (!userSkillDir) {
    return { ok: false, error: { kind: "unknown", message: "userSkillDir is required" } }
  }

  const normalizedUserSkillDir = normalizeUserSkillDir(userSkillDir)
  if (normalizedUserSkillDir) {
    userSkillDir = normalizedUserSkillDir
  }

  if (scope === "project" && !workingDirectory) {
    return { ok: false, error: { kind: "invalidSource", message: "Project installs require a directory parameter" } }
  }

  const requestedSkills = Array.isArray(selections) ? selections : []
  if (requestedSkills.length === 0) {
    return { ok: false, error: { kind: "invalidSource", message: "No skills selected for installation" } }
  }

  // Build installation plans
  const skillPlans = requestedSkills.map((sel) => {
    const slug = sel.clawdhub?.slug || sel.skillDir
    const version = sel.clawdhub?.version || "latest"
    return {
      slug,
      version,
      installable: validateSkillName(slug),
    }
  })

  // Check for conflicts before downloading
  const conflicts = []
  for (const plan of skillPlans) {
    if (!plan.installable) {
      continue
    }

    const targetDir = getTargetSkillDir({ scope, targetSource, workingDirectory, userSkillDir, skillName: plan.slug })
    if (fs.existsSync(targetDir)) {
      const decision = conflictDecisions?.[plan.slug]
      const hasAutoPolicy = conflictPolicy === "skipAll" || conflictPolicy === "overwriteAll"
      if (!decision && !hasAutoPolicy) {
        conflicts.push({ skillName: plan.slug, scope, source: targetSource === "agents" ? "agents" : "ax-code" })
      }
    }
  }

  if (conflicts.length > 0) {
    return {
      ok: false,
      error: {
        kind: "conflicts",
        message: "Some skills already exist in the selected scope",
        conflicts,
      },
    }
  }

  const installed = []
  const skipped = []

  for (const plan of skillPlans) {
    if (!plan.installable) {
      skipped.push({ skillName: plan.slug, reason: "Invalid skill name" })
      continue
    }

    try {
      // Resolve 'latest' version if needed
      let resolvedVersion = plan.version
      if (resolvedVersion === "latest") {
        try {
          const info = await fetchClawdHubSkillInfo(plan.slug)
          const latest = info.skill?.tags?.latest || info.latestVersion?.version || null
          if (latest) {
            resolvedVersion = latest
          }
        } catch {
          // ignore
        }

        if (resolvedVersion === "latest") {
          skipped.push({ skillName: plan.slug, reason: "Unable to resolve latest version" })
          continue
        }
      }

      const targetDir = getTargetSkillDir({ scope, targetSource, workingDirectory, userSkillDir, skillName: plan.slug })
      const exists = fs.existsSync(targetDir)

      // Determine conflict resolution
      let decision = conflictDecisions?.[plan.slug] || null
      if (!decision) {
        if (exists && conflictPolicy === "skipAll") decision = "skip"
        if (exists && conflictPolicy === "overwriteAll") decision = "overwrite"
        if (!exists) decision = "overwrite" // No conflict, proceed
      }

      if (exists && decision === "skip") {
        skipped.push({ skillName: plan.slug, reason: "Already installed (skipped)" })
        continue
      }

      // Download the skill ZIP
      const zipBuffer = await downloadClawdHubSkill(plan.slug, resolvedVersion)

      // Extract to a temp directory first for validation
      const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), `clawdhub-${plan.slug}-`))
      let movedToTarget = false

      try {
        const zip = new AdmZip(Buffer.from(zipBuffer))
        const zipValidation = validateClawdHubZipEntries(zip)
        if (!zipValidation.ok) {
          skipped.push({ skillName: plan.slug, reason: zipValidation.reason })
          continue
        }

        zip.extractAllTo(tempDir, true)

        // Verify SKILL.md exists
        const skillMdPath = path.join(tempDir, "SKILL.md")
        if (!fs.existsSync(skillMdPath)) {
          skipped.push({ skillName: plan.slug, reason: "SKILL.md not found in downloaded package" })
          continue
        }

        const skillMdContent = await fs.promises.readFile(skillMdPath, "utf8")
        const catalogItem = getCatalogItemFromSkillDocument({
          source: "clawdhub:registry",
          effectiveSubpath: null,
          skillDir: plan.slug,
          skillMdContent,
        })
        if (!isEnglishOnlyCatalogItem(catalogItem)) {
          skipped.push({ skillName: plan.slug, reason: "Skill catalog metadata must be English-only" })
          continue
        }

        // The installed copy is only removed once the replacement is downloaded, extracted and
        // validated: removing it before the download meant a network error, a yanked version or a bad
        // ZIP left the user with no skill at all while the result reported it as merely "skipped".
        // It still has to go before the rename, which cannot land on a non-empty directory.
        if (exists && decision === "overwrite") {
          await safeRm(targetDir)
        }

        // Move to target directory. tempDir lives under os.tmpdir(), which on
        // many Linux setups is a separate (tmpfs) filesystem from the target
        // skill directory, so a plain rename can fail with EXDEV. Fall back to
        // a recursive copy + cleanup in that case instead of surfacing a
        // spurious "failed to install" error for a perfectly good download.
        await ensureDir(path.dirname(targetDir))
        try {
          await fs.promises.rename(tempDir, targetDir)
        } catch (renameError) {
          if (renameError?.code !== "EXDEV") {
            throw renameError
          }
          await fs.promises.cp(tempDir, targetDir, { recursive: true })
          await safeRm(tempDir)
        }
        movedToTarget = true

        installed.push({ skillName: plan.slug, scope, source: targetSource === "agents" ? "agents" : "ax-code" })
      } catch (extractError) {
        await safeRm(tempDir)
        throw extractError
      } finally {
        if (!movedToTarget) {
          await safeRm(tempDir)
        }
      }
    } catch (error) {
      console.error(`Failed to install ClawdHub skill "${plan.slug}":`, error)
      skipped.push({
        skillName: plan.slug,
        reason: error instanceof Error ? error.message : "Failed to download or extract skill",
      })
    }
  }

  return { ok: true, installed, skipped }
}
