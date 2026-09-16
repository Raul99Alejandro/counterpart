import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';

export const UI = {
  snapshot: 'ui://counterpart/snapshot.html',
  salesReport: 'ui://counterpart/sales-report.html'
} as const;

/** Raíz del paquete: sube hasta encontrar package.json. Sirve igual desde src/ que desde dist/. */
export function packageRoot(from: string = import.meta.dirname): string {
  let dir = from;
  while (!fsSync.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('no se encontró package.json');
    dir = parent;
  }
  return dir;
}

export function uiBundlePath(name: 'snapshot' | 'sales-report'): string {
  return path.join(packageRoot(), 'build', 'ui', name, 'index.html');
}

export function registerUiResources(server: McpServer): void {
  const pages = [['snapshot', UI.snapshot], ['sales-report', UI.salesReport]] as const;
  for (const [name, uri] of pages) {
    registerAppResource(server, `Counterpart ${name}`, uri, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
      contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: await fs.readFile(uiBundlePath(name), 'utf8') }]
    }));
  }
}
