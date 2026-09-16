import { App } from '@modelcontextprotocol/ext-apps';
import '../shared/styles.css';
import { snapshotHtml, type SnapshotView } from '../shared/render.ts';

const root = document.getElementById('root')!;
const app = new App({ name: 'counterpart-snapshot', version: '0.1.0' });

// Se asigna antes de conectar para no perder el primer resultado.
app.ontoolresult = result => {
  const data = result.structuredContent as SnapshotView | undefined;
  root.innerHTML = data ? snapshotHtml(data) : '<p class="empty">No data yet.</p>';
};

void app.connect();
