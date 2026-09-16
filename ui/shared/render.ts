// Render puro de las UIs: sin DOM, para poder probarlo en node.

export interface SnapshotView {
  todayRevenueCents: number;
  sameDayLastWeekCents: number;
  byStage: Array<{ stage: string; label: string; count: number }>;
  dueToday: Array<{ orderId: string; number: number; label: string }>;
  low: Array<{ itemId: string; name: string; onHand: number; reorderPoint: number }>;
}

export interface SalesReportView {
  from: string; to: string; prevFrom: string; prevTo: string;
  totalCents: number; prevTotalCents: number; count: number; averageTicketCents: number;
  daily: Array<{ date: string; cents: number }>;
  topItems: Array<{ name: string; quantity: number; cents: number }>;
}

/** Formato visual: con separador de miles, a diferencia del texto hablado. */
export function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, ch => ENTITIES[ch]!);
}

function trend(current: number, previous: number, suffix: string): string {
  if (previous === 0) return '';
  const up = current >= previous;
  return `<span class="${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${suffix}</span>`;
}

export function snapshotHtml(d: SnapshotView): string {
  const delta = Math.abs(d.todayRevenueCents - d.sameDayLastWeekCents);
  const max = Math.max(1, ...d.byStage.map(s => s.count));

  const stages = d.byStage.length === 0
    ? '<p class="empty">Nothing open.</p>'
    : d.byStage.map(s =>
        `<div class="bar"><span class="label">${escapeHtml(s.label)}</span>`
        + `<span class="track"><span class="fill" style="width:${Math.round((s.count / max) * 100)}%"></span></span>`
        + `<span class="count">${s.count}</span></div>`).join('');

  const due = d.dueToday.length === 0
    ? '<p class="empty">Nothing due today.</p>'
    : `<ul>${d.dueToday.map(o => `<li><b>#${o.number}</b> ${escapeHtml(o.label)}</li>`).join('')}</ul>`;

  const low = d.low.length === 0
    ? '<p class="empty">Stock looks fine.</p>'
    : `<ul>${d.low.map(i =>
        `<li>${escapeHtml(i.name)} <span class="muted">${i.onHand} left · reorder at ${i.reorderPoint}</span></li>`).join('')}</ul>`;

  return `<section class="kpi"><div class="kpi-label">Today</div>`
    + `<div class="kpi-value">${money(d.todayRevenueCents)}</div>`
    + `${trend(d.todayRevenueCents, d.sameDayLastWeekCents, `${money(delta)} vs. last week`)}</section>`
    + `<section><h2>Open by stage</h2>${stages}</section>`
    + `<section class="split"><div><h2>Due today</h2>${due}</div><div><h2>Running low</h2>${low}</div></section>`;
}

export function salesChartSvg(daily: Array<{ date: string; cents: number }>, width = 560, height = 160): string {
  if (daily.length === 0) {
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="No sales in this period">`
      + `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="muted">No sales in this period</text></svg>`;
  }
  const max = Math.max(...daily.map(d => d.cents));
  const gap = 4;
  const barWidth = Math.max(1, Math.floor((width - gap * (daily.length - 1)) / daily.length));
  const bars = daily.map((d, i) => {
    const h = max === 0 ? 0 : Math.round((d.cents / max) * (height - 20));
    const x = i * (barWidth + gap);
    return `<rect x="${x}" y="${height - h}" width="${barWidth}" height="${h}" rx="2">`
      + `<title>${escapeHtml(d.date)}: ${money(d.cents)}</title></rect>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily sales">${bars}</svg>`;
}

export function salesReportHtml(r: SalesReportView): string {
  const pct = r.prevTotalCents === 0 ? 0 : Math.round((Math.abs(r.totalCents - r.prevTotalCents) / r.prevTotalCents) * 100);
  const top = r.topItems.length === 0
    ? '<p class="empty">No items sold.</p>'
    : `<ol>${r.topItems.map(t =>
        `<li>${escapeHtml(t.name)} <span class="muted">${t.quantity} · ${money(t.cents)}</span></li>`).join('')}</ol>`;

  return `<section class="kpis">`
    + `<div><div class="kpi-label">Total</div><div class="kpi-value">${money(r.totalCents)}</div>`
    + `${trend(r.totalCents, r.prevTotalCents, `${pct}% vs. previous period`)}</div>`
    + `<div><div class="kpi-label">Sales</div><div class="kpi-value">${r.count}</div></div>`
    + `<div><div class="kpi-label">Average</div><div class="kpi-value">${money(r.averageTicketCents)}</div></div>`
    + `</section>`
    + `<section><h2>${escapeHtml(r.from)} – ${escapeHtml(r.to)}</h2>${salesChartSvg(r.daily)}</section>`
    + `<section><h2>Best sellers</h2>${top}</section>`;
}
