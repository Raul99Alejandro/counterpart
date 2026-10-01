import path from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One UI per run: `UI_NAME=snapshot`, `sales-report` or `setup` (MCP Apps), or `demo` (the judges' page).
const NAMES = ['snapshot', 'sales-report', 'setup', 'demo'];
const name = process.env.UI_NAME;
if (!name || !NAMES.includes(name)) {
  throw new Error(`UI_NAME must be one of: ${NAMES.join(', ')}`);
}

export default defineConfig({
  root: path.resolve(import.meta.dirname, name),
  plugins: [viteSingleFile()],
  build: {
    outDir: path.resolve(import.meta.dirname, '..', 'build', 'ui', name),
    emptyOutDir: true,
    target: 'es2022'
  }
});
