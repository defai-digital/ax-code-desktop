import fs from "fs"
import path from "path"

const fail = (code, message) => {
  throw Object.assign(new Error(message), { code })
}
const inside = (root, target) => {
  const relative = path.relative(root, target)
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

const matchesHandle = (entry, stat) => entry.isFile() && entry.dev === stat.dev && entry.ino === stat.ino

const openNoFollow = async (filePath, label, fsPromises) => {
  try {
    return await fsPromises.open(
      filePath,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0),
    )
  } catch (error) {
    if (error?.code === "ELOOP" || error?.code === "EISDIR") fail("NOT_REGULAR_FILE", `${label} is not a regular file`)
    throw error
  }
}

/** Validate the opened descriptor before reading any bytes. */
export async function readBoundedRegularFile(filePath, { maxBytes, root, label = "File", fsPromises = fs.promises }) {
  const rootReal = root === undefined ? undefined : await fsPromises.realpath(root)
  const handle = await openNoFollow(filePath, label, fsPromises)
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) fail("NOT_REGULAR_FILE", `${label} is not a regular file`)
    const entry = await fsPromises.lstat(filePath)
    if (!entry.isFile()) fail("NOT_REGULAR_FILE", `${label} is not a regular file`)
    const target = await fsPromises.realpath(filePath)
    if (rootReal !== undefined && !inside(rootReal, target)) fail("OUTSIDE_ROOT", `${label} is outside its root`)
    const canonicalEntry = await fsPromises.lstat(target)
    if (!matchesHandle(entry, stat) || !matchesHandle(canonicalEntry, stat)) {
      fail("FILE_CHANGED", `${label} changed while opening`)
    }
    if (stat.size > maxBytes) fail("FILE_TOO_LARGE", `${label} is too large`)
    // Probe beyond the checked size, keeping allocation bounded even if a writer grows the file during the read.
    const buffer = Buffer.alloc(stat.size + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
      if (bytesRead === 0) break
      length += bytesRead
    }
    if (length > stat.size) fail("FILE_CHANGED", `${label} grew while reading`)
    return buffer.subarray(0, length)
  } finally {
    await handle.close()
  }
}
