import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { uiBundlePath } from '../src/tools/ui-assets.js';

/** The MCP Apps tests read the built bundles. If they are missing, they are built once. */
export default function setup(): void {
  const missing = (['snapshot', 'sales-report', 'setup'] as const).some(name => !fs.existsSync(uiBundlePath(name)));
  if (missing) execSync('npm run build:ui', { stdio: 'inherit' });
}
