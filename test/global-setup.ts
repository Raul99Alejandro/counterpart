import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { uiBundlePath } from '../src/tools/ui-assets.js';

/** Las pruebas de MCP Apps leen los bundles construidos. Si faltan, se construyen una sola vez. */
export default function setup(): void {
  const missing = (['snapshot', 'sales-report', 'setup'] as const).some(name => !fs.existsSync(uiBundlePath(name)));
  if (missing) execSync('npm run build:ui', { stdio: 'inherit' });
}
