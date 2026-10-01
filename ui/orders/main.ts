import { App } from '@modelcontextprotocol/ext-apps';
import '../shared/styles.css';
import { ordersHtml, type OrdersView } from '../shared/render.ts';

const root = document.getElementById('root')!;
const app = new App({ name: 'counterpart-orders', version: '0.1.0' });

// Assigned before connecting so the first result is not lost.
app.ontoolresult = result => {
  const data = result.structuredContent as OrdersView | undefined;
  root.innerHTML = data ? ordersHtml(data) : '<p class="empty">No data yet.</p>';
};

void app.connect();
