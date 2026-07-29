// Cross-platform "is this file being run directly?" check. The common
// `import.meta.url === \`file://${process.argv[1]}\`` pattern breaks on
// Windows: import.meta.url is a proper file:// URL (drive letters
// percent-encoded, forward slashes) while process.argv[1] is a raw OS path
// (backslashes, unencoded drive letter) — they never compare equal there.
// Normalizing both to a real filesystem path via fileURLToPath/path.resolve
// works the same way on all three platforms.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function isMainModule(importMetaUrl) {
  if (!process.argv[1]) {
    return false;
  }
  return fileURLToPath(importMetaUrl) === path.resolve(process.argv[1]);
}
