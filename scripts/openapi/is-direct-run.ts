import { realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * True when the current module was launched as the process entrypoint
 * (`tsx scripts/foo.ts`), not when imported by tests or another script.
 */
export function isDirectRun(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    const modulePath = realpathSync(fileURLToPath(metaUrl));
    const entryPath = realpathSync(isAbsolute(entry) ? entry : resolve(entry));
    return modulePath === entryPath;
  } catch {
    return false;
  }
}
