import { App } from '@modelcontextprotocol/ext-apps';
import '../shared/styles.css';
import { setupHtml, type SetupView } from '../shared/render.ts';

const root = document.getElementById('root')!;
const app = new App({ name: 'counterpart-setup', version: '0.1.0' });

// Se asigna antes de conectar para no perder el primer resultado.
app.ontoolresult = result => {
  const data = result.structuredContent as SetupView | undefined;
  root.innerHTML = data ? setupHtml(data) : '<p class="empty">No draft yet.</p>';
};

void app.connect();
