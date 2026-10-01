import { App } from '@modelcontextprotocol/ext-apps';
import '../shared/styles.css';
import { salesReportHtml, type SalesReportView } from '../shared/render.ts';

const root = document.getElementById('root')!;
const app = new App({ name: 'counterpart-sales-report', version: '0.1.0' });

// Assigned before connecting so the first result is not lost.
app.ontoolresult = result => {
  const data = result.structuredContent as SalesReportView | undefined;
  root.innerHTML = data ? salesReportHtml(data) : '<p class="empty">No data yet.</p>';
};

void app.connect();
