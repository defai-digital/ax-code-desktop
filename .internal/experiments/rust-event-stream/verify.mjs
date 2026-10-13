import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const manifest = path.join(root, ".internal/experiments/rust-event-stream/Cargo.toml")
const target = path.join(root, ".tmp/rust-event-stream-target")
for (const args of [
  ["test", "--release", "--locked", "--manifest-path", manifest, "--target-dir", target],
  ["build", "--release", "--locked", "--manifest-path", manifest, "--target-dir", target],
]) {
  const result = spawnSync("cargo", args, { stdio: "inherit", cwd: root })
  if (result.error || result.status !== 0) process.exit(result.status ?? 1)
}
const result = spawnSync(
  process.execPath,
  ["--test", path.join(root, ".internal/experiments/rust-event-stream/native-client.test.mjs")],
  { stdio: "inherit", cwd: root },
)
process.exit(result.status ?? 1)
