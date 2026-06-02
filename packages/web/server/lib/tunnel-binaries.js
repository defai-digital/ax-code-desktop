import fs from 'fs';
import path from 'path';

function resolveWindowsExtensions(env) {
  return (env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
    .split(';')
    .map((ext) => ext.trim().toLowerCase())
    .filter(Boolean)
    .map((ext) => (ext.startsWith('.') ? ext : `.${ext}`));
}

export async function searchPathForBinary(command, {
  env = process.env,
  platform = process.platform,
  fsImpl = fs,
} = {}) {
  const pathValue = env.PATH || '';
  const segments = pathValue.split(path.delimiter).filter(Boolean);
  const extensions = platform === 'win32' ? resolveWindowsExtensions(env) : [''];

  for (const dir of segments) {
    for (const ext of extensions) {
      const fileName = platform === 'win32' ? `${command}${ext}` : command;
      const candidate = path.join(dir, fileName);
      try {
        const stats = fsImpl.statSync(candidate);
        if (!stats.isFile()) {
          continue;
        }
        if (platform !== 'win32') {
          try {
            fsImpl.accessSync(candidate, fs.constants.X_OK);
          } catch {
            continue;
          }
        }
        return candidate;
      } catch {
        continue;
      }
    }
  }

  return null;
}
