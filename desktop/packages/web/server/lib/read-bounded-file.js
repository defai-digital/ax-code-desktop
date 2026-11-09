import fs from "fs"
import path from "path"

const fail = (code, message) => {
  throw Object.assign(new Error(message), { code })
}
const inside = (root, target) => {
  const relative = path.relative(root, target)
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

/** Verify and read one handle: path replacement and file growth must not bypass type, containment or size checks. */
export async function readBoundedRegularFile(filePath, { maxBytes, root, label = "File", fsPromises = fs.promises }) {
  const entry = await fsPromises.lstat(filePath)
  if (!entry.isFile()) fail("NOT_REGULAR_FILE", `${label} is not a regular file`)
  const target = await fsPromises.realpath(filePath)
  const rootReal = root === undefined ? undefined : await fsPromises.realpath(root)
  if (rootReal !== undefined && !inside(rootReal, target)) fail("OUTSIDE_ROOT", `${label} is outside its root`)
  const handle = await fsPromises.open(
    filePath,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0),
  )
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) fail("NOT_REGULAR_FILE", `${label} is not a regular file`)
    if (stat.dev !== entry.dev || stat.ino !== entry.ino || await fsPromises.realpath(filePath) !== target)
      fail("FILE_CHANGED", `${label} changed while opening`)
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
