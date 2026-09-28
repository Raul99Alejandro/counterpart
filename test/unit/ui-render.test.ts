import { describe, expect, it } from 'vitest';
import { escapeHtml, money, salesChartSvg, salesReportHtml, setupHtml, snapshotHtml } from '../../ui/shared/render.js';

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
  it('muestra el borrador: etapas con la de cierre marcada, campos y catálogo', () => {
    const html = setupHtml({
      state: 'ready', businessName: 'Petal and Stem', message: 'Should I turn it on?',
      nouns: { order: 'flower order', orders: 'flower orders', item: 'flower', items: 'flowers', customer: 'customer' },
      stages: [{ label: 'ordered', closing: false }, { label: 'delivered', closing: true }],
      orderFields: [{ label: 'card message', required: false }],
      asset: null,
      items: [{ name: 'Dozen roses bouquet', kind: 'product', priceCents: 6500, stocked: false, onHand: 0 }]
    });
    expect(html).toContain('Petal and Stem');
    expect(html).toContain('<li class="closing">delivered</li>');
    expect(html).toContain('card message (optional)');
    expect(html).toContain('$65.00');
  });

  it('muestra el mensaje cuando el borrador no está listo', () => {
    expect(setupHtml({ state: 'generating', businessName: '<b>x</b>', message: 'Still drafting.' }))
      .toBe('<section><h2>&lt;b&gt;x&lt;/b&gt;</h2><p class="empty">Still drafting.</p></section>');
  });
});
