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

  // Mirrors the repository installer: a decision is exactly "skip", "overwrite" or absent.
  // Any other truthy client value used to pass the conflict gate and then do neither.
  const normalizeConflictDecision = (value) => {
    const trimmed = typeof value === "string" ? value.trim() : ""
    return trimmed === "skip" || trimmed === "overwrite" ? trimmed : null
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
      const decision = normalizeConflictDecision(conflictDecisions?.[plan.slug])
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
  // One target directory per slug: a request that names the same slug twice used to install it once and then
  // rename the second download onto the directory the first had just filled, which answers with the raw
  // `ENOTEMPTY` the rename throws (or installs it twice under `overwriteAll`). The repository installer carries
  // the same guard for the same reason.
  const claimedSkillNames = new Set()

  for (const plan of skillPlans) {
    if (!plan.installable) {
      skipped.push({ skillName: plan.slug, reason: "Invalid skill name" })
      continue
    }
    if (claimedSkillNames.has(plan.slug)) {
      skipped.push({ skillName: plan.slug, reason: "Another selected directory installs to the same skill name" })
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
      let decision = normalizeConflictDecision(conflictDecisions?.[plan.slug])
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
      let backupDir = null
      // Declared beside the backup, not inside the `try`: the `finally` that decides the backup's fate has to be
      // able to see it.
      let restoredIntoPlace = false

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

        // Claimed only once this selection is actually going to install: every check above can skip it, and a slug
        // held by a selection that installed nothing made a later one for the same slug read as a duplicate of an
        // install that never happened. The repository installer claims at its own equivalent point — after its
        // SKILL.md and English-only checks — and releases the name when nothing landed.
        claimedSkillNames.add(plan.slug)

        // Re-check the target after the network download and extraction: another install (or
        // the user) may have created it meanwhile. The stale `exists` made the rename fail with
        // ENOTEMPTY; under overwrite it backed up and replaced content a concurrent install had
        // just reported as successful.
        const targetExistsForReplacement = fs.existsSync(targetDir)
        if (targetExistsForReplacement && decision !== "overwrite") {
          // No decision was made (the target did not exist when asked), or it says skip. A copy
          // over a live directory is not a replacement, and this path has no policy for it.
          skipped.push({ skillName: plan.slug, reason: "Already installed (skipped)" })
          continue
        }

        // The installed copy is only removed once the replacement is downloaded, extracted and
        // validated: removing it before the download meant a network error, a yanked version or a bad
        // ZIP left the user with no skill at all while the result reported it as merely "skipped".
        // It still has to go before the rename, which cannot land on a non-empty directory — so it is
        // kept as a backup until the replacement is in place. The move itself can fail too (a
        // cross-device copy out of space, a directory that reappeared under the target), and that was
        // the same loss one step later.
        let backupSkillDir = null
        if (targetExistsForReplacement && decision === "overwrite") {
          backupDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), `clawdhub-replaced-${plan.slug}-`))
          backupSkillDir = path.join(backupDir, "skill")
          try {
            await fs.promises.cp(targetDir, backupSkillDir, { recursive: true })
          } catch (backupError) {
            // The backup copy can fail on its own (no space, a permission it cannot read). The installed copy is
            // untouched, so the partial backup is the only copy of nothing — and the `finally` below keeps the
            // backup whenever the replacement did not land, which left a `clawdhub-replaced-*` directory behind on
            // every such failure.
            await safeRm(backupDir)
            backupDir = null
            backupSkillDir = null
            throw backupError
          }
          await safeRm(targetDir)
        }

        // Move to target directory. tempDir lives under os.tmpdir(), which on
        // many Linux setups is a separate (tmpfs) filesystem from the target
        // skill directory, so a plain rename can fail with EXDEV. Fall back to
        // a recursive copy + cleanup in that case instead of surfacing a
        // spurious "failed to install" error for a perfectly good download.
        await ensureDir(path.dirname(targetDir))
        try {
          try {
            await fs.promises.rename(tempDir, targetDir)
          } catch (renameError) {
            if (renameError?.code !== "EXDEV") {
              throw renameError
            }
            await fs.promises.cp(tempDir, targetDir, { recursive: true })
            await safeRm(tempDir)
          }
        } catch (moveError) {
          if (backupSkillDir) {
            // The failed move may have left a partial copy behind; put the installed copy back. Whether that
            // worked decides what happens to the backup below — it is the only complete copy until it does.
            await safeRm(targetDir)
            restoredIntoPlace = await fs.promises
              .cp(backupSkillDir, targetDir, { recursive: true })
              .then(() => true)
              .catch(() => false)
            if (!restoredIntoPlace) {
              console.warn(
                `[skills] Restoring the replaced copy of "${plan.slug}" failed; it is kept at ${backupSkillDir}`,
              )
            }
          }
          throw moveError
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
        // Kept when restoring the replaced copy failed: it is the user's only complete copy of the skill, and
        // the finally used to delete it while the restore's rejection was swallowed.
        if (backupDir && (movedToTarget || restoredIntoPlace)) {
          await safeRm(backupDir)
        }
      }
    } catch (error) {
      console.error(`Failed to install ClawdHub skill "${plan.slug}":`, error)
      // Nothing landed, so the slug is free for a later selection that might install it: holding it made a second
      // entry for the same slug read as a duplicate of an install that failed, and the user got neither version.
      claimedSkillNames.delete(plan.slug)
      skipped.push({
        skillName: plan.slug,
        reason: error instanceof Error ? error.message : "Failed to download or extract skill",
      })
    }
  }

  return { ok: true, installed, skipped }
}
