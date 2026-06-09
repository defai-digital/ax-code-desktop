import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const targetFiles = [
  'packages/web/src',
  'packages/web/server',
  'packages/electron/src',
];

const disallowedPatterns = [
  /\.\.\/ui\/src\b/,
  /\.\.\/desktop\/src\b/,
];

function collectFiles(baseDir, extensions) {
  const entries = readdirSync(baseDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      files.push(...collectFiles(fullPath, extensions));
      continue;
    }
    if (!extensions.includes(path.extname(entry.name))) {
      continue;
    }
    files.push(fullPath);
  }

  return files;
}

const violations = [];

for (const filePath of targetFiles) {
  const absolute = path.join(ROOT, filePath);
  const files = collectFiles(absolute, ['.ts', '.tsx', '.js', '.jsx']);
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (disallowedPatterns.some((pattern) => pattern.test(line))) {
        violations.push({
          file,
          lineNumber: index + 1,
          lineText: line.trim(),
        });
      }
    });
  }
}

if (violations.length > 0) {
  console.error('Boundary import check failed: sibling-package source imports were found.');
  for (const item of violations) {
    const relative = path.relative(ROOT, item.file);
    console.error(`- ${relative}:${item.lineNumber}: ${item.lineText}`);
  }
  process.exit(1);
}

console.log('Boundary import check passed.');
