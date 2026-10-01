import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';

export const UI = {
  snapshot: 'ui://counterpart/snapshot.html',
  salesReport: 'ui://counterpart/sales-report.html',
  setup: 'ui://counterpart/setup.html',
  orders: 'ui://counterpart/orders.html'
} as const;

/** Package root: walks up until it finds package.json. Works the same from src/ as from dist/. */
export function packageRoot(from: string = import.meta.dirname): string {
  let dir = from;
  while (!fsSync.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('package.json not found');
    dir = parent;
  }
  return dir;
}

export type UiName = 'snapshot' | 'sales-report' | 'setup' | 'orders';

const URI: Record<UiName, string> = { snapshot: UI.snapshot, 'sales-report': UI.salesReport, setup: UI.setup, orders: UI.orders };

export function uiBundlePath(name: UiName): string {
  return path.join(packageRoot(), 'build', 'ui', name, 'index.html');
}

/** Pages already registered per server. The key is `server.server`: the same through the `instrument` proxy. */
const registered = new WeakMap<object, Set<UiName>>();

/** Registers the requested pages once per server: requesting the same one twice does nothing. */
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
