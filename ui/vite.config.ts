import path from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Una UI por corrida: `UI_NAME=snapshot` o `UI_NAME=sales-report`.
const name = process.env.UI_NAME;
if (name !== 'snapshot' && name !== 'sales-report') {
  throw new Error('UI_NAME debe ser "snapshot" o "sales-report"');
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
