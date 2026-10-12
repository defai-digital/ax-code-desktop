export function assertSupportedWindowsTarget(args, host = process) {
  const windows =
    args.includes("--win") ||
    args.some((arg) => arg.startsWith("--win=")) ||
    args.includes("-w") ||
    (!args.some(
      (arg) => ["--mac", "-m", "--linux", "-l"].includes(arg) || arg.startsWith("--mac=") || arg.startsWith("--linux="),
    ) &&
      host.platform === "win32")
  if (!windows) return
  const unsupported = args.some((arg) => ["--arm64", "--armv7l", "--ia32", "--universal"].includes(arg))
  if (unsupported || (!args.includes("--x64") && host.arch !== "x64")) {
    throw new Error("AX Code Desktop supports Windows x64 only. Package with --win --x64.")
  }
}
