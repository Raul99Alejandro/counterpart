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
  prevDaily: Array<{ date: string; cents: number }>;
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

type Point = { date: string; cents: number };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayLabel(date: string, count: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  return count <= 7 ? WEEKDAYS[d.getUTCDay()]! : String(d.getUTCDate());
}

/** Barras del periodo con la del periodo anterior detrás, en gris, y etiquetas de fecha. */
export function salesChartSvg(daily: Point[], prevDaily: Point[] = [], width = 560, height = 180): string {
  if (daily.length === 0 || [...daily, ...prevDaily].every(d => d.cents === 0)) {
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="No sales in this period">`
      + `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="muted">No sales in this period</text></svg>`;
  }
  const chart = height - 20; // espacio para las etiquetas
  const max = Math.max(1, ...daily.map(d => d.cents), ...prevDaily.map(d => d.cents));
  const gap = 4;
  // Tope de 64 px: un periodo de un día (hoy, o "esta semana" un lunes) no llena todo el ancho.
  const barWidth = Math.min(64, Math.max(2, Math.floor((width - gap * (daily.length - 1)) / daily.length)));
  const left = Math.round((width - (barWidth * daily.length + gap * (daily.length - 1))) / 2);
  const scale = (cents: number): number => Math.round((cents / max) * (chart - 10));
  const every = daily.length <= 7 ? 1 : 7;

  const parts = daily.map((d, i) => {
    const x = left + i * (barWidth + gap);
    const prev = prevDaily[i];
    const ghost = prev
      ? `<rect class="prev" x="${x}" y="${chart - scale(prev.cents)}" width="${barWidth}" height="${scale(prev.cents)}" rx="2">`
        + `<title>${escapeHtml(prev.date)}: ${money(prev.cents)}</title></rect>`
      : '';
    const inner = Math.max(1, Math.round(barWidth / 2));
    const bar = `<rect x="${x + Math.round((barWidth - inner) / 2)}" y="${chart - scale(d.cents)}" width="${inner}" height="${scale(d.cents)}" rx="2">`
      + `<title>${escapeHtml(d.date)}: ${money(d.cents)}</title></rect>`;
    const label = i % every === 0
      ? `<text class="axis" x="${x + barWidth / 2}" y="${height - 4}" text-anchor="middle">${dayLabel(d.date, daily.length)}</text>`
      : '';
    return ghost + bar + label;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily sales, with the previous period in gray">${parts}</svg>`;
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
    + `<section><h2>${escapeHtml(r.from)} – ${escapeHtml(r.to)}</h2>${salesChartSvg(r.daily, r.prevDaily, 560, 280)}</section>`
    + `<section><h2>Best sellers</h2>${top}</section>`;
}

export interface SetupView {
  state: 'none' | 'generating' | 'failed' | 'ready';
  businessName: string;
  message: string;
  nouns?: { order: string; orders: string; item: string; items: string; customer: string };
  stages?: Array<{ label: string; closing: boolean }>;
  orderFields?: Array<{ label: string; required: boolean }>;
  asset?: { noun: string; fields: string[] } | null;
  items?: Array<{ name: string; kind: string; priceCents: number; stocked: boolean; onHand: number }>;
}

export function setupHtml(v: SetupView): string {
  if (v.state !== 'ready' || !v.nouns) {
    return `<section><h2>${escapeHtml(v.businessName)}</h2><p class="empty">${escapeHtml(v.message)}</p></section>`;
  }
  const steps = (v.stages ?? []).map(s => `<li${s.closing ? ' class="closing"' : ''}>${escapeHtml(s.label)}</li>`).join('');
  const fields = [
    ...(v.asset ? [`${v.asset.noun}: ${v.asset.fields.join(', ')}`] : []),
    ...(v.orderFields ?? []).map(f => `${f.label}${f.required ? '' : ' (optional)'}`)
  ];
  const fieldList = fields.length === 0
    ? `<p class="empty">Just the ${escapeHtml(v.nouns.customer)}'s name.</p>`
    : `<ul>${fields.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`;
  const rows = (v.items ?? []).map(i =>
    `<tr><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.kind)}</td>`
    + `<td class="num">${money(i.priceCents)}</td><td class="num">${i.stocked ? i.onHand : '—'}</td></tr>`).join('');

  return `<section class="kpi"><div class="kpi-label">Setup draft</div>`
    + `<div class="kpi-value">${escapeHtml(v.businessName)}</div>`
    + `<p class="muted">Tracks ${escapeHtml(v.nouns.orders)} · catalog of ${escapeHtml(v.nouns.items)}</p></section>`
    + `<section><h2>Steps</h2><ol class="steps">${steps}</ol></section>`
    + `<section><h2>Each ${escapeHtml(v.nouns.order)} records</h2>${fieldList}</section>`
    + `<section><h2>Catalog</h2><table><thead><tr><th>Name</th><th>Kind</th><th class="num">Price</th><th class="num">On hand</th></tr></thead>`
    + `<tbody>${rows}</tbody></table></section>`;
}
