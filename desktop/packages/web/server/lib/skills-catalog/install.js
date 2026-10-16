import fs from "fs"
import os from "os"
import path from "path"

import { assertGitAvailable, cloneRepo, looksLikeAuthError, runGit } from "./git.js"
import { parseSkillRepoSource } from "./source.js"
import {
  ensureDir,
  getCatalogItemFromSkillDocument,
  getTargetSkillDir,
  isEnglishOnlyCatalogItem,
  isRepoPathInside,
  normalizeRepoRelativePath,
  normalizeUserSkillDir,
  safeRm,
  toRepoFsPath,
  validateSkillName,
} from "./shared.js"

function isPathInside(candidatePath, parentPath) {
  const normalizedCandidate = path.resolve(candidatePath)
  const normalizedParent = path.resolve(parentPath)
  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}${path.sep}`)
}

async function copyDirectoryNoSymlinks(srcDir, dstDir) {
  const srcReal = await fs.promises.realpath(srcDir)
  await ensureDir(dstDir)

  const walk = async (currentSrc, currentDst) => {
    const entries = await fs.promises.readdir(currentSrc, { withFileTypes: true })
    for (const entry of entries) {
      const nextSrc = path.join(currentSrc, entry.name)
      const nextDst = path.join(currentDst, entry.name)

      const stat = await fs.promises.lstat(nextSrc)
      if (stat.isSymbolicLink()) {
        throw new Error("Symlinks are not supported in skills")
      }

      // Guard against traversal: ensure source is still under srcReal
      const nextRealParent = await fs.promises.realpath(path.dirname(nextSrc))
      if (!isPathInside(nextRealParent, srcReal)) {
        throw new Error("Invalid source path traversal detected")
      }

      if (stat.isDirectory()) {
        await ensureDir(nextDst)
        await walk(nextSrc, nextDst)
        continue
      }

      if (stat.isFile()) {
        await ensureDir(path.dirname(nextDst))
        await fs.promises.copyFile(nextSrc, nextDst)
        try {
          await fs.promises.chmod(nextDst, stat.mode & 0o777)
        } catch {
          // best-effort
        }
        continue
      }

      // Skip other types (sockets, devices, etc.)
    }
  }

  await walk(srcDir, dstDir)
}

export async function installSkillsFromRepository({
  source,
  subpath,
  defaultSubpath,
  identity,
  scope,
  targetSource,
  workingDirectory,
  userSkillDir,
  selections,
  conflictPolicy,
  conflictDecisions,
} = {}) {
  const gitCheck = await assertGitAvailable()
  if (!gitCheck.ok) {
    return { ok: false, error: gitCheck.error }
  }

  const normalizedUserSkillDir = normalizeUserSkillDir(userSkillDir)
  if (normalizedUserSkillDir) {
    userSkillDir = normalizedUserSkillDir
  }

  if (!userSkillDir) {
    return { ok: false, error: { kind: "unknown", message: "userSkillDir is required" } }
  }

  if (scope !== "user" && scope !== "project") {
    return { ok: false, error: { kind: "invalidSource", message: "Invalid scope" } }
  }

  if (targetSource !== undefined && targetSource !== "ax-code" && targetSource !== "agents") {
    return { ok: false, error: { kind: "invalidSource", message: "Invalid target source" } }
  }

  if (scope === "project" && !workingDirectory) {
    return { ok: false, error: { kind: "invalidSource", message: "Project installs require a directory parameter" } }
  }

  const parsed = parseSkillRepoSource(source, { subpath })
  if (!parsed.ok) {
    return { ok: false, error: parsed.error }
  }

  const effectiveSubpath =
    parsed.effectiveSubpath ||
    (typeof defaultSubpath === "string" && defaultSubpath.trim() ? defaultSubpath.trim() : null)

  const cloneUrl = identity?.sshKey ? parsed.cloneUrlSsh : parsed.cloneUrlHttps

  const requestedDirs = Array.isArray(selections)
    ? selections
        .map((s) => normalizeRepoRelativePath(s?.skillDir))
        .filter((skillDir) => typeof skillDir === "string" && isRepoPathInside(skillDir, effectiveSubpath))
    : []
  if (requestedDirs.length === 0) {
    return { ok: false, error: { kind: "invalidSource", message: "No skills selected for installation" } }
  }

  // Validate names early and compute conflicts without mutating.
  const skillPlans = requestedDirs.map((skillDirPosix) => {
    const skillName = path.posix.basename(skillDirPosix)
    return { skillDirPosix, skillName, installable: validateSkillName(skillName) }
  })

  const conflicts = []
  for (const plan of skillPlans) {
    if (!plan.installable) {
      continue
    }

    const targetDir = getTargetSkillDir({
      scope,
      targetSource,
      workingDirectory,
      userSkillDir,
      skillName: plan.skillName,
    })
    if (fs.existsSync(targetDir)) {
      const decision = conflictDecisions?.[plan.skillName]
      const hasAutoPolicy = conflictPolicy === "skipAll" || conflictPolicy === "overwriteAll"
      if (!decision && !hasAutoPolicy) {
        conflicts.push({ skillName: plan.skillName, scope, source: targetSource === "agents" ? "agents" : "ax-code" })
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

  const tempBase = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openchamber-skills-install-"))

  try {
    const cloned = await cloneRepo({ cloneUrl, identity, tempDir: tempBase, timeoutMs: 90_000 })
    if (!cloned.ok) {
      const msg = `${cloned.error?.stderr || ""}\n${cloned.error?.message || ""}`.trim()
      if (looksLikeAuthError(msg)) {
        return {
          ok: false,
          error: { kind: "authRequired", message: "Authentication required to access this repository", sshOnly: true },
        }
      }
      return { ok: false, error: { kind: "networkError", message: msg || "Failed to clone repository" } }
    }

    // Selective checkout for only requested skill dirs.
    await runGit(["-C", tempBase, "sparse-checkout", "init", "--cone"], { identity, timeoutMs: 15_000 })
    const setResult = await runGit(["-C", tempBase, "sparse-checkout", "set", ...requestedDirs], {
      identity,
      timeoutMs: 30_000,
    })
    if (!setResult.ok) {
      return {
        ok: false,
        error: {
          kind: "unknown",
          message: setResult.stderr || setResult.message || "Failed to configure sparse checkout",
        },
      }
    }

    const checkoutResult = await runGit(["-C", tempBase, "checkout", "--force", "HEAD"], {
      identity,
      timeoutMs: 60_000,
    })
    if (!checkoutResult.ok) {
      return {
        ok: false,
        error: {
          kind: "unknown",
          message: checkoutResult.stderr || checkoutResult.message || "Failed to checkout repository",
        },
      }
    }

    const installed = []
    const skipped = []
    // One target directory per skill name: two selected directories whose basename matches share it, and the
    // copy below only overwrites same-named files — the two skills merged into one directory holding files from
    // neither while `installed` listed both.
    const claimedSkillNames = new Set()

    for (const plan of skillPlans) {
      if (!plan.installable) {
        skipped.push({ skillName: plan.skillName, reason: "Invalid skill name (directory basename)" })
        continue
      }
      if (claimedSkillNames.has(plan.skillName)) {
        skipped.push({
          skillName: plan.skillName,
          reason: "Another selected directory installs to the same skill name",
        })
        continue
      }

      const srcDir = toRepoFsPath(tempBase, plan.skillDirPosix)
      const skillMdPath = path.join(srcDir, "SKILL.md")
      if (!fs.existsSync(skillMdPath)) {
        skipped.push({ skillName: plan.skillName, reason: "SKILL.md not found in selected directory" })
        continue
      }

      const skillMdContent = await fs.promises.readFile(skillMdPath, "utf8")
      const catalogItem = getCatalogItemFromSkillDocument({
        source,
        effectiveSubpath,
        skillDir: plan.skillDirPosix,
        skillMdContent,
      })
      if (!isEnglishOnlyCatalogItem(catalogItem)) {
        skipped.push({ skillName: plan.skillName, reason: "Skill catalog metadata must be English-only" })
        continue
      }

      const targetDir = getTargetSkillDir({
        scope,
        targetSource,
        workingDirectory,
        userSkillDir,
        skillName: plan.skillName,
      })
      const exists = fs.existsSync(targetDir)

      let decision = conflictDecisions?.[plan.skillName] || null
      if (!decision) {
        if (exists && conflictPolicy === "skipAll") decision = "skip"
        if (exists && conflictPolicy === "overwriteAll") decision = "overwrite"
        if (!exists) decision = "overwrite" // no conflict, proceed
      }

      if (exists && decision === "skip") {
        skipped.push({ skillName: plan.skillName, reason: "Already installed (skipped)" })
        continue
      }

      // Claimed here rather than when the directory was first seen: a directory that turns out to be
      // uninstallable — no SKILL.md, non-English metadata, or a conflict it skips — must not hold the name
      // against a later directory that would have installed.
      claimedSkillNames.add(plan.skillName)

      let backupDir = null
      let backupSkillDir = null
      let restoredIntoPlace = false
      let copiedIntoPlace = false
      if (exists && decision === "overwrite") {
        // The installed copy goes only once the replacement has landed. `copyDirectoryNoSymlinks` refuses a
        // source that contains a symlink, and that failure used to delete the old copy, fail the copy, delete
        // the target again and report the skill as merely skipped: the user had neither. The ClawdHub path
        // documents the same rule.
        backupDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openchamber-skills-replaced-"))
        backupSkillDir = path.join(backupDir, "skill")
        await fs.promises.cp(targetDir, backupSkillDir, { recursive: true })
        await safeRm(targetDir)
      }

      // Ensure project parent directories exist
      await ensureDir(path.dirname(targetDir))

      try {
        await copyDirectoryNoSymlinks(srcDir, targetDir)
        copiedIntoPlace = true
        installed.push({ skillName: plan.skillName, scope, source: targetSource === "agents" ? "agents" : "ax-code" })
      } catch (error) {
        if (backupSkillDir) {
          await safeRm(targetDir)
          restoredIntoPlace = await fs.promises
            .cp(backupSkillDir, targetDir, { recursive: true })
            .then(() => true)
            .catch(() => false)
        } else {
          await safeRm(targetDir)
        }
        // The name is released when nothing ended up in the target: this directory did not install, and holding
        // the name made a later directory with the same basename — which may be perfectly installable — read as a
        // duplicate. When the old copy was restored the name is still taken by what is on disk.
        if (!restoredIntoPlace) {
          claimedSkillNames.delete(plan.skillName)
        }
        skipped.push({
          skillName: plan.skillName,
          reason: error instanceof Error ? error.message : "Failed to copy skill files",
          ...(backupSkillDir && !restoredIntoPlace ? { keptCopyAt: backupSkillDir } : {}),
        })
      } finally {
        // The backup is the only complete copy of the skill once the replacement has not landed: it is removed
        // when the copy succeeded or when the restore did, and kept (with the skip record pointing at it) when
        // restoring failed too — deleting it there destroyed the last good copy.
        if (backupDir && (copiedIntoPlace || restoredIntoPlace)) {
          await safeRm(backupDir)
        }
      }
    }

    return { ok: true, installed, skipped }
  } finally {
    await safeRm(tempBase)
  }
}
