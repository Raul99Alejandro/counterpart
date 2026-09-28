import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';

export const UI = {
  snapshot: 'ui://counterpart/snapshot.html',
  salesReport: 'ui://counterpart/sales-report.html',
  setup: 'ui://counterpart/setup.html'
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

export type UiName = 'snapshot' | 'sales-report' | 'setup';

const URI: Record<UiName, string> = { snapshot: UI.snapshot, 'sales-report': UI.salesReport, setup: UI.setup };

export function uiBundlePath(name: UiName): string {
  return path.join(packageRoot(), 'build', 'ui', name, 'index.html');
}

/** Páginas ya registradas por servidor. La llave es `server.server`: igual a través del proxy de `instrument`. */
const registered = new WeakMap<object, Set<UiName>>();

/** Registra las páginas pedidas una sola vez por servidor: pedir dos veces la misma no hace nada. */
export function registerUiResources(server: McpServer, names: UiName[]): void {
  const done = registered.get(server.server) ?? new Set<UiName>();
  registered.set(server.server, done);
  for (const name of names) {
    if (done.has(name)) continue;
    done.add(name);
    const uri = URI[name];
    registerAppResource(server, `Counterpart ${name}`, uri, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
      contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: await fs.readFile(uiBundlePath(name), 'utf8') }]
    }));
  }
}
