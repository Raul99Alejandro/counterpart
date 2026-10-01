import path from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One UI per run: `UI_NAME=snapshot`, `UI_NAME=sales-report` or `UI_NAME=setup`.
const name = process.env.UI_NAME;
if (name !== 'snapshot' && name !== 'sales-report' && name !== 'setup') {
  throw new Error('UI_NAME must be "snapshot", "sales-report" or "setup"');
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
