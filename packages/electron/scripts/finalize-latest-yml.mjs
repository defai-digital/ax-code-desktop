#!/usr/bin/env node
/**
 * Merges per-arch latest-mac.yml files (arm64 + x64) produced by separate
 * electron-builder runs into a single latest-mac.yml that electron-updater
 * can use for universal macOS updates.
 *
 * Environment variables (set by CI):
 *   LATEST_YML_DIR      – directory containing downloaded per-arch artifacts
 *   OPENCHAMBER_VERSION – release version string (e.g. "0.5.0")
 *
 * Output: $RUNNER_TEMP/latest-mac.yml
 */
import fs from 'fs'
import path from 'path'
import os from 'os'

const latestYmlDir = process.env.LATEST_YML_DIR
const version = process.env.OPENCHAMBER_VERSION

if (!latestYmlDir) throw new Error('LATEST_YML_DIR is not set')
if (!version) throw new Error('OPENCHAMBER_VERSION is not set')

// electron-updater YAML is simple enough to parse without a YAML library:
// each file entry is an indented object inside a "files:" block.
function parseLatestYml(text) {
  const lines = text.split('\n')
  const result = { files: [] }
  let currentFile = null

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.startsWith('version:')) {
      result.version = line.split(':')[1].trim().replace(/['"]/g, '')
    } else if (line.startsWith('releaseDate:')) {
      result.releaseDate = line.split(':').slice(1).join(':').trim().replace(/['"]/g, '')
    } else if (line.startsWith('files:')) {
      // start of files array
    } else if (/^  - url:/.test(line)) {
      if (currentFile) result.files.push(currentFile)
      currentFile = { url: line.replace(/^  - url:/, '').trim() }
    } else if (/^    sha512:/.test(line) && currentFile) {
      currentFile.sha512 = line.replace(/^    sha512:/, '').trim()
    } else if (/^    size:/.test(line) && currentFile) {
      currentFile.size = Number(line.replace(/^    size:/, '').trim())
    } else if (/^    blockMapSize:/.test(line) && currentFile) {
      currentFile.blockMapSize = Number(line.replace(/^    blockMapSize:/, '').trim())
    } else if (line.startsWith('path:')) {
      result.path = line.split(':')[1].trim().replace(/['"]/g, '')
    } else if (line.startsWith('sha512:')) {
      result.sha512 = line.split(':').slice(1).join(':').trim()
    }
  }
  if (currentFile) result.files.push(currentFile)
  return result
}

function emitYml(obj) {
  const lines = [`version: ${obj.version}`, 'files:']
  for (const f of obj.files) {
    lines.push(`  - url: ${f.url}`)
    lines.push(`    sha512: ${f.sha512}`)
    lines.push(`    size: ${f.size}`)
    if (f.blockMapSize) lines.push(`    blockMapSize: ${f.blockMapSize}`)
  }
  // electron-updater uses the first (or x64) entry as the canonical path/sha512
  const canonical = obj.files.find(f => !f.url.includes('arm64')) ?? obj.files[0]
  lines.push(`path: ${canonical.url}`)
  lines.push(`sha512: ${canonical.sha512}`)
  lines.push(`releaseDate: '${new Date().toISOString()}'`)
  return lines.join('\n') + '\n'
}

// Artifact download-artifact@v4 without merge-multiple creates subdirs named
// after the artifact: latest-yml-aarch64-apple-darwin/latest-mac.yml
const arm64File = path.join(latestYmlDir, 'latest-yml-aarch64-apple-darwin', 'latest-mac.yml')
const x64File = path.join(latestYmlDir, 'latest-yml-x86_64-apple-darwin', 'latest-mac.yml')

if (!fs.existsSync(arm64File)) throw new Error(`Not found: ${arm64File}`)
if (!fs.existsSync(x64File)) throw new Error(`Not found: ${x64File}`)

const arm64 = parseLatestYml(fs.readFileSync(arm64File, 'utf8'))
const x64 = parseLatestYml(fs.readFileSync(x64File, 'utf8'))

// Merge: combine file entries, deduplicate by url
const seenUrls = new Set()
const mergedFiles = []
for (const f of [...x64.files, ...arm64.files]) {
  if (!seenUrls.has(f.url)) {
    seenUrls.add(f.url)
    mergedFiles.push(f)
  }
}

const merged = {
  version,
  files: mergedFiles,
  releaseDate: new Date().toISOString(),
}

const outPath = path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), 'latest-mac.yml')
fs.writeFileSync(outPath, emitYml(merged))
console.log(`[finalize-latest-yml] wrote ${outPath} (${mergedFiles.length} file entries)`)
