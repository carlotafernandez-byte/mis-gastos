/* Mis Gastos — control de gastos privado. Todo se guarda en el propio móvil (localStorage).
   No hay servidor, ni analítica, ni conexión con el banco o la tarjeta. */
'use strict';

const STORE_KEY = 'misgastos.v1';
const DEFAULT_STATE = {
  settings: {
    name: '', income: 0, payday: 1, goal: 900, dailyLimit: 50, minPayments: 2, capBudget: 0,
    interests: ['ropa', 'bisu'], stores: '', notify: false, forceCheck: true, checkHours: 3,
    onboarded: false, startDate: null,
  },
  fixed: [],      // {id, name, amount, day, cat}
  tx: [],         // {id, date, ts, type, amount, cat, merchant, note, fixedId?, source?}
  wishlist: [],   // {id, name, store, price, created}
  pending: [],    // pagos detectados pendientes de apuntar {amount, merchant, ts}
  monthStart: {}, // 'YYYY-MM' -> {income, leftover, ts}  (cierre del día 1)
  lastCheck: 0,
  lastClip: '',
  notified: {},
};

let state = load();
let listFilter = 'all';
let listMonth = monthKey(new Date());
let chartRange = '1M';

/* ---------------- utilidades ---------------- */
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const s = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_STATE), ...s, settings: { ...DEFAULT_STATE.settings, ...(s.settings || {}) } };
  } catch { return structuredClone(DEFAULT_STATE); }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch { toast('No se pudo guardar. ¿Estás en modo privado?'); }
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = n => (Math.round(n * 100) / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const eur0 = n => Math.round(n).toLocaleString('es-ES') + ' €';
const sgn = n => (n > 0 ? '+' : n < 0 ? '−' : '') + eur0(Math.abs(n));
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
function pad(n) { return String(n).padStart(2, '0'); }
function dateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayStr() { return dateStr(new Date()); }
function monthKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function monthName(key, opts = { month: 'long', year: 'numeric' }) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-ES', opts);
}
function shiftMonth(key, n) { const [y, m] = key.split('-').map(Number); return monthKey(new Date(y, m - 1 + n, 1)); }
const prevMonthKey = key => shiftMonth(key, -1);
function daysInMonth(key) { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); }
function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
function startOfToday() { return new Date(new Date().toDateString()); }
function parseAmount(s) {
  if (typeof s === 'number') return s;
  let t = String(s ?? '').trim().replace(/[€\s]|eur/gi, '');
  if (!t) return NaN;
  if (t.includes(',') && t.includes('.')) {
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (t.includes(',')) t = t.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); // "2.400" = dos mil cuatrocientos
  return parseFloat(t.replace(/^\+/, ''));
}
function catOf(id) { return CATEGORIES.find(c => c.id === id) || (id === 'ingreso' ? INCOME_CAT : CATEGORIES.at(-1)); }
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}
function platform() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}
const appURL = () => location.origin + location.pathname.replace(/index\.html$/, '');

/* ---------------- gastos fijos automáticos ---------------- */
function postFixed() {
  if (!state.settings.onboarded || !state.fixed.length) return;
  const now = new Date();
  const curKey = monthKey(now);
  let key = state.settings.startDate ? state.settings.startDate.slice(0, 7) : curKey;
  let changed = false;
  for (let guard = 0; key <= curKey && guard < 36; key = shiftMonth(key, 1), guard++) {
    const dim = daysInMonth(key);
    for (const f of state.fixed) {
      if (!(f.amount > 0)) continue;
      const day = Math.min(f.day || 1, dim);
      if (key === curKey && day > now.getDate()) continue;
      if (state.tx.some(t => t.fixedId === f.id && t.date.startsWith(key))) continue;
      state.tx.push({ id: uid(), date: `${key}-${pad(day)}`, ts: 0, type: 'gasto', amount: f.amount, cat: f.cat || 'casa', merchant: f.name, note: 'Gasto fijo', fixedId: f.id });
      changed = true;
    }
  }
  if (changed) save();
}
function upcomingFixedThisMonth() {
  const now = new Date(), key = monthKey(now), dim = daysInMonth(key);
  return state.fixed.filter(f => f.amount > 0 && Math.min(f.day || 1, dim) > now.getDate()
    && !state.tx.some(t => t.fixedId === f.id && t.date.startsWith(key))).reduce((a, f) => a + f.amount, 0);
}

/* ---------------- cálculos ---------------- */
const gastos = (list = state.tx) => list.filter(t => t.type === 'gasto');
const sum = list => list.reduce((a, t) => a + t.amount, 0);
const inMonth = key => state.tx.filter(t => t.date.startsWith(key));
const isFixedLike = t => t.fixedId || t.cat === 'casa' || t.cat === 'subs';

function monthStats(key) {
  const all = inMonth(key);
  const g = gastos(all);
  const ingresos = sum(all.filter(t => t.type === 'ingreso'));
  const income = Math.max(ingresos, state.settings.income || 0);
  const byCat = {};
  for (const t of g) byCat[t.cat] = (byCat[t.cat] || 0) + t.amount;
  return { all, g, spent: sum(g), ingresos, income, byCat };
}
function dayStats(date) {
  const g = gastos(state.tx.filter(t => t.date === date));
  return { count: g.length, total: sum(g) };
}
function budget() {
  const now = new Date();
  const key = monthKey(now);
  const m = monthStats(key);
  const dim = daysInMonth(key);
  const day = now.getDate();
  const daysLeft = dim - day + 1;
  const goal = state.settings.goal;
  const upcomingFixed = upcomingFixedThisMonth();
  const maxSpend = m.income - goal;
  const remaining = maxSpend - m.spent - upcomingFixed;
  const today = dayStats(todayStr());
  const perDay = (maxSpend - (m.spent - today.total) - upcomingFixed) / daysLeft;
  const fixedLike = sum(m.g.filter(isFixedLike));
  const pace = fixedLike + upcomingFixed + (m.spent - fixedLike) / day * dim;
  const projectedSaving = m.income - pace;
  const savedSoFar = m.income - m.spent;
  return { ...m, key, dim, day, daysLeft, goal, maxSpend, remaining, perDay, pace, projectedSaving, savedSoFar, upcomingFixed, fixedLike, today };
}
function catUntil(key, cat, day) {
  return sum(gastos(inMonth(key)).filter(t => t.cat === cat && +t.date.slice(8) <= day));
}
// Ahorro real de un mes cerrado: lo que dijiste el día 1 que te había quedado, o el cálculo si no
function monthSaving(key) {
  const next = state.monthStart[shiftMonth(key, 1)];
  if (next && next.leftover != null) return next.leftover;
  const m = monthStats(key);
  return m.income - m.spent;
}

/* ---------------- análisis "dónde ahorrar" ---------------- */
function savingInsights() {
  const now = new Date();
  const key = monthKey(now);
  const cur = monthStats(key);
  const last = monthStats(prevMonthKey(key));
  const s = state.settings;
  const income = cur.income || last.income;
  const out = [];
  const from = dateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
  const recent = gastos(state.tx.filter(t => t.date >= from));
  if (!recent.length) return out;
  const rByCat = {};
  for (const t of recent) rByCat[t.cat] = (rByCat[t.cat] || 0) + t.amount;
  const fixedTotal = state.fixed.reduce((a, f) => a + (f.amount || 0), 0);

  if (income > 0) {
    const needs = Math.max(fixedTotal, CATEGORIES.filter(c => c.needs).reduce((a, c) => a + (rByCat[c.id] || 0), 0));
    if (income - needs < s.goal) {
      out.push({ level: 'danger', title: `El objetivo de ${eur0(s.goal)} no cabe con tus gastos básicos`,
        body: `Ingresas ${eur0(income)} y en básicos se te van ${eur0(needs)}. Como mucho podrías ahorrar ${eur0(Math.max(0, income - needs))}. Revisa facturas o ajusta el objetivo.` });
    }
  }

  const caprichos = (rByCat.ropa || 0) + (rByCat.bisu || 0) + sum(recent.filter(t => t.cat === 'belleza' && !t.fixedId));
  const capMonth = (cur.byCat.ropa || 0) + (cur.byCat.bisu || 0) + sum(cur.g.filter(t => t.cat === 'belleza' && !t.fixedId));
  if (s.capBudget > 0 && capMonth > s.capBudget) {
    out.push({ level: 'danger', cat: 'ropa', title: `Has pasado tu presupuesto de caprichos: ${eur0(capMonth)} de ${eur0(s.capBudget)}`,
      body: 'Ropa, bisutería y belleza de este mes. Lo que quieras a partir de ahora, a la lista "Lo quiero" hasta el mes que viene.' });
  } else if (caprichos > 0) {
    const ideal = s.capBudget || (income ? income * 0.05 : caprichos * 0.5);
    if (caprichos > ideal) {
      out.push({ level: 'warn', cat: 'ropa', title: `Ropa, bisutería y belleza: ${eur0(caprichos)} en 30 días`,
        body: `${income ? `Es el ${(caprichos / income * 100).toFixed(0)}% de lo que ingresas. ` : ''}Un tope sano sería ${eur0(ideal)}. Comprando solo en rebajas y con la lista "Lo quiero" ahorrarías unos <b>${eur0(caprichos - ideal)} al mes</b>.` });
    }
  }
  const outside = recent.filter(t => (t.cat === 'ropa' || t.cat === 'bisu') && !inSalesPeriod(parseDate(t.date)));
  if (outside.length >= 2) {
    const tot = sum(outside);
    out.push({ level: 'tip', cat: 'ropa', title: `${outside.length} compras de ropa/bisutería fuera de rebajas`,
      body: `Suman ${eur0(tot)}. En rebajas habrías pagado un 30-50% menos: unos <b>${eur0(tot * 0.4)} de ahorro</b>.` });
  }

  const comer = rByCat.comer || 0;
  if (comer > (income ? income * 0.08 : 100)) {
    const deliv = recent.filter(t => t.cat === 'comer' && /glovo|uber ?eats|just ?eat|deliveroo/i.test(t.merchant + ' ' + t.note));
    out.push({ level: 'warn', cat: 'comer', title: `Comer fuera: ${eur0(comer)} en 30 días`,
      body: `${deliv.length ? `${deliv.length} pedidos a domicilio (${eur0(sum(deliv))}). ` : ''}A la mitad ahorras <b>${eur0(comer / 2)} al mes</b>.` });
  }

  const hormiga = recent.filter(t => t.amount < 10 && !t.fixedId);
  if (hormiga.length >= 8) {
    const tot = sum(hormiga);
    out.push({ level: 'warn', cat: 'cafe', title: `${hormiga.length} gastos hormiga (menos de 10 €)`,
      body: `Parecen poco, pero suman ${eur0(tot)} en 30 días. Recortando la mitad: <b>${eur0(tot / 2)} al mes</b>.` });
  }

  const subs = detectRecurring();
  if (subs.length) {
    const tot = subs.reduce((a, x) => a + x.amount, 0);
    out.push({ level: 'tip', cat: 'subs', title: `${subs.length} ${subs.length === 1 ? 'pago que se repite' : 'pagos que se repiten'} cada mes (${eur(tot)}/mes)`,
      body: subs.map(x => `• ${esc(x.merchant)}: ${eur(x.amount)}`).join('<br>') + '<br>¿Los usas todos? Cancelar uno ya cuenta.' });
  }

  if (last.g.length) {
    for (const [cat, amt] of Object.entries(cur.byCat)) {
      if (catOf(cat).needs || cat === 'casa' || cat === 'subs') continue;
      const before = catUntil(prevMonthKey(key), cat, now.getDate());
      if (before > 20 && amt > before * 1.3) {
        out.push({ level: 'tip', cat, title: `${Icon(catOf(cat).icon)} ${catOf(cat).name} +${Math.round((amt / before - 1) * 100)}% respecto al mes pasado`,
          body: `A estas alturas del mes pasado llevabas ${eur0(before)}; este mes ${eur0(amt)}.` });
      }
    }
  }

  const days = {};
  for (const t of recent) { if (t.fixedId) continue; days[t.date] = days[t.date] || { n: 0, s: 0 }; days[t.date].n++; days[t.date].s += t.amount; }
  const overDays = Object.values(days).filter(d => d.s > s.dailyLimit && d.n >= s.minPayments);
  if (overDays.length >= 3) {
    out.push({ level: 'warn', title: `${overDays.length} días por encima de ${eur0(s.dailyLimit)} en varios pagos`,
      body: 'Suelen ser días de "ya que estoy…". Deja la tarjeta en casa los días que no tengas compras planificadas.' });
  }

  const byMerchant = {};
  for (const t of recent) {
    if (t.fixedId) continue;
    const k = (t.merchant || '').trim().toLowerCase(); if (!k) continue;
    byMerchant[k] = byMerchant[k] || { name: t.merchant, s: 0, n: 0 }; byMerchant[k].s += t.amount; byMerchant[k].n++;
  }
  const top = Object.values(byMerchant).sort((a, b) => b.s - a.s).slice(0, 3);
  if (top.length) out.push({ level: 'info', title: 'Dónde más dinero se te va (sin fijos)', body: top.map(m => `• ${esc(m.name)}: ${eur0(m.s)} (${m.n} ${m.n === 1 ? 'pago' : 'pagos'})`).join('<br>') });

  if (income > 0) {
    const b = budget();
    const gap = s.goal - b.projectedSaving;
    if (gap > 0) out.unshift({ level: 'danger', title: `A este ritmo te faltarán ${eur0(gap)} para ahorrar ${eur0(s.goal)}`,
      body: `Previsión de este mes: ${eur0(b.projectedSaving)} de ahorro. Para llegar, gasta como máximo ${eur(Math.max(0, b.remaining / b.daysLeft))} al día. Ideas para recortar:` });
    else out.unshift({ level: 'good', title: `Vas bien: a este ritmo ahorrarás ${eur0(b.projectedSaving)} este mes`,
      body: `Superas tu objetivo en ${eur0(-gap)}. Si quieres más, mira las ideas de abajo.` });
  }
  return out;
}
function inSalesPeriod(d) {
  return salesEvents(d.getFullYear()).some(e => e.cats.includes('ropa') && d >= e.start && d <= addDays(e.end, 1));
}
function detectRecurring() {
  const now = new Date();
  const from = dateStr(new Date(now.getFullYear(), now.getMonth() - 2, 1));
  const g = gastos(state.tx.filter(t => t.date >= from && t.merchant && !t.fixedId));
  const groups = {};
  for (const t of g) { const k = t.merchant.trim().toLowerCase(); (groups[k] = groups[k] || []).push(t); }
  const res = [];
  for (const list of Object.values(groups)) {
    if (new Set(list.map(t => t.date.slice(0, 7))).size < 2) continue;
    const last = list.sort((a, b) => b.date.localeCompare(a.date))[0];
    const similar = list.filter(t => Math.abs(t.amount - last.amount) <= last.amount * 0.1);
    const sm = new Set(similar.map(t => t.date.slice(0, 7)));
    if (['super', 'comer', 'cafe', 'transp', 'salud'].includes(last.cat)) continue; // compras habituales, no suscripciones
    if (sm.size >= 2 && similar.length <= sm.size + 1 && (last.cat === 'subs' || last.cat === 'casa' || last.amount < 60)) res.push({ merchant: last.merchant, amount: last.amount });
  }
  return res;
}

/* ---------------- render general ---------------- */
function render() {
  const s = state.settings;
  $('#greeting').textContent = s.name ? `Hola, ${s.name}` : 'Mis Gastos';
  $('#month-label').textContent = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  renderTicker(); renderHome(); renderList(); renderSave(); renderDeals(); renderSettings();
}

function renderTicker() {
  const now = new Date(), key = monthKey(now), prev = prevMonthKey(key);
  const b = budget();
  const items = [];
  if (b.income) items.push(`<span>AHORRO<b>${eur0(b.projectedSaving)}</b><em class="${b.projectedSaving >= b.goal ? 'up' : 'down'}">${b.projectedSaving >= b.goal ? '▲' : '▼'} ${sgn(b.projectedSaving - b.goal)}</em></span>`);
  items.push(`<span>HOY<b>${eur(b.today.total)}</b><em class="${b.today.total > state.settings.dailyLimit ? 'down' : 'up'}">${b.today.count} pagos</em></span>`);
  for (const [cat, amt] of Object.entries(b.byCat).sort((a, c) => c[1] - a[1])) {
    const before = catUntil(prev, cat, now.getDate());
    const d = before ? (amt / before - 1) * 100 : null;
    items.push(`<span>${catOf(cat).name.toUpperCase()}<b>${eur0(amt)}</b>${d == null ? '<em class="dim">nuevo</em>' : `<em class="${d > 0 ? 'down' : 'up'}">${d > 0 ? '▲' : '▼'}${Math.abs(d).toFixed(0)}%</em>`}</span>`);
  }
  const ev = upcomingEvents(now)[0];
  if (ev) { const d = daysBetween(startOfToday(), ev.start); items.push(`<span>${esc(ev.title.toUpperCase())}<b>${d <= 0 ? 'HOY' : 'en ' + d + 'd'}</b></span>`); }
  const html = items.join('');
  $('#ticker').innerHTML = html + html; // duplicado para el bucle continuo
}

const catColor = id => catOf(id).color || '#60a5fa';
const catIco = id => `<div class="ico" style="--c:${catColor(id)}">${Icon(catOf(id).icon)}</div>`;
const levelClass = l => ({ danger: 'alert-down', warn: 'alert-warn', tip: 'alert-blue', good: 'alert-up' }[l] || 'flat');

function txRow(t) {
  const c = catOf(t.cat);
  const time = t.ts ? new Date(t.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
  const tag = t.fixedId ? '<span class="tag">FIJO</span>' : t.source === 'detectado' ? '<span class="tag">AUTO</span>' : t.source === 'nomina' ? '<span class="tag">NÓMINA</span>' : '';
  return `<div class="tx">
    ${catIco(c.id)}
    <div style="min-width:0"><div class="name">${esc(t.merchant || c.name)}${tag}</div><div class="muted">${esc(c.name)}${t.note && !t.fixedId ? ' · ' + esc(t.note) : ''}${time ? ' · ' + time : ''}</div></div>
    <div class="amt num ${t.type === 'ingreso' ? 'in' : ''}">${t.type === 'ingreso' ? '+' : '−'}${eur(t.amount)}</div>
    <button class="del" data-del="${t.id}" aria-label="Borrar">×</button>
  </div>`;
}

/* ---------------- MERCADO (inicio) ---------------- */
function mainChart(b) {
  const s = state.settings;
  if (chartRange === '1M') {
    const pts = [], vol = [];
    let cum = 0;
    for (let d = 1; d <= b.dim; d++) {
      const ds = `${b.key}-${pad(d)}`;
      const g = gastos(b.all.filter(t => t.date === ds));
      const daySum = sum(g);
      if (d <= b.day) { cum += daySum; pts.push({ y: b.income - cum }); }
      const varG = g.filter(t => !t.fixedId);
      vol.push({ v: d <= b.day ? daySum : 0, over: sum(varG) > s.dailyLimit && varG.length >= s.minPayments });
    }
    const proj = b.day < b.dim ? [{ i: b.dim - 1, y: b.projectedSaving }] : [];
    const xl = [1, 8, 15, 22, b.dim].map(d => ({ i: d - 1, t: d }));
    return Charts.area(pts, { goal: s.goal, goalLabel: `OBJETIVO ${eur0(s.goal)}`, volume: vol, projection: proj, total: b.dim, xLabels: xl, aria: 'Dinero que te queda este mes' })
      + `<div class="chart-legend"><span><i style="background:var(--cyan)"></i>Te queda</span><span><i style="background:var(--amber)"></i>Objetivo</span><span><i style="background:var(--blue);height:8px;width:6px"></i>Gasto diario</span></div>`;
  }
  const n = { '3M': 3, '6M': 6, '1A': 12 }[chartRange];
  const pts = [], xl = [];
  for (let k = n - 1; k >= 0; k--) {
    const key = shiftMonth(b.key, -k);
    const has = inMonth(key).length || state.monthStart[shiftMonth(key, 1)];
    if (!has && key !== b.key) continue;
    xl.push({ i: pts.length, t: monthName(key, { month: 'short' }).replace('.', '') });
    pts.push({ y: key === b.key ? b.projectedSaving : monthSaving(key) });
  }
  if (pts.length < 2) return `<div class="empty"><div class="e">${Icon('trend')}</div>Aún no hay meses anteriores. A partir del día 1 verás aquí tu ahorro mes a mes.</div>`;
  return Charts.area(pts, { goal: s.goal, goalLabel: `OBJETIVO ${eur0(s.goal)}`, xLabels: xl, aria: 'Ahorro por mes' })
    + `<div class="chart-legend"><span><i style="background:var(--cyan)"></i>Ahorro mensual (este mes: previsto)</span></div>`;
}

function renderHome() {
  const b = budget();
  const s = state.settings;
  const diff = b.projectedSaving - s.goal;
  const avail = b.perDay - b.today.total;
  const overToday = b.today.total > s.dailyLimit && b.today.count >= s.minPayments;
  const pctMonth = b.maxSpend > 0 ? b.spent / b.maxSpend : 1;
  const rate = b.income ? b.projectedSaving / b.income : 0;
  let html = '';

  if (needsMonthStart()) html += `<div class="card alert-blue" data-action="month"><h3>${Icon('cash')} Nuevo mes: mete tu nómina</h3><div class="muted">Y cuánto te quedó de ${monthName(prevMonthKey(b.key), { month: 'long' })}. Toca aquí.</div></div>`;
  if (state.pending.length) html += `<div class="card alert-blue" data-action="pending"><h3>${Icon('card')} ${state.pending.length} ${state.pending.length === 1 ? 'pago detectado' : 'pagos detectados'} sin apuntar</h3><div class="muted">Toca para apuntarlo ahora.</div></div>`;

  html += `<div class="card hero">
    <div class="label">Ahorro previsto · ${monthName(b.key, { month: 'long' })}</div>
    <div class="value num">${eur0(b.projectedSaving)}</div>
    <span class="chip ${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '▲' : '▼'} ${sgn(diff)} vs objetivo</span>
    <span class="chip blue">${(rate * 100).toFixed(1).replace('.', ',')}% tasa de ahorro</span>
    <div class="range">${['1M', '3M', '6M', '1A'].map(r => `<button data-range="${r}" class="${r === chartRange ? 'sel' : ''}">${r}</button>`).join('')}</div>
    ${mainChart(b)}
  </div>`;

  html += `<div class="kpis">
    <div class="kpi accent-cyan ${avail < 0 ? 'danger' : ''}"><div class="k">Disponible hoy</div><div class="v num ${avail < 0 ? 'down' : ''}">${eur(avail)}</div><div class="s">de ${eur0(Math.max(0, b.perDay))}/día</div>
      <div class="meter ${avail < 0 ? 'over' : ''}"><div style="width:${Math.min(100, Math.max(0, b.perDay > 0 ? b.today.total / b.perDay * 100 : 100))}%"></div></div></div>
    <div class="kpi accent-pink ${overToday ? 'danger' : ''}"><div class="k">Gastado hoy</div><div class="v num">${eur(b.today.total)}</div><div class="s">${b.today.count} ${b.today.count === 1 ? 'pago' : 'pagos'} · límite ${eur0(s.dailyLimit)}</div>
      <div class="meter ${overToday ? 'over' : ''}"><div style="width:${Math.min(100, b.today.total / (s.dailyLimit || 1) * 100)}%"></div></div></div>
    <div class="kpi accent-violet"><div class="k">Gastado mes</div><div class="v num">${eur0(b.spent)}</div><div class="s">de ${eur0(Math.max(0, b.maxSpend))} máx.</div>
      <div class="meter ${pctMonth > 1 ? 'over' : ''}"><div style="width:${Math.min(100, pctMonth * 100)}%"></div></div></div>
    <div class="kpi accent-green"><div class="k">Margen restante</div><div class="v num ${b.remaining < 0 ? 'down' : 'up'}">${eur0(b.remaining)}</div><div class="s">${b.daysLeft} días · ${b.upcomingFixed ? `${eur0(b.upcomingFixed)} fijos por venir` : 'fijos pagados'}</div></div>
  </div>`;

  const now = new Date();
  const cats = Object.entries(b.byCat).sort((a, c) => c[1] - a[1]).slice(0, 6);
  html += `<h2 class="section">Tu cartera de gastos <button data-go="list">Ver todo</button></h2><div class="card flat">`;
  if (!cats.length) html += `<div class="empty"><div class="e">${Icon('bars')}</div>Aún no hay gastos este mes. Pulsa + para apuntar el primero.</div>`;
  for (const [cat, amt] of cats) {
    const before = catUntil(prevMonthKey(b.key), cat, now.getDate());
    const d = before ? (amt / before - 1) * 100 : null;
    const series = [];
    for (let k = 5; k >= 0; k--) series.push(monthStats(shiftMonth(b.key, -k)).byCat[cat] || 0);
    html += `<div class="holding" data-filter-go="${cat}">
      ${catIco(cat)}
      <div style="min-width:0"><div class="name">${catOf(cat).name}</div><div class="muted">${b.spent ? Math.round(amt / b.spent * 100) : 0}% del mes</div></div>
      ${Charts.spark(series)}
      <div class="amt num">${eur0(amt)}<small class="${d == null ? 'dim' : d > 0 ? 'down' : 'up'}">${d == null ? '—' : (d > 0 ? '▲ ' : '▼ ') + Math.abs(d).toFixed(0) + '%'}</small></div>
    </div>`;
  }
  html += '</div>';

  const ev = upcomingEvents(now)[0];
  if (ev) {
    const d = daysBetween(startOfToday(), ev.start);
    const live = d <= 0;
    html += `<div class="card alert-blue" data-go="deals"><div class="event ${live ? 'live' : ''}">
      <div class="when num">${live ? 'YA' : d}<small>${live ? 'en curso' : d === 1 ? 'día' : 'días'}</small></div>
      <div><h3>${Icon('tag')} ${esc(ev.title)}</h3><div class="muted">${state.wishlist.length ? `Tienes ${state.wishlist.length} ${state.wishlist.length === 1 ? 'cosa' : 'cosas'} en "Lo quiero". ${live ? '¡Es el momento!' : 'Espera a esta fecha.'}` : 'Toca para ver los mejores momentos para comprar.'}</div></div>
    </div></div>`;
  }

  const ins = savingInsights().find(i => i.level === 'warn' || i.level === 'danger');
  if (ins) html += `<div class="card ${levelClass(ins.level)}" data-go="save"><h3>${Icon('bulb')} ${ins.title}</h3><div class="muted">${ins.body}</div></div>`;

  const recent = [...state.tx].sort((a, c) => c.date.localeCompare(a.date) || (c.ts || 0) - (a.ts || 0)).slice(0, 6);
  html += `<h2 class="section">Últimas operaciones</h2><div class="card flat">${recent.length ? recent.map(txRow).join('') : '<div class="empty">Sin operaciones todavía.</div>'}</div>`;
  $('#view-home').innerHTML = html;
}

/* ---------------- GASTOS ---------------- */
function renderList() {
  const months = [...new Set([monthKey(new Date()), ...state.tx.map(t => t.date.slice(0, 7))])].sort().reverse();
  const m = monthStats(listMonth);
  let list = [...m.all];
  if (listFilter !== 'all') list = list.filter(t => t.cat === listFilter);
  list.sort((a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0));

  const cats = Object.entries(m.byCat).sort((a, b) => b[1] - a[1]);
  const segs = cats.map(([c, v]) => ({ v, c: catColor(c), cat: c }));
  let html = `<select id="list-month">${months.map(k => `<option value="${k}" ${k === listMonth ? 'selected' : ''}>${monthName(k)}</option>`).join('')}</select>`;
  html += `<div class="card"><div style="display:flex;gap:14px;align-items:center">
    ${Charts.donut(segs, eur0(m.spent), 'gastado')}
    <div style="flex:1;min-width:0;font-size:13px">${segs.slice(0, 6).map(sg => `<div style="display:flex;justify-content:space-between;gap:6px;margin:6px 0"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${sg.c};margin-right:6px"></i>${catOf(sg.cat).name}</span><span class="num">${m.spent ? Math.round(sg.v / m.spent * 100) : 0}%</span></div>`).join('') || '<span class="muted">Sin gastos</span>'}</div>
  </div>
  <div class="row" style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px">
    <div><div class="muted">Ingresos</div><div class="num up stat">${eur0(m.income)}</div></div>
    <div><div class="muted">Gastos</div><div class="num down stat">${eur0(m.spent)}</div></div>
    <div><div class="muted">Neto</div><div class="num stat">${sgn(m.income - m.spent)}</div></div>
  </div></div>`;

  html += `<div class="chips"><button data-filter="all" class="${listFilter === 'all' ? 'sel' : ''}">Todo</button>${[...CATEGORIES, INCOME_CAT].filter(c => m.all.some(t => t.cat === c.id)).map(c => `<button data-filter="${c.id}" class="${listFilter === c.id ? 'sel' : ''}">${Icon(c.icon)} ${c.name}</button>`).join('')}</div>`;
  if (!list.length) html += '<div class="empty">No hay movimientos.</div>';
  let curDay = null, block = '';
  const flush = () => { if (block) html += `<div class="card flat" style="padding:4px 14px">${block}</div>`; block = ''; };
  for (const t of list) {
    if (t.date !== curDay) {
      flush(); curDay = t.date;
      const ds = dayStats(t.date);
      const varG = gastos(state.tx.filter(x => x.date === t.date && !x.fixedId));
      const over = sum(varG) > state.settings.dailyLimit && varG.length >= state.settings.minPayments;
      html += `<div class="day-head ${over ? 'over' : ''}"><span>${parseDate(t.date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}</span><span class="num">${over ? Icon('alert') + ' ' : ''}${eur(ds.total)}</span></div>`;
    }
    block += txRow(t);
  }
  flush();
  $('#view-list').innerHTML = html;
}

/* ---------------- OBJETIVO ---------------- */
function renderSave() {
  const b = budget();
  const s = state.settings;
  const ins = savingInsights();
  const fixedPosted = sum(b.g.filter(t => t.fixedId));
  const fixedMonth = fixedPosted + b.upcomingFixed;
  const variable = b.spent - fixedPosted;
  const capMonth = (b.byCat.ropa || 0) + (b.byCat.bisu || 0) + sum(b.g.filter(t => t.cat === 'belleza' && !t.fixedId));
  let html = `<div class="card hero" style="text-align:center;padding-bottom:16px">
    <div class="label">Objetivo de ahorro · ${eur0(s.goal)}/mes</div>
    ${Charts.gauge(s.goal ? b.projectedSaving / s.goal : 0, 'del objetivo, a este ritmo')}
    <div class="muted">Previsto <span class="num" style="color:var(--text)">${eur0(b.projectedSaving)}</span> · Sin gastar ahora <span class="num" style="color:var(--text)">${eur0(b.savedSoFar)}</span></div>
  </div>
  <div class="card flat">
    <div class="summary-line"><span>Ingresos del mes</span><span class="num up">${eur0(b.income)}</span></div>
    <div class="summary-line"><span>Gastos fijos</span><span class="num">−${eur0(fixedMonth)}</span></div>
    <div class="summary-line"><span>Gasto variable hasta hoy</span><span class="num">−${eur0(variable)}</span></div>
    <div class="summary-line"><span>Objetivo de ahorro</span><span class="num" style="color:var(--amber)">−${eur0(s.goal)}</span></div>
    <div class="summary-line total"><span>Te queda para gastar</span><span class="num ${b.remaining < 0 ? 'down' : 'up'}">${eur0(b.remaining)}</span></div>
    <div class="muted">Son <span style="color:var(--text)">${eur(Math.max(0, b.remaining / b.daysLeft))}</span> al día durante los ${b.daysLeft} días que quedan.</div>
  </div>`;

  // historial de cierres de mes (lo que te quedó cada mes)
  const closes = Object.entries(state.monthStart).filter(([, v]) => v.leftover != null).sort((a, c) => c[0].localeCompare(a[0]));
  if (closes.length) {
    const total = closes.reduce((a, [, v]) => a + v.leftover, 0);
    html += `<h2 class="section">Historial de ahorro</h2><div class="card flat">
      <div class="summary-line total" style="padding-top:0"><span>Acumulado</span><span class="num up">${eur0(total)}</span></div>
      ${closes.map(([k, v]) => { const pk = prevMonthKey(k); const ok = v.leftover >= s.goal; return `<div class="summary-line"><span>${cap(monthName(pk, { month: 'long' }))} ${pk.slice(0, 4)}</span><span class="num ${ok ? 'up' : 'down'}">${eur0(v.leftover)} ${ok ? Icon('check') : `(${sgn(v.leftover - s.goal)})`}</span></div>`; }).join('')}
    </div>`;
  }

  if (s.capBudget > 0) {
    html += `<div class="card flat"><h3>${Icon('shirt')} Caprichos (ropa, bisutería, belleza)</h3>
      <div class="num stat">${eur0(capMonth)} <span class="muted">de ${eur0(s.capBudget)}</span></div>
      <div class="meter ${capMonth > s.capBudget ? 'over' : ''}"><div style="width:${Math.min(100, capMonth / s.capBudget * 100)}%"></div></div></div>`;
  }
  html += `<h2 class="section">Dónde puedes ahorrar</h2>`;
  if (!ins.length) html += `<div class="empty"><div class="e">${Icon('search')}</div>Cuando apuntes unos cuantos gastos verás aquí dónde puedes recortar.</div>`;
  for (const i of ins) {
    const tips = i.cat && CATEGORY_TIPS[i.cat] ? `<ul class="tips">${CATEGORY_TIPS[i.cat].slice(0, 2).map(t => `<li>${t}</li>`).join('')}</ul>` : '';
    html += `<div class="card ${levelClass(i.level)}"><h3>${i.title}</h3><div class="muted">${i.body}</div>${tips}</div>`;
  }
  html += `<h2 class="section">Estrategias que funcionan</h2>
    <div class="card flat"><h3>${Icon('bank')} Págate a ti primero</h3><div class="muted">El día ${s.payday} (cuando cobras), programa una transferencia automática de ${eur0(s.goal)} a una cuenta de ahorro aparte. Lo que no ves, no lo gastas.</div></div>
    <div class="card flat"><h3>${Icon('clock')} Regla de las 48 horas</h3><div class="muted">Todo lo que no sea necesario va a "Lo quiero" (pestaña Ofertas). Si en 48 h lo sigues queriendo, espera a la siguiente rebaja.</div></div>
    <div class="card flat"><h3>${Icon('card')} Tarjeta de caprichos</h3><div class="muted">Pasa cada semana una cantidad fija a una tarjeta prepago para ropa y caprichos. Cuando se acaba, se acaba.</div></div>`;
  $('#view-save').innerHTML = html;
}

/* ---------------- OFERTAS ---------------- */
function renderDeals() {
  const today = startOfToday();
  const interests = state.settings.interests || [];
  const evs = upcomingEvents(today).slice(0, 8);
  let html = `<h2 class="section">Lo quiero · lista de espera</h2>
    <div class="card flat"><form id="wish-form">
      <input name="name" placeholder="¿Qué quieres? (vestido negro, pendientes…)" required>
      <div class="row"><input name="store" placeholder="Tienda"><input name="price" placeholder="Precio €" inputmode="decimal"></div>
      <button class="btn primary block" style="margin-top:4px">Añadir a la lista</button>
    </form>`;
  if (!state.wishlist.length) html += '<div class="muted" style="margin-top:10px">Apunta aquí lo que te apetece en vez de comprarlo en el momento. Te digo cuándo es mejor comprarlo y dónde buscarlo más barato.</div>';
  for (const w of state.wishlist) {
    const days = daysBetween(new Date(w.created), new Date());
    const cat = guessCategory(w.store + ' ' + w.name);
    const ev = evs.find(e => e.cats.includes(cat === 'otros' ? 'ropa' : cat)) || evs[0];
    const qn = encodeURIComponent(w.name), q = encodeURIComponent(w.name + (w.store ? ' ' + w.store : ''));
    const evDays = ev ? daysBetween(today, ev.start) : null;
    html += `<div class="tx" style="align-items:start;margin-top:8px">${catIco(cat)}<div style="min-width:0">
      <div class="name">${esc(w.name)}</div>
      <div class="muted">${w.store ? esc(w.store) + ' · ' : ''}${days < 2 ? `espera ${days === 1 ? '1 día más' : '2 días'} antes de decidir` : `${days} días en la lista`}</div>
      ${ev ? `<div class="muted">${Icon('arrow')} Mejor momento: <span style="color:var(--text)">${esc(ev.title)}</span> ${evDays <= 0 ? '(¡ahora!)' : `(en ${evDays} días)`}</div>` : ''}
      <div class="links">
        <a href="https://www.chollometro.com/search?q=${qn}" target="_blank" rel="noopener noreferrer">Chollómetro</a>
        <a href="https://www.vinted.es/catalog?search_text=${qn}" target="_blank" rel="noopener noreferrer">Vinted</a>
        <a href="https://es.wallapop.com/app/search?keywords=${qn}" target="_blank" rel="noopener noreferrer">Wallapop</a>
        <a href="https://www.google.com/search?tbm=shop&q=${q}" target="_blank" rel="noopener noreferrer">Comparar</a>
      </div></div>
      <div class="amt num">${w.price ? eur(w.price) : ''}</div>
      <button class="del" data-wdel="${w.id}" aria-label="Quitar">×</button></div>`;
  }
  html += '</div>';

  html += renderStores();

  html += '<h2 class="section">Calendario de mejores momentos</h2>';
  for (const e of evs) {
    const d = daysBetween(today, e.start);
    const live = d <= 0;
    const mine = e.cats.some(c => interests.includes(c));
    const date = e.start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    html += `<div class="card ${mine ? 'alert-blue' : 'flat'}"><div class="event ${live ? 'live' : ''}" style="--c:${catColor(e.cats[0])}">
      <div class="when num">${live ? 'YA' : d}<small>${live ? 'en curso' : d === 1 ? 'día' : 'días'}</small></div>
      <div><h3>${esc(e.title)}${mine ? ' <span class="tag">PARA TI</span>' : ''}</h3><div class="muted">${date}${e.end - e.start > 0 ? ' – ' + e.end.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : ''}${e.approx ? ' (fecha aproximada)' : ''}</div>
      <p style="margin:8px 0 4px;font-size:14px">${esc(e.tip)}</p>
      <div class="muted">${Icon('bag')} ${esc(e.stores)}</div>
      ${storesFor(e).length ? `<div class="links">${storesFor(e).map(st => storeLink(st)).join('')}</div>` : ''}
      ${e.cats.map(c => `<span class="pill" style="--c:${catColor(c)}">${Icon(catOf(c).icon)} ${catOf(c).name}</span>`).join('')}</div>
    </div></div>`;
  }

  const order = [...interests, ...['ropa', 'bisu', 'belleza', 'super', 'online', 'comer', 'cafe', 'subs'].filter(c => !interests.includes(c))].filter(c => CATEGORY_TIPS[c]);
  html += `<h2 class="section">Consejos por tipo de compra</h2>`;
  for (const id of order.slice(0, 6)) {
    const c = catOf(id);
    html += `<div class="card flat"><h3 style="--c:${catColor(c.id)}" class="cat-h">${Icon(c.icon)} ${c.name}</h3><ul class="tips">${CATEGORY_TIPS[id].map(t => `<li>${t}</li>`).join('')}</ul></div>`;
  }
  html += `<div class="card alert-blue"><h3>${Icon('bell')} Chollos en tiempo real</h3><div class="muted">Para ofertas concretas al momento: crea alertas por palabra clave en Chollómetro (gratis), guarda búsquedas en Vinted/Wallapop${state.settings.stores ? ` y activa avisos solo de tus tiendas (${esc(state.settings.stores)})` : ''}. Esta app no se conecta a nada: te avisa de las fechas clave.</div></div>`;
  $('#view-deals').innerHTML = html;
}

/* ---------------- tiendas ---------------- */
let storeFilter = null;
function favStores() {
  const favs = (state.settings.stores || '').toLowerCase().split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
  return STORES.filter(st => favs.some(f => st.name.toLowerCase().includes(f) || f.includes(st.name.toLowerCase())));
}
function storesFor(e) {
  const txt = e.stores.toLowerCase();
  return STORES.filter(st => txt.includes(st.name.toLowerCase()) || (txt.includes('inditex') && /zara|bershka|stradivarius|pull|lefties/i.test(st.name))).slice(0, 6);
}
function storeLink(st) {
  return `<a href="${st.url}" target="_blank" rel="noopener noreferrer">${esc(st.name)}</a>`;
}
function renderStores() {
  const favs = favStores();
  const interests = state.settings.interests || [];
  const filters = [...(favs.length ? ['fav'] : []), ...['ropa', 'bisu', 'belleza', 'online'].sort((a, b) => interests.includes(b) - interests.includes(a))];
  const f = filters.includes(storeFilter) ? storeFilter : filters[0];
  const list = f === 'fav' ? favs : STORES.filter(st => st.cats.includes(f));
  let html = `<h2 class="section">Tiendas</h2><div class="chips">${filters.map(x => `<button data-store-filter="${x}" class="${x === f ? 'sel' : ''}" ${x === 'fav' ? '' : `style="--c:${catColor(x)}"`}>${x === 'fav' ? 'Tus tiendas' : catOf(x).name}</button>`).join('')}</div>
    <div class="card flat" style="padding:4px 14px">`;
  for (const st of list) {
    const c = catColor(f === 'fav' ? st.cats[0] : f);
    html += `<a class="store" href="${st.url}" target="_blank" rel="noopener noreferrer">
      <div class="avatar" style="--c:${c}">${esc(st.name.replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 2))}</div>
      <div style="min-width:0"><div class="name">${esc(st.name)}</div><div class="muted">${esc(st.note)}</div></div>
      ${Icon('arrow')}</a>`;
  }
  html += `</div><div class="muted" style="margin:-4px 2px 0">Se abren en tu navegador. Antes de comprar, mira si está en tu lista "Lo quiero".</div>`;
  return html;
}

/* ---------------- AJUSTES ---------------- */
function detectionHelp() {
  const url = appURL();
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const ios = `<h3>iPhone (Apple Pay)</h3>
    ${platform() === 'ios' && !standalone ? '<div class="card alert-warn" style="margin:8px 0"><div class="muted">Ahora la estás usando en Safari. Añádela a la pantalla de inicio (Compartir → Añadir a pantalla de inicio) y ábrela siempre desde ese icono.</div></div>' : ''}
    <ol class="steps">
      <li>Abre <b>Atajos</b> → <b>Automatización</b> → <b>+</b> → <b>Transacción</b>. Elige tus tarjetas, marca <b>Ejecutar inmediatamente</b> y pulsa Siguiente → <b>Nueva automatización en blanco</b>.</li>
      <li>Añade la acción <b>Texto</b> y escribe esto, insertando las variables <b>Importe</b> y <b>Comercio</b> donde pone [ ]:<code class="url">MISGASTOS|[Importe]|[Comercio]</code></li>
      <li>Añade la acción <b>Copiar al portapapeles</b>.</li>
      <li>Añade la acción <b>Mostrar notificación</b> con el texto: <code class="url">Pago de [Importe] en [Comercio]. Abre Mis Gastos para apuntarlo.</code></li>
      <li>Cuando pagues te llegará el aviso. Abre la app desde su icono, toca <b>Pegar pago del atajo</b> y luego <b>Pegar</b> en la burbuja: tendrás que apuntarlo para continuar.</li>
    </ol>
    <div class="muted">Solo detecta pagos con Apple Pay, no con la tarjeta física. Para los demás, al abrir la app siempre te pregunta si has pagado algo.</div>`;
  const android = `<h3>Android</h3>
    <ol class="steps">
      <li>Activa en la app de tu banco las <b>notificaciones de cada pago</b>.</li>
      <li>Instala <b>MacroDroid</b> (gratis). Crea una macro: disparador <b>Notificación recibida</b> → la app del banco o Google Wallet.</li>
      <li>Acción <b>Abrir sitio web</b>: <code class="url">${esc(url)}?aviso=[notification]</code></li>
      <li>Al llegar el aviso del banco se abrirá la app con el importe y <b>tendrás que apuntarlo</b>.</li>
    </ol>
    <div class="muted">MacroDroid lee la notificación dentro de tu móvil; no da acceso a tu tarjeta ni a tu banco.</div>`;
  const sep = '<hr style="border:none;border-top:1px solid var(--line);margin:16px 0">';
  return platform() === 'android' ? android + sep + ios : ios + sep + android;
}

function renderSettings() {
  const s = state.settings;
  const notifSupported = 'Notification' in window;
  const fixedTotal = state.fixed.reduce((a, f) => a + (f.amount || 0), 0);
  $('#view-settings').innerHTML = `
  <h2 class="section">Mis datos</h2>
  <div class="card flat">
    <div class="summary-line"><span>Ingresos netos</span><span class="num">${eur0(s.income)}/mes · día ${s.payday}</span></div>
    ${state.fixed.filter(f => f.amount > 0).map(f => `<div class="summary-line"><span class="muted">· ${esc(f.name)} (día ${f.day})</span><span class="num">${eur0(f.amount)}</span></div>`).join('')}
    <div class="summary-line"><span>Gastos fijos</span><span class="num">${eur0(fixedTotal)}/mes</span></div>
    <div class="summary-line"><span>Objetivo de ahorro</span><span class="num">${eur0(s.goal)}/mes</span></div>
    <div class="summary-line"><span>Aviso diario</span><span class="num">&gt; ${eur0(s.dailyLimit)} en ${s.minPayments}+ pagos</span></div>
    <div class="summary-line"><span>Presupuesto caprichos</span><span class="num">${s.capBudget ? eur0(s.capBudget) + '/mes' : '—'}</span></div>
    <button class="btn block" id="edit-data" style="margin-top:12px">Editar mis datos</button>
  </div>

  <h2 class="section">Aviso del día 1</h2>
  <div class="card flat">
    <div class="muted">Cada día 1 la app te obliga a meter la nómina y lo que te quedó del mes anterior en cuanto la abras. Para que además te llegue una notificación ese día aunque no la abras, añade el recordatorio a tu calendario (se repite cada mes a las 9:00).</div>
    <button class="btn primary block" id="ics-btn" style="margin-top:12px">Añadir recordatorio mensual al calendario</button>
  </div>

  <h2 class="section">Detección de pagos</h2>
  <div class="card flat">
    <label class="toggle"><span>Preguntarme si he pagado algo<small>${platform() === 'ios' ? 'En iPhone te pregunta cada vez que abres la app.' : `Al abrir la app, si hace más de ${s.checkHours} h que no apuntas nada, te obliga a responder.`}</small></span><input type="checkbox" id="force-check" ${s.forceCheck ? 'checked' : ''}></label>
    <div style="margin-top:8px">${detectionHelp()}</div>
    <button class="btn block" id="test-detect" style="margin-top:12px">Probar: simular un pago detectado</button>
  </div>

  <h2 class="section">Notificaciones</h2>
  <div class="card flat"><div class="muted">${notifSupported ? 'Además del pop-up dentro de la app, puedo mandarte una notificación cuando pases el límite diario o empiecen rebajas.' : 'Tu navegador no permite notificaciones aquí. Usa el recordatorio de calendario para el día 1.'}</div>
    ${notifSupported ? `<button class="btn ${s.notify && Notification.permission === 'granted' ? 'ghost' : 'primary'} block" id="notif-btn" style="margin-top:10px">${s.notify && Notification.permission === 'granted' ? 'Notificaciones activadas' : 'Activar notificaciones'}</button>` : ''}
  </div>

  <h2 class="section">Importar extracto del banco</h2>
  <div class="card flat"><div class="muted">Opcional. Descarga los movimientos en CSV desde la web de tu banco y súbelos aquí. El archivo se lee en el móvil y no se envía a ningún sitio.</div>
    <input type="file" id="csv-file" accept=".csv,.txt,text/csv">
    <div id="csv-result" class="muted"></div>
  </div>

  <h2 class="section">Privacidad y copia de seguridad</h2>
  <div class="card flat">
    <div class="feature"><div class="ico">${Icon('lock')}</div><div><b>Sin rastreo</b>Sin publicidad, analítica ni cuentas. No se conecta a tu banco ni a tu tarjeta. Tus datos solo existen en este móvil.</div></div>
    <div class="row" style="margin-top:6px"><button class="btn" id="export-btn">Exportar copia</button><label class="btn" style="text-align:center">Restaurar<input type="file" id="import-file" accept=".json,application/json" hidden></label></div>
    <button class="btn danger block" id="wipe-btn" style="margin-top:10px">Borrar todos los datos</button>
  </div>
  <p class="muted" style="text-align:center">Mis Gastos · ${state.tx.length} movimientos en este dispositivo</p>`;
}

/* ---------------- recordatorio mensual (.ics, sin servidor) ---------------- */
function downloadICS() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const d = `${first.getFullYear()}${pad(first.getMonth() + 1)}01`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mis Gastos//ES', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:misgastos-dia1-${uid()}@local`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d}`, 'RRULE:FREQ=MONTHLY;BYMONTHDAY=1',
    'SUMMARY:Mis Gastos: mete tu nómina',
    `DESCRIPTION:Apunta la nómina y cuánto te quedó del mes anterior. ${appURL()}`,
    `URL:${appURL()}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Mete tu nómina en Mis Gastos', 'TRIGGER:PT9H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = 'recordatorio-nomina.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Ábrelo y pulsa "Añadir al calendario"');
}

/* ---------------- añadir movimiento (normal u obligatorio) ---------------- */
let selectedCat = null;
let catTouched = false;
let forcedMode = null; // null | 'pending' | 'check'

function openAdd(opts = {}) {
  const f = $('#add-form');
  f.reset();
  f.date.value = todayStr();
  selectedCat = null; catTouched = false;
  forcedMode = opts.forced || null;
  if (opts.amount) f.amount.value = String(opts.amount).replace('.', ',');
  if (opts.merchant) { f.merchant.value = opts.merchant; const g = lastCatFor(opts.merchant) || guessCategory(opts.merchant); selectedCat = g === 'otros' ? null : g; }
  const banner = $('#forced-banner');
  banner.hidden = !forcedMode;
  if (forcedMode === 'pending') {
    const p = state.pending[0];
    banner.textContent = `Pago detectado ${p.ts ? 'a las ' + new Date(p.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''}. Apúntalo para continuar.`;
  } else if (forcedMode === 'check') banner.textContent = 'Apunta el pago que has hecho para continuar.';
  $('#add-cancel').hidden = !!forcedMode;
  $('#add-not-expense').hidden = forcedMode !== 'pending';
  $('#type-seg').style.display = forcedMode === 'pending' ? 'none' : '';
  drawCats();
  $('#merchants').innerHTML = [...new Set(state.tx.map(t => t.merchant).filter(Boolean))].slice(-50).map(m => `<option value="${esc(m)}">`).join('');
  const dlg = $('#add-dialog');
  if (!dlg.open) dlg.showModal();
  setTimeout(() => (opts.amount ? f.merchant : $('#add-amount')).focus(), 60);
}
function drawCats() {
  const isIncome = $('#add-form').type.value === 'ingreso';
  $('#cat-grid').style.display = isIncome ? 'none' : '';
  $('#cat-hint').style.display = isIncome ? 'none' : '';
  $('#cat-grid').innerHTML = CATEGORIES.map(c => `<button type="button" data-cat="${c.id}" style="--c:${c.color}" class="${c.id === selectedCat ? 'sel' : ''}"><span>${Icon(c.icon)}</span>${c.name}</button>`).join('');
}
function submitAdd(e) {
  e.preventDefault();
  const f = e.target;
  const amount = parseAmount(f.amount.value);
  if (!(amount > 0)) { toast('Pon un importe válido'); f.amount.focus(); return; }
  const type = f.type.value;
  const merchant = f.merchant.value.trim();
  if (type === 'gasto' && !selectedCat) {
    const g = $('#cat-grid'); g.classList.remove('need-pick'); void g.offsetWidth; g.classList.add('need-pick');
    toast('Elige una categoría'); return;
  }
  const cat = type === 'ingreso' ? 'ingreso' : selectedCat;
  const tx = { id: uid(), date: f.date.value || todayStr(), ts: Date.now(), type, amount: Math.round(amount * 100) / 100, cat, merchant, note: f.note.value.trim() };
  if (forcedMode === 'pending') { tx.source = 'detectado'; state.pending.shift(); }
  state.tx.push(tx);
  state.lastCheck = Date.now();
  save();
  forcedMode = null;
  $('#add-dialog').close();
  render();
  toast(type === 'ingreso' ? 'Ingreso guardado' : `Guardado en ${catOf(cat).name}`);
  if (type === 'gasto') checkDailyLimit(tx.date);
  if (!$('#alert-dialog').open) setTimeout(nextForcedStep, 300);
}
function lastCatFor(merchant) {
  const m = (merchant || '').toLowerCase().trim();
  if (!m) return null;
  return [...state.tx].reverse().find(t => t.type === 'gasto' && (t.merchant || '').toLowerCase().trim() === m)?.cat || null;
}

/* ---------------- pop-ups genéricos ---------------- */
let alertLocked = false;
function showAlert({ icon = 'alert', blue = false, title, body, actions, locked = false }) {
  $('#alert-ring').innerHTML = Icon(icon);
  $('#alert-ring').classList.toggle('blue', blue);
  $('#alert-title').textContent = title;
  $('#alert-body').innerHTML = body;
  const box = $('#alert-actions');
  box.innerHTML = '';
  actions.forEach((a, i) => {
    const b = document.createElement('button');
    b.className = `btn block ${a.cls || (i === 0 ? 'primary' : 'ghost')}`;
    b.style.marginTop = '8px';
    b.textContent = a.label;
    b.onclick = () => {
      if (a.fn && a.fn() === false) return; // la acción puede impedir cerrar (validación)
      alertLocked = false; $('#alert-dialog').close();
    };
    box.appendChild(b);
  });
  alertLocked = locked;
  if (!$('#alert-dialog').open) $('#alert-dialog').showModal();
}
$('#add-dialog').addEventListener('cancel', e => { if (forcedMode) e.preventDefault(); });
$('#alert-dialog').addEventListener('cancel', e => { if (alertLocked) e.preventDefault(); });
$('#alert-dialog').addEventListener('close', () => { if (!$('#add-dialog').open) setTimeout(nextForcedStep, 200); });

/* ---------------- alerta de más de 50 € al día ---------------- */
function checkDailyLimit(date) {
  if (date !== todayStr()) return;
  const s = state.settings;
  const varG = gastos(state.tx.filter(t => t.date === date && !t.fixedId));
  const total = sum(varG), count = varG.length;
  if (total > s.dailyLimit && count >= s.minPayments) {
    const first = !state.notified['limit-' + date];
    const b = budget();
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    showAlert({
      title: first ? `Hoy ya llevas ${eur(total)}` : `Sigues sumando: ${eur(total)} hoy`,
      body: `Son <b>${count} pagos</b> y has pasado tu límite de ${eur0(s.dailyLimit)}.` +
        (b.income ? `<br><br>Tu presupuesto de hoy era ${eur(Math.max(0, b.perDay))}. Cada euro de más es un euro menos de tus ${eur0(s.goal)}.` : '') +
        '<br><br>¿Lo siguiente que ibas a comprar es necesario? Si no, a "Lo quiero" y decide en 48 h.',
      actions: [{ label: 'Entendido, freno' }, { label: 'Ver dónde ahorrar', fn: () => go('save') }],
    });
    if (first) { state.notified['limit-' + date] = true; save(); notify('Límite diario superado', `Hoy llevas ${eur(total)} en ${count} pagos.`); }
  }
}

/* ---------------- día 1: nómina + lo que quedó del mes anterior ---------------- */
function needsMonthStart() {
  const s = state.settings;
  if (!s.onboarded) return false;
  const key = monthKey(new Date());
  return !state.monthStart[key] && (s.startDate || todayStr()).slice(0, 7) < key;
}
function showMonthStart() {
  const key = monthKey(new Date());
  const prev = prevMonthKey(key);
  const pm = monthStats(prev);
  const estimate = Math.max(0, Math.round(pm.income - pm.spent));
  const prevName = monthName(prev, { month: 'long' });
  notify('Nuevo mes', 'Mete tu nómina y cuánto te quedó del mes anterior.');
  showAlert({
    icon: 'cash', blue: true, locked: true,
    title: `¡Empieza ${monthName(key, { month: 'long' })}!`,
    body: `Antes de seguir, cuéntame cómo ha ido.
      <label class="field" style="text-align:left">Nómina que te ha entrado</label>
      <div class="input-eur"><input id="ms-income" inputmode="decimal" value="${state.settings.income || ''}" placeholder="0"></div>
      <label class="field" style="text-align:left">Lo que te ha quedado de ${prevName} (saldo antes de cobrar)</label>
      <div class="input-eur"><input id="ms-left" inputmode="decimal" value="" placeholder="${estimate ? 'Según la app: ' + estimate : '0'}"></div>
      <div class="muted" style="text-align:left">Míralo en la app de tu banco. Si lo has pasado ya a ahorro, súmalo también.</div>`,
    actions: [{
      label: 'Guardar y empezar el mes', fn: () => {
        const income = parseAmount($('#ms-income').value);
        const leftRaw = $('#ms-left').value.trim();
        const left = leftRaw ? parseAmount(leftRaw) : estimate;
        if (!(income >= 0) || isNaN(income)) { toast('Pon el importe de la nómina'); return false; }
        if (isNaN(left)) { toast('Pon lo que te ha quedado'); return false; }
        if (income > 0) {
          const day = Math.min(state.settings.payday || 1, new Date().getDate());
          state.tx.push({ id: uid(), date: `${key}-${pad(day)}`, ts: Date.now(), type: 'ingreso', amount: Math.round(income * 100) / 100, cat: 'ingreso', merchant: 'Nómina', note: '', source: 'nomina' });
          state.settings.income = Math.round(income * 100) / 100;
        }
        state.monthStart[key] = { income, leftover: Math.round(left * 100) / 100, ts: Date.now() };
        state.lastCheck = Date.now();
        save(); render();
        const ok = left >= state.settings.goal;
        setTimeout(() => toast(ok ? `${prevName}: ahorraste ${eur0(left)}, objetivo cumplido` : `${prevName}: ${eur0(left)}. Este mes a por ${eur0(state.settings.goal)}`), 300);
      },
    }],
  });
  setTimeout(() => $('#ms-income')?.focus(), 80);
}

/* ---------------- pagos detectados + comprobación obligatoria ---------------- */
function parseIncomingPayment() {
  const p = new URLSearchParams(location.search);
  const raw = p.get('aviso') || p.get('texto') || '';
  let amount = parseAmount(p.get('pago') || p.get('importe') || p.get('amount') || '');
  let merchant = (p.get('comercio') || p.get('merchant') || '').trim();
  if (raw) {
    const m = raw.match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{1,2}|\d+)\s?(?:€|eur)/i) || raw.match(/(?:€|eur)\s?(\d+(?:[.,]\d{1,2})?)/i);
    if (m && !(amount > 0)) amount = parseAmount(m[1]);
    if (!merchant) { const mm = raw.match(/\ben\s+([A-Za-zÀ-ÿ0-9][^,.\n]{1,30})/i); if (mm) merchant = mm[1].trim(); }
    if (/devoluci|abono|reembolso|recibid/i.test(raw)) amount = NaN; // no es un gasto
  }
  if (p.toString()) history.replaceState(null, '', location.pathname);
  if (amount > 0) {
    const dup = state.pending.some(x => x.amount === amount && x.merchant === merchant && Date.now() - x.ts < 120000);
    if (!dup) { state.pending.push({ amount: Math.round(amount * 100) / 100, merchant: merchant.slice(0, 40), ts: Date.now() }); save(); }
  }
}
function nextForcedStep() {
  if (!state.settings.onboarded || !$('#onboarding').hidden) return;
  if ($('#add-dialog').open || $('#alert-dialog').open) return;
  if (state.pending.length) {
    const p = state.pending[0];
    if (navigator.vibrate) navigator.vibrate(120);
    return openAdd({ forced: 'pending', amount: p.amount, merchant: p.merchant });
  }
  if (needsMonthStart()) return showMonthStart();
  const s = state.settings;
  const clipMode = platform() === 'ios';
  // En iPhone se pregunta en cada apertura (salvo si acabas de responder hace menos de 10 min)
  const due = clipMode
    ? freshOpen && Date.now() - (state.lastCheck || 0) > 10 * 60000
    : s.forceCheck && Date.now() - (state.lastCheck || 0) > s.checkHours * 3600000;
  if (due) { freshOpen = false; showPaymentPrompt(clipMode); }
}

let freshOpen = true;
let hiddenAt = 0;
function sinceText() {
  const since = state.lastCheck ? new Date(state.lastCheck) : null;
  return !since ? 'hoy' : since.toDateString() === new Date().toDateString()
    ? 'desde las ' + since.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : 'desde el ' + since.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
}
function showPaymentPrompt(clipMode, msg = '') {
  const actions = [];
  if (clipMode) actions.push({ label: 'Pegar pago del atajo', fn: () => { pasteFromClipboard(); } });
  actions.push({ label: clipMode ? 'Apuntar a mano' : 'Sí, apuntar un pago', cls: clipMode ? 'ghost' : 'primary', fn: () => { setTimeout(() => openAdd({ forced: 'check' }), 50); } });
  actions.push({ label: 'No, nada', cls: 'ghost', fn: () => { state.lastCheck = Date.now(); save(); } });
  showAlert({
    icon: 'card', blue: true, locked: true,
    title: `¿Has pagado algo ${sinceText()}?`,
    body: (msg ? `<b style="color:var(--amber)">${msg}</b><br><br>` : '') +
      (clipMode ? 'Si te ha llegado el aviso del atajo, toca <b>Pegar pago del atajo</b> y después <b>Pegar</b> en la burbuja del iPhone.' : 'Con tarjeta, Bizum, efectivo… Apúntalo ahora para que no se te escape nada.'),
    actions,
  });
}
// Texto que copia el atajo: MISGASTOS|12,50 €|Zara
function parseClip(text) {
  const m = String(text || '').match(/MISGASTOS\s*\|\s*([^|]+?)\s*\|\s*([^\n]*)/i);
  if (!m) return null;
  const amount = parseAmount(m[1]);
  return amount > 0 ? { amount: Math.round(amount * 100) / 100, merchant: m[2].trim().slice(0, 40) } : null;
}
function pasteFromClipboard() {
  // readText debe llamarse dentro del toque para que el iPhone lo permita
  let p;
  try { p = navigator.clipboard.readText(); } catch { p = Promise.reject(); }
  p.then(text => {
    const pay = parseClip(text);
    if (!pay) { setTimeout(() => showPaymentPrompt(true, 'No hay ningún pago copiado por el atajo.'), 250); return; }
    if (state.lastClip === text) { setTimeout(() => showPaymentPrompt(true, 'Ese pago ya lo apuntaste.'), 250); return; }
    state.lastClip = text;
    state.pending.push({ ...pay, ts: Date.now() });
    save();
    try { navigator.clipboard.writeText(''); } catch { /* da igual */ }
    setTimeout(nextForcedStep, 250);
  }).catch(() => setTimeout(showManualPaste, 250));
}
function showManualPaste() {
  showAlert({
    icon: 'card', blue: true, locked: true, title: 'Pega el pago aquí',
    body: 'Mantén pulsado el recuadro y elige <b>Pegar</b>.<textarea id="clip-manual" rows="2" style="margin-top:12px"></textarea>',
    actions: [
      { label: 'Continuar', fn: () => {
        const pay = parseClip($('#clip-manual').value);
        if (!pay) { toast('No reconozco el pago copiado'); return false; }
        state.pending.push({ ...pay, ts: Date.now() }); save();
      } },
      { label: 'Apuntar a mano', cls: 'ghost', fn: () => { setTimeout(() => openAdd({ forced: 'check' }), 50); } },
    ],
  });
}

/* ---------------- notificaciones ---------------- */
async function notify(title, body) {
  if (!state.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
    else new Notification(title, { body });
  } catch { /* no soportado */ }
}
function checkEventReminders() {
  const today = startOfToday();
  for (const e of upcomingEvents(today).slice(0, 3)) {
    const d = daysBetween(today, e.start);
    const key = `ev-${e.id}-${e.start.getFullYear()}-${d <= 0 ? 'start' : 'soon'}`;
    if ((d === 3 || d === 1 || d === 0) && !state.notified[key]) {
      state.notified[key] = true; save();
      const wl = state.wishlist.length ? ` Tienes ${state.wishlist.length} cosas en "Lo quiero".` : '';
      notify(d === 0 ? `Hoy empieza: ${e.title}` : `${e.title} en ${d} ${d === 1 ? 'día' : 'días'}`, (d === 0 ? 'Compra solo lo de tu lista.' : 'Espera antes de comprar ropa o bisutería.') + wl);
    }
  }
}

/* ---------------- importar CSV del banco ---------------- */
function splitCSVLine(line, sep) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === sep && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}
function parseBankDate(s) {
  s = (s || '').trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return `${y}-${pad(+m[2])}-${pad(+m[1])}`; }
  m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  return null;
}
function importCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  const sample = lines.slice(0, 15).join('\n');
  const sep = [';', '\t', ','].map(s => [s, sample.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = lines.map(l => splitCSVLine(l, sep));
  const DATE_H = /fecha|^f\.? ?(operaci|valor|contable)|^date/i;
  let h = rows.findIndex(r => r.some(c => DATE_H.test(c)) && r.some(c => /importe|cantidad|amount|cargo|abono/i.test(c)));
  let iDate, iConcept, iAmount, iDebit = -1, iCredit = -1;
  if (h >= 0) {
    const head = rows[h].map(c => c.toLowerCase());
    iDate = head.findIndex(c => DATE_H.test(c));
    iConcept = head.findIndex(c => /concepto|descripci|movimiento|detalle|comercio|description|establecimiento/.test(c));
    iAmount = head.findIndex(c => /^importe|importe$|cantidad|amount/.test(c) && !/saldo/.test(c));
    iDebit = head.findIndex(c => /cargo|debe|gasto/.test(c));
    iCredit = head.findIndex(c => /abono|haber|ingreso/.test(c));
  } else {
    h = rows.findIndex(r => r.some(c => parseBankDate(c)));
    if (h < 0) return { added: 0, error: 'No encuentro columnas de fecha e importe.' };
    const r = rows[h];
    iDate = r.findIndex(c => parseBankDate(c));
    iAmount = r.findIndex((c, i) => i !== iDate && /^-?[\d.,]+\s*€?$/.test(c) && !isNaN(parseAmount(c)));
    iConcept = r.findIndex((c, i) => i !== iDate && i !== iAmount && /[a-z]/i.test(c));
    h -= 1;
  }
  if (iDate < 0 || (iAmount < 0 && iDebit < 0)) return { added: 0, error: 'No encuentro columnas de fecha e importe.' };

  const existing = new Set(state.tx.map(t => `${t.date}|${t.amount}|${(t.merchant || '').toLowerCase()}`));
  let added = 0, skipped = 0;
  for (const r of rows.slice(h + 1)) {
    const date = parseBankDate(r[iDate]);
    if (!date) continue;
    let amt;
    if (iAmount >= 0) amt = parseAmount(r[iAmount]);
    else { const d = parseAmount(r[iDebit] || ''); const c = parseAmount(r[iCredit] || ''); amt = !isNaN(d) && d !== 0 ? -Math.abs(d) : c; }
    if (isNaN(amt) || amt === 0) continue;
    const concept = (iConcept >= 0 ? r[iConcept] : '').replace(/\s+/g, ' ').trim();
    const merchant = cleanMerchant(concept);
    const type = amt < 0 ? 'gasto' : 'ingreso';
    const amount = Math.round(Math.abs(amt) * 100) / 100;
    const key = `${date}|${amount}|${merchant.toLowerCase()}`;
    if (existing.has(key)) { skipped++; continue; }
    // ya apuntado: gasto fijo ese mes, nómina ese mes, o pago apuntado ese día
    const already = state.tx.some(t => t.type === type && Math.abs(t.amount - amount) < 0.01 && (
      ((t.fixedId || t.source === 'nomina') && t.date.slice(0, 7) === date.slice(0, 7)) || t.date === date));
    if (already) { skipped++; continue; }
    if (type === 'gasto' && /traspaso|transferencia a .*ahorro|hucha/i.test(concept)) { skipped++; continue; }
    existing.add(key);
    state.tx.push({ id: uid(), date, ts: 0, type, amount, cat: type === 'ingreso' ? 'ingreso' : (lastCatFor(merchant) || guessCategory(concept)), merchant, note: '', source: 'banco' });
    added++;
  }
  save();
  return { added, skipped };
}
function cleanMerchant(c) {
  return c.replace(/\b\d{4}[x*]{2,}[\dx*]*\b|\b[x*]{4,}\d*\b/gi, ' ')
    .replace(/^(compra|pago|cargo|recibo|adeudo)( en| tarj\.?| con tarjeta| tarjeta)?\s*/i, '')
    .replace(/\s+/g, ' ').trim()
    .replace(/\s*(,|\bcon la tarjeta\b|\btarj(eta)?\b).*$/i, '')
    .replace(/\s+\d{4,}.*$/, '')
    .trim().slice(0, 40) || c.slice(0, 40);
}

/* ---------------- ASISTENTE INICIAL ---------------- */
// Sugerencias de gastos fijos; los importes los pone cada persona en el asistente
const FIXED_DEFAULTS = [
  { name: 'Casa / alquiler', cat: 'casa' }, { name: 'Luz / agua / gas', cat: 'casa' }, { name: 'Internet y móvil', cat: 'casa' },
  { name: 'Transporte (abono)', cat: 'transp' }, { name: 'Suscripciones', cat: 'subs' },
];
let onbStep = 0;
let draft = null;

const STEPS = [
  { // 0 bienvenida
    render: () => `<div class="hero-mark">€</div>
      <h1>Tu dinero, como una cartera de bolsa</h1>
      <p class="lead">Voy a pedirte unos datos para calcular cuánto puedes gastar cada día y llegar a tu objetivo de ahorro.</p>
      <div class="feature"><div class="ico">${Icon('lock')}</div><div><b>Privada de verdad</b>Sin cuentas, publicidad ni rastreo. No me conecto a tu banco ni a tu tarjeta. Todo se queda en este móvil.</div></div>
      <div class="feature"><div class="ico">${Icon('card')}</div><div><b>No se escapa ningún pago</b>Cuando pagues, te salta un aviso y tienes que apuntarlo.</div></div>
      <div class="feature"><div class="ico">${Icon('trend')}</div><div><b>Ves dónde ahorrar</b>Análisis de tus gastos, alertas si pasas tu límite diario y los mejores momentos para comprar.</div></div>`,
  },
  { // 1 nombre
    render: () => `<h1>¿Cómo te llamas?</h1><p class="lead">Solo para saludarte. Se queda en tu móvil.</p>
      <input id="o-name" value="${esc(draft.settings.name)}" placeholder="Tu nombre" autocomplete="given-name">`,
    save: () => { draft.settings.name = $('#o-name').value.trim().slice(0, 30); },
  },
  { // 2 ingresos
    render: () => `<h1>¿Cuánto te entra al mes?</h1><p class="lead">Tu nómina neta, lo que te llega a la cuenta. Cada día 1 te preguntaré la cifra real.</p>
      <label class="field">Nómina neta al mes</label>
      <div class="input-eur"><input id="o-income" class="big-input" style="text-align:left" inputmode="decimal" value="${draft.settings.income || ''}" placeholder="0"></div>
      <label class="field">¿Qué día del mes cobras?</label>
      <input id="o-payday" inputmode="numeric" value="${draft.settings.payday}" placeholder="1">`,
    save: () => {
      const v = parseAmount($('#o-income').value);
      if (!(v > 0)) { toast('Necesito tu nómina para calcular el presupuesto'); return false; }
      draft.settings.income = v;
      draft.settings.payday = Math.min(31, Math.max(1, parseInt($('#o-payday').value, 10) || 1));
    },
  },
  { // 3 gastos fijos
    render: () => {
      if (!draft.fixed.length) draft.fixed = FIXED_DEFAULTS.map(f => ({ id: uid(), amount: 0, day: draft.settings.payday, ...f }));
      return `<h1>Tus gastos fijos</h1><p class="lead">Lo que pagas todos los meses sí o sí. Se apuntan solos cada mes. Deja en blanco lo que no tengas.</p>
      <div class="fixed-row muted" style="font-size:11px;letter-spacing:.08em"><span>CONCEPTO</span><span>€/MES</span><span>DÍA</span><span></span></div>
      <div id="o-fixed">${draft.fixed.map(fixedRowHTML).join('')}</div>
      <button class="btn small" id="o-add-fixed" style="margin-top:6px">+ Añadir otro</button>
      <div class="card flat" style="margin-top:14px"><div class="summary-line total" style="padding:0"><span>Total fijos</span><span class="num" id="o-fixed-total">${eur0(draft.fixed.reduce((a, f) => a + (f.amount || 0), 0))}</span></div></div>`;
    },
    save: () => { readFixed(); },
  },
  { // 4 objetivo
    render: () => {
      const free = draft.settings.income - draft.fixed.reduce((a, f) => a + (f.amount || 0), 0);
      return `<h1>Tu objetivo de ahorro</h1><p class="lead">Cuánto quieres ahorrar cada mes.</p>
      <div class="input-eur"><input id="o-goal" class="big-input" style="text-align:left" inputmode="decimal" value="${draft.settings.goal}"></div>
      <div class="card flat" style="margin-top:12px" id="o-goal-calc">${goalCalc(free, draft.settings.goal)}</div>`;
    },
    save: () => { const v = parseAmount($('#o-goal').value); draft.settings.goal = v >= 0 ? v : 900; },
  },
  { // 5 límites
    render: () => `<h1>Tus alarmas</h1><p class="lead">Te salta un pop-up si un día gastas más de esta cantidad en varios pagos.</p>
      <label class="field">Límite de gasto al día</label>
      <div class="input-eur"><input id="o-limit" inputmode="decimal" value="${draft.settings.dailyLimit}"></div>
      <label class="field">A partir de cuántos pagos en el día</label>
      <input id="o-minpay" inputmode="numeric" value="${draft.settings.minPayments}">
      <label class="field">Presupuesto mensual para ropa, bisutería y belleza (opcional)</label>
      <div class="input-eur"><input id="o-cap" inputmode="decimal" value="${draft.settings.capBudget || ''}" placeholder="Ej. 60"></div>
      <div class="muted">Si lo pasas, te aviso y te propongo esperar al mes siguiente.</div>`,
    save: () => {
      const n = (id, d) => { const v = parseAmount($(id).value); return isNaN(v) ? d : v; };
      draft.settings.dailyLimit = Math.max(1, n('#o-limit', 50));
      draft.settings.minPayments = Math.max(1, Math.round(n('#o-minpay', 2)));
      draft.settings.capBudget = Math.max(0, n('#o-cap', 0));
    },
  },
  { // 6 intereses
    render: () => `<h1>¿En qué sueles gastar?</h1><p class="lead">Así te aviso de las rebajas que te interesan y te doy consejos para eso.</p>
      <div class="pick-grid" id="o-interests">${['ropa', 'bisu', 'belleza', 'online', 'comer', 'cafe', 'ocio', 'super'].map(id => `<button type="button" data-interest="${id}" class="${draft.settings.interests.includes(id) ? 'sel' : ''}"><span style="font-size:20px">${Icon(catOf(id).icon)}</span>${catOf(id).name}</button>`).join('')}</div>
      <label class="field">Tus tiendas favoritas (opcional)</label>
      <input id="o-stores" value="${esc(draft.settings.stores)}" placeholder="Zara, Parfois, Primark, Shein…">`,
    save: () => { draft.settings.stores = $('#o-stores').value.trim().slice(0, 120); },
  },
  { // 7 detección + día 1
    render: () => `<h1>Que no se escape ningún pago</h1>
      <p class="lead">No me conecto a tu tarjeta. En su lugar:</p>
      <div class="card flat"><label class="toggle"><span>Preguntarme al abrir la app<small>Si llevas más de 3 h sin apuntar nada, te pregunta "¿Has pagado algo?" y no te deja seguir sin responder.</small></span><input type="checkbox" id="o-force" ${draft.settings.forceCheck ? 'checked' : ''}></label></div>
      <div class="card flat"><h3>Aviso del día 1</h3><div class="muted" style="margin-bottom:10px">Cada mes, al abrir la app el día 1, tendrás que meter la nómina y lo que te quedó del mes anterior. Añade el recordatorio al calendario para que te llegue la notificación.</div>
        <button class="btn primary block" id="ics-btn">Añadir recordatorio al calendario</button></div>
      <div class="card flat"><h3>Aviso automático al pagar <span class="muted">(recomendado)</span></h3><div class="muted" style="margin:4px 0 8px">Una automatización de tu propio móvil te avisa justo después de pagar y deja el importe listo para apuntarlo. Puedes hacerlo ahora o más tarde en Ajustes.</div>${detectionHelp()}</div>`,
    save: () => { draft.settings.forceCheck = $('#o-force').checked; },
  },
  { // 8 resumen
    render: () => {
      const s = draft.settings;
      const fixedTotal = draft.fixed.reduce((a, f) => a + (f.amount || 0), 0);
      const variable = s.income - fixedTotal - s.goal;
      return `<div class="hero-mark">${Icon('check')}</div><h1>${s.name ? `Todo listo, ${esc(s.name)}` : 'Todo listo'}</h1>
      <p class="lead">Este es tu plan mensual:</p>
      <div class="card flat">
        <div class="summary-line"><span>Nómina</span><span class="num up">${eur0(s.income)}</span></div>
        ${draft.fixed.filter(f => f.amount > 0).map(f => `<div class="summary-line"><span>${esc(f.name)}</span><span class="num">−${eur0(f.amount)}</span></div>`).join('')}
        <div class="summary-line"><span>Ahorro</span><span class="num" style="color:var(--amber)">−${eur0(s.goal)}</span></div>
        <div class="summary-line total"><span>Para el día a día</span><span class="num ${variable < 0 ? 'down' : ''}">${eur0(variable)}</span></div>
        <div class="muted">≈ <span style="color:var(--text)">${eur(Math.max(0, variable / 30))}</span> al día para comida, ropa, ocio…</div>
      </div>
      ${variable < 0 ? `<div class="card alert-down"><h3>Con estos números no llegas al objetivo</h3><div class="muted">Vuelve atrás y bájalo, o revisa los gastos fijos.</div></div>` : ''}`;
    },
  },
];

function fixedRowHTML(f) {
  return `<div class="fixed-row" data-fid="${f.id}">
    <input data-k="name" value="${esc(f.name)}" placeholder="Concepto">
    <input data-k="amount" inputmode="decimal" value="${f.amount || ''}" placeholder="0">
    <input data-k="day" inputmode="numeric" value="${f.day || ''}" placeholder="día">
    <button type="button" class="x" data-fdel="${f.id}" aria-label="Quitar">×</button></div>`;
}
function readFixed() {
  const rows = [...document.querySelectorAll('#o-fixed .fixed-row')];
  draft.fixed = rows.map(r => {
    const old = draft.fixed.find(f => f.id === r.dataset.fid) || {};
    const name = r.querySelector('[data-k=name]').value.trim();
    const amount = parseAmount(r.querySelector('[data-k=amount]').value);
    const day = parseInt(r.querySelector('[data-k=day]').value, 10);
    const g = guessCategory(name);
    return { id: r.dataset.fid, name, cat: old.cat || (g === 'otros' ? 'casa' : g), amount: amount > 0 ? Math.round(amount * 100) / 100 : 0, day: day >= 1 && day <= 31 ? day : draft.settings.payday };
  }).filter(f => f.name);
}
function goalCalc(free, goal) {
  const left = free - goal;
  return `<div class="summary-line"><span>Te queda tras los fijos</span><span class="num">${eur0(free)}</span></div>
    <div class="summary-line"><span>Ahorro</span><span class="num" style="color:var(--amber)">−${eur0(goal || 0)}</span></div>
    <div class="summary-line total"><span>Para el día a día</span><span class="num ${left < 0 ? 'down' : 'up'}">${eur0(left)}</span></div>
    <div class="muted">${left < 0 ? 'No llega: baja el objetivo o revisa los gastos fijos.' : left / 30 < 10 ? `Solo ${eur(left / 30)} al día. Es muy ajustado.` : `Unos ${eur(left / 30)} al día. ${goal && free ? `Ahorrarías el ${Math.round(goal / free * 100)}% de lo que te queda libre.` : ''}`}</div>`;
}
function openOnboarding(start = 0) {
  draft = structuredClone({ settings: state.settings, fixed: state.fixed });
  onbStep = start;
  $('#onboarding').hidden = false;
  drawOnb();
}
function drawOnb() {
  $('#onb-progress').innerHTML = STEPS.map((_, i) => `<i class="${i <= onbStep ? 'done' : ''}"></i>`).join('');
  $('#onb-body').innerHTML = STEPS[onbStep].render();
  $('#onb-body').scrollTop = 0;
  $('#onb-back').style.visibility = onbStep === 0 ? 'hidden' : '';
  $('#onb-next').textContent = onbStep === 0 ? 'Empezar' : onbStep === STEPS.length - 1 ? 'Entrar en la app' : 'Continuar';
  const first = $('#onb-body input');
  if (first && onbStep > 0 && onbStep < 3) setTimeout(() => first.focus(), 80);
}
function onbNext() {
  const step = STEPS[onbStep];
  if (step.save && step.save() === false) return;
  if (onbStep < STEPS.length - 1) { onbStep++; drawOnb(); return; }
  const wasOnboarded = state.settings.onboarded;
  state.settings = { ...draft.settings, onboarded: true, startDate: draft.settings.startDate || todayStr() };
  state.fixed = draft.fixed.filter(f => f.name);
  if (!wasOnboarded) {
    state.lastCheck = Date.now();
    state.monthStart[monthKey(new Date())] = { income: state.settings.income, leftover: null, ts: Date.now() };
  }
  save();
  $('#onboarding').hidden = true;
  postFixed();
  render();
  toast(wasOnboarded ? 'Datos actualizados' : 'Todo listo. ¡A ahorrar!');
  setTimeout(nextForcedStep, 400);
}
document.addEventListener('input', e => {
  if (e.target.closest('#o-fixed')) {
    readFixed();
    const t = $('#o-fixed-total'); if (t) t.textContent = eur0(draft.fixed.reduce((a, f) => a + (f.amount || 0), 0));
  }
  if (e.target.id === 'o-goal') {
    const fixedTotal = draft.fixed.reduce((a, f) => a + (f.amount || 0), 0);
    $('#o-goal-calc').innerHTML = goalCalc(draft.settings.income - fixedTotal, parseAmount(e.target.value) || 0);
  }
});

/* ---------------- navegación y eventos ---------------- */
function go(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('#fab').style.display = view === 'settings' ? 'none' : '';
  window.scrollTo(0, 0);
}

document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-go], [data-action], [data-filter-go]');
  if (!t) return;
  if (t.dataset.view) return go(t.dataset.view);
  if (t.dataset.go) return go(t.dataset.go);
  if (t.dataset.filterGo) { listMonth = monthKey(new Date()); listFilter = t.dataset.filterGo; renderList(); return go('list'); }
  if (t.dataset.action === 'pending') return nextForcedStep();
  if (t.dataset.action === 'month') return showMonthStart();
  if (t.dataset.range) { chartRange = t.dataset.range; renderHome(); return; }
  if (t.dataset.cat) { selectedCat = t.dataset.cat; catTouched = true; drawCats(); return; }
  if (t.dataset.filter) { listFilter = t.dataset.filter; renderList(); return; }
  if (t.dataset.storeFilter) { storeFilter = t.dataset.storeFilter; renderDeals(); return; }
  if (t.dataset.interest) {
    const id = t.dataset.interest, list = draft.settings.interests;
    draft.settings.interests = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
    t.classList.toggle('sel'); return;
  }
  if (t.dataset.fdel) { t.closest('.fixed-row').remove(); readFixed(); $('#o-fixed-total').textContent = eur0(draft.fixed.reduce((a, f) => a + (f.amount || 0), 0)); return; }
  if (t.dataset.del) {
    showAlert({ icon: 'trash', blue: true, title: '¿Borrar este movimiento?', body: 'No se puede deshacer.', actions: [
      { label: 'Borrar', cls: 'danger', fn: () => { state.tx = state.tx.filter(x => x.id !== t.dataset.del); save(); render(); } }, { label: 'Cancelar' }] });
    return;
  }
  if (t.dataset.wdel) { state.wishlist = state.wishlist.filter(x => x.id !== t.dataset.wdel); save(); renderDeals(); toast('Quitado. ¡Dinero que te ahorras!'); return; }
  switch (t.id) {
    case 'fab': return openAdd();
    case 'add-cancel': forcedMode = null; return $('#add-dialog').close();
    case 'add-not-expense':
      if (confirm('¿Descartar este pago? Úsalo solo si no era un gasto tuyo o ya lo habías apuntado.')) {
        state.pending.shift(); state.lastCheck = Date.now(); save(); forcedMode = null; $('#add-dialog').close(); render(); setTimeout(nextForcedStep, 300);
      }
      return;
    case 'onb-next': return onbNext();
    case 'onb-back': if (STEPS[onbStep].save) STEPS[onbStep].save(); onbStep = Math.max(0, onbStep - 1); return drawOnb();
    case 'o-add-fixed': readFixed(); draft.fixed.push({ id: uid(), name: '', amount: 0, day: draft.settings.payday, cat: 'casa' }); $('#o-fixed').insertAdjacentHTML('beforeend', fixedRowHTML(draft.fixed.at(-1))); $('#o-fixed .fixed-row:last-child input').focus(); return;
    case 'edit-data': return openOnboarding(1);
    case 'ics-btn': return downloadICS();
    case 'test-detect':
      state.pending.push({ amount: 12.5, merchant: 'Prueba Zara', ts: Date.now() }); save(); render(); go('home');
      return setTimeout(nextForcedStep, 200);
    case 'notif-btn': return enableNotifications();
    case 'export-btn': return exportData();
    case 'wipe-btn':
      showAlert({ title: '¿Borrar todos los datos?', body: 'Se borrarán tus gastos, ajustes y lista de este móvil. No se puede deshacer.', actions: [
        { label: 'Sí, borrar todo', cls: 'danger', fn: () => { state = structuredClone(DEFAULT_STATE); save(); render(); openOnboarding(0); } }, { label: 'Cancelar' }] });
      return;
  }
});

document.addEventListener('change', async e => {
  if (e.target.name === 'type' && e.target.form?.id === 'add-form') drawCats();
  if (e.target.id === 'list-month') { listMonth = e.target.value; listFilter = 'all'; renderList(); }
  if (e.target.id === 'force-check') { state.settings.forceCheck = e.target.checked; save(); }
  if (e.target.id === 'csv-file' && e.target.files[0]) {
    const buf = await e.target.files[0].arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
    const r = importCSV(text);
    $('#csv-result').innerHTML = r.error ? `${Icon('error')} ${r.error}` : `${Icon('check')} ${r.added} movimientos importados${r.skipped ? ` (${r.skipped} ya estaban apuntados u omitidos)` : ''}.`;
    renderTicker(); renderHome(); renderList(); renderSave();
  }
  if (e.target.id === 'import-file' && e.target.files[0]) {
    try {
      const data = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(data.tx)) throw new Error();
      showAlert({ icon: 'download', blue: true, title: `¿Restaurar ${data.tx.length} movimientos?`, body: 'Se sustituirán los datos actuales de este móvil.', actions: [
        { label: 'Restaurar', fn: () => { state = { ...structuredClone(DEFAULT_STATE), ...data, settings: { ...DEFAULT_STATE.settings, ...data.settings } }; save(); render(); toast('Copia restaurada'); } }, { label: 'Cancelar' }] });
    } catch { toast('Ese archivo no es una copia válida'); }
  }
});

document.addEventListener('submit', e => {
  if (e.target.id === 'wish-form') {
    e.preventDefault();
    const f = e.target;
    const price = parseAmount(f.price.value);
    state.wishlist.push({ id: uid(), name: f.name.value.trim(), store: f.store.value.trim(), price: isNaN(price) ? 0 : price, created: Date.now() });
    save(); renderDeals(); toast('Apuntado. Espera 48 h antes de decidir');
  }
});
$('#add-form').addEventListener('submit', e => { e.stopPropagation(); submitAdd(e); });
$('#add-form').merchant.addEventListener('input', e => {
  if (catTouched) return;
  const c = lastCatFor(e.target.value) || guessCategory(e.target.value);
  const next = c === 'otros' ? null : c;
  if (next !== selectedCat) { selectedCat = next; drawCats(); }
});

async function enableNotifications() {
  if (!('Notification' in window)) return;
  const p = await Notification.requestPermission();
  state.settings.notify = p === 'granted'; save(); renderSettings();
  if (p === 'granted') notify('Notificaciones activadas', 'Te avisaré si pasas tu límite diario o empiezan rebajas.');
  else toast('Notificaciones bloqueadas. Puedes activarlas en los ajustes del navegador.');
}
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mis-gastos-${todayStr()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (Date.now() - hiddenAt > 90000) freshOpen = true;
  postFixed(); render(); checkEventReminders(); nextForcedStep();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

/* ---------------- arranque ---------------- */
parseIncomingPayment();
postFixed();
render();
if (!state.settings.onboarded) openOnboarding(0);
else { checkEventReminders(); setTimeout(nextForcedStep, 300); }
