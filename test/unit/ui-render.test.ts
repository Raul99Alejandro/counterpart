import { describe, expect, it } from 'vitest';
import { escapeHtml, money, ordersHtml, salesChartSvg, salesReportHtml, setupHtml, snapshotHtml } from '../../ui/shared/render.js';

const emptySnapshot = { todayRevenueCents: 0, sameDayLastWeekCents: 0, byStage: [], dueToday: [], low: [] };

describe('UI rendering', () => {
  it('formats money with a thousands separator', () => {
    expect(money(123456)).toBe('$1,234.56');
    expect(money(5)).toBe('$0.05');
  });

  it('escapes HTML', () => {
    expect(escapeHtml(`<b>"x" & 'y'</b>`)).toBe('&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
  });

  it('does not inject HTML from the data', () => {
    const html = snapshotHtml({
      ...emptySnapshot,
      byStage: [{ stage: 'x', label: '<img src=x onerror=alert(1)>', count: 1 }]
    });
    expect(html).not.toContain('<img');
  });

  it('shows empty states in the snapshot', () => {
    const html = snapshotHtml(emptySnapshot);
    expect(html).toContain('Nothing open.');
    expect(html).toContain('Nothing due today.');
    expect(html).toContain('Stock looks fine.');
  });

  it('draws one bar per day and never produces NaN', () => {
    expect(salesChartSvg([])).toContain('No sales in this period');
    expect(salesChartSvg([{ date: '2026-09-15', cents: 0 }])).not.toContain('NaN');
    const svg = salesChartSvg([
      { date: '2026-09-14', cents: 1000 }, { date: '2026-09-15', cents: 3000 }, { date: '2026-09-16', cents: 2000 }
    ]);
    expect(svg.match(/<rect/g)).toHaveLength(3);
    expect(svg).not.toContain('NaN');
  });

  it('leaves out the comparison when there is no previous period', () => {
    const html = salesReportHtml({
      from: '2026-09-14', to: '2026-09-20', prevFrom: '2026-09-07', prevTo: '2026-09-13',
      totalCents: 5000, prevTotalCents: 0, count: 2, averageTicketCents: 2500, daily: [], prevDaily: [], topItems: []
    });
    expect(html).not.toContain('%');
    expect(html).toContain('No items sold.');
  });
  it('shows the draft: stages with the closing one marked, fields and catalog', () => {
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

  it('shows the message when the draft is not ready', () => {
    expect(setupHtml({ state: 'generating', businessName: '<b>x</b>', message: 'Still drafting.' }))
      .toBe('<section><h2>&lt;b&gt;x&lt;/b&gt;</h2><p class="empty">Still drafting.</p></section>');
  });
  it('the chart labels the days and draws the previous period', () => {
    const svg = salesChartSvg(
      [{ date: '2026-09-14', cents: 1000 }, { date: '2026-09-15', cents: 0 }],
      [{ date: '2026-09-07', cents: 500 }, { date: '2026-09-08', cents: 800 }]
    );
    expect(svg).toContain('>Mon</text>');
    expect(svg).toContain('>Tue</text>');
    expect(svg.match(/class="prev"/g)).toHaveLength(2);
  });
  it('a one-day period does not draw a full-width bar', () => {
    const svg = salesChartSvg([{ date: '2026-09-28', cents: 1000 }], [{ date: '2026-09-21', cents: 800 }]);
    const widths = [...svg.matchAll(/width="(\d+)"/g)].map(m => Number(m[1]));
    expect(Math.max(...widths)).toBeLessThanOrEqual(64);
  });
});

describe('order cards', () => {
  const order = (n: number) => ({
    orderId: `o${n}`, number: 40 + n, label: `2019 blue sedan ${n}`, customer: `Dana <Lee> ${n}`,
    stage: 'waiting_on_parts', stageLabel: 'waiting on parts', dueOn: '2026-10-02', totalCents: 25371
  });

  it('draws one card per order with its customer, stage, due date and total', () => {
    const html = ordersHtml({ heading: 'Work orders waiting on parts', total: 2, orders: [order(1), order(2)] });
    expect(html).toContain('Work orders waiting on parts');
    expect(html.match(/class="order-card"/g)).toHaveLength(2);
    expect(html).toContain('#41');
    expect(html).toContain('waiting on parts');
    expect(html).toContain('$253.71');
    expect(html).toContain('Fri, Oct 2');
    expect(html).toContain('Dana &lt;Lee&gt; 1');
  });

  it('says how many more there are beyond the cards', () => {
    const orders = Array.from({ length: 7 }, (_, i) => order(i + 1));
    const html = ordersHtml({ heading: 'Open work orders', total: 12, orders });
    expect(html.match(/class="order-card"/g)).toHaveLength(5);
    expect(html).toContain('and 7 more');
  });

  it('shows an empty state', () => {
    expect(ordersHtml({ heading: 'Work orders matching "x"', total: 0, orders: [] })).toContain('Nothing matches.');
  });
});
