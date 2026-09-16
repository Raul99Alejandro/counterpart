import { describe, expect, it } from 'vitest';
import { escapeHtml, money, salesChartSvg, salesReportHtml, snapshotHtml } from '../../ui/shared/render.js';

const emptySnapshot = { todayRevenueCents: 0, sameDayLastWeekCents: 0, byStage: [], dueToday: [], low: [] };

describe('render de las UIs', () => {
  it('formatea dinero con separador de miles', () => {
    expect(money(123456)).toBe('$1,234.56');
    expect(money(5)).toBe('$0.05');
  });

  it('escapa HTML', () => {
    expect(escapeHtml(`<b>"x" & 'y'</b>`)).toBe('&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
  });

  it('no inyecta HTML de los datos', () => {
    const html = snapshotHtml({
      ...emptySnapshot,
      byStage: [{ stage: 'x', label: '<img src=x onerror=alert(1)>', count: 1 }]
    });
    expect(html).not.toContain('<img');
  });

  it('muestra estados vacíos en el resumen', () => {
    const html = snapshotHtml(emptySnapshot);
    expect(html).toContain('Nothing open.');
    expect(html).toContain('Nothing due today.');
    expect(html).toContain('Stock looks fine.');
  });

  it('dibuja una barra por día y nunca produce NaN', () => {
    expect(salesChartSvg([])).toContain('No sales in this period');
    expect(salesChartSvg([{ date: '2026-09-15', cents: 0 }])).not.toContain('NaN');
    const svg = salesChartSvg([
      { date: '2026-09-14', cents: 1000 }, { date: '2026-09-15', cents: 3000 }, { date: '2026-09-16', cents: 2000 }
    ]);
    expect(svg.match(/<rect/g)).toHaveLength(3);
    expect(svg).not.toContain('NaN');
  });

  it('omite la comparación cuando no hay periodo anterior', () => {
    const html = salesReportHtml({
      from: '2026-09-14', to: '2026-09-20', prevFrom: '2026-09-07', prevTo: '2026-09-13',
      totalCents: 5000, prevTotalCents: 0, count: 2, averageTicketCents: 2500, daily: [], topItems: []
    });
    expect(html).not.toContain('%');
    expect(html).toContain('No items sold.');
  });
});
