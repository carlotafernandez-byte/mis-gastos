/* Gráficos SVG propios (sin librerías externas = sin conexiones de terceros). */
const Charts = (() => {
  let gid = 0;
  const fmtK = v => Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + 'k' : Math.round(v).toString();

  function niceRange(min, max) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    const step = Math.pow(10, Math.floor(Math.log10(span / 3)));
    const s = [1, 2, 2.5, 5, 10].map(m => m * step).find(m => span / m <= 4) || step * 10;
    return { min: Math.floor(min / s) * s, max: Math.ceil(max / s) * s, step: s };
  }

  /* Gráfico de área tipo bolsa.
     points: [{y, label}], extra: { goal, goalLabel, volume:[{v, over}], projection:[{i,y}] } */
  function area(points, extra = {}) {
    const W = 360, H = extra.volume ? 210 : 170, padR = 40, padT = 12, chartH = 140, padB = 18;
    const id = 'g' + (++gid);
    const ys = points.map(p => p.y).concat(extra.goal != null ? [extra.goal] : [], (extra.projection || []).map(p => p.y));
    const r = niceRange(Math.min(0, ...ys), Math.max(...ys));
    const n = Math.max(points.length, extra.total || 0);
    const x = i => n <= 1 ? (W - padR) / 2 : i / (n - 1) * (W - padR);
    const y = v => padT + (1 - (v - r.min) / (r.max - r.min)) * chartH;
    const last = points.at(-1);
    const good = extra.goal == null || (last && last.y >= extra.goal);
    const color = good ? '#38bdf8' : '#f43f5e';
    const stop = good ? '#38bdf8' : '#f43f5e';
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${extra.aria || 'Gráfico'}">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${stop}" stop-opacity=".35"/><stop offset="1" stop-color="${stop}" stop-opacity="0"/></linearGradient></defs>`;
    // rejilla
    for (let v = r.min; v <= r.max + 1e-9; v += r.step) {
      s += `<line x1="0" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="#1a2d52" stroke-width="1" ${v === 0 ? '' : 'stroke-dasharray="2 4"'}/>`;
      s += `<text x="${W - padR + 6}" y="${y(v) + 4}" font-size="10" fill="#4f6290" font-family="ui-monospace, Menlo, monospace">${fmtK(v)}</text>`;
    }
    // volumen (gasto diario)
    if (extra.volume) {
      const vmax = Math.max(1, ...extra.volume.map(b => b.v));
      const bw = Math.max(2, (W - padR) / n * 0.6);
      const base = H - padB + 14;
      extra.volume.forEach((b, i) => {
        if (!b.v) return;
        const h = b.v / vmax * 34;
        s += `<rect x="${x(i) - bw / 2}" y="${base - h}" width="${bw}" height="${h}" rx="1.5" fill="${b.over ? '#f43f5e' : '#3b82f6'}" opacity="${b.over ? .85 : .5}"/>`;
      });
    }
    // objetivo
    if (extra.goal != null) {
      s += `<line x1="0" x2="${W - padR}" y1="${y(extra.goal)}" y2="${y(extra.goal)}" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="5 4"/>`;
      s += `<text x="4" y="${y(extra.goal) - 5}" font-size="10" fill="#f59e0b" font-weight="500">${extra.goalLabel || 'OBJETIVO'}</text>`;
    }
    if (points.length) {
      const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join('');
      s += `<path d="${line}L${x(points.length - 1).toFixed(1)},${y(r.min)}L${x(0)},${y(r.min)}Z" fill="url(#${id})"/>`;
      s += `<path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (extra.projection?.length) {
        const pr = [{ i: points.length - 1, y: last.y }, ...extra.projection];
        s += `<path d="${pr.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.y).toFixed(1)}`).join('')}" fill="none" stroke="${color}" stroke-width="1.6" stroke-dasharray="3 4" opacity=".7"/>`;
      }
      const lx = x(points.length - 1), ly = y(last.y);
      s += `<circle cx="${lx}" cy="${ly}" r="7" fill="${stop}" opacity=".2"/><circle cx="${lx}" cy="${ly}" r="3.5" fill="${stop}"/>`;
    }
    // etiquetas eje X
    (extra.xLabels || []).forEach(l => {
      s += `<text x="${Math.min(W - padR - 10, Math.max(10, x(l.i)))}" y="${padT + chartH + 14}" font-size="10" fill="#4f6290" text-anchor="middle">${l.t}</text>`;
    });
    return s + '</svg>';
  }

  function spark(values, invert = true) {
    const W = 64, H = 26;
    if (values.length < 2 || values.every(v => v === 0)) return `<svg viewBox="0 0 ${W} ${H}" width="64" height="26"><line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="#24407a" stroke-dasharray="2 3"/></svg>`;
    const max = Math.max(...values), min = Math.min(...values);
    const y = v => 3 + (1 - (v - min) / ((max - min) || 1)) * (H - 6);
    const x = i => i / (values.length - 1) * W;
    const rising = values.at(-1) > values.at(-2);
    const col = (rising === invert) ? '#f43f5e' : '#22c55e'; // en gastos, subir es malo
    return `<svg viewBox="0 0 ${W} ${H}" width="64" height="26"><path d="${values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  const PALETTE = ['#3b82f6', '#38bdf8', '#6366f1', '#a78bfa', '#22d3ee', '#818cf8', '#0ea5e9', '#c4b5fd', '#60a5fa', '#7dd3fc', '#93c5fd', '#4f46e5', '#64748b'];
  function donut(segments, center = '', sub = '') {
    const R = 62, r = 44, C = 80;
    const total = segments.reduce((a, s) => a + s.v, 0) || 1;
    let a0 = -Math.PI / 2, s = `<svg viewBox="0 0 160 160" width="160" height="160" style="flex:none">`;
    if (!segments.length) s += `<circle cx="${C}" cy="${C}" r="${(R + r) / 2}" fill="none" stroke="#1a2d52" stroke-width="${R - r}"/>`;
    segments.forEach((seg, i) => {
      const a1 = a0 + seg.v / total * Math.PI * 2 - (segments.length > 1 ? 0.03 : 0);
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad, ang) => `${(C + rad * Math.cos(ang)).toFixed(2)},${(C + rad * Math.sin(ang)).toFixed(2)}`;
      if (segments.length === 1) s += `<circle cx="${C}" cy="${C}" r="${(R + r) / 2}" fill="none" stroke="${seg.c || PALETTE[0]}" stroke-width="${R - r}"/>`;
      else s += `<path d="M${p(R, a0)}A${R},${R} 0 ${large} 1 ${p(R, a1)}L${p(r, a1)}A${r},${r} 0 ${large} 0 ${p(r, a0)}Z" fill="${seg.c || PALETTE[i % PALETTE.length]}"/>`;
      a0 = a1 + (segments.length > 1 ? 0.03 : 0);
    });
    s += `<text x="${C}" y="${C + 2}" text-anchor="middle" font-size="19" font-weight="250" fill="#e6eeff">${center}</text>`;
    s += `<text x="${C}" y="${C + 19}" text-anchor="middle" font-size="10" fill="#7d8fb5">${sub}</text>`;
    return s + '</svg>';
  }

  function gauge(pct, label = '') {
    const p = Math.max(0, Math.min(1, pct));
    const C = 100, R = 80, a0 = Math.PI, a1 = Math.PI + p * Math.PI;
    const pt = a => `${(C + R * Math.cos(a)).toFixed(2)},${(C + R * Math.sin(a)).toFixed(2)}`;
    const col = p >= 1 ? '#22c55e' : p >= .6 ? '#38bdf8' : p >= .3 ? '#f59e0b' : '#f43f5e';
    return `<svg viewBox="0 0 200 118" class="chart" style="max-width:260px;margin:0 auto">
      <path d="M${pt(Math.PI)}A${R},${R} 0 0 1 ${pt(2 * Math.PI)}" fill="none" stroke="#1a2d52" stroke-width="14" stroke-linecap="round"/>
      ${p > 0 ? `<path d="M${pt(a0)}A${R},${R} 0 0 1 ${pt(a1)}" fill="none" stroke="${col}" stroke-width="14" stroke-linecap="round"/>` : ''}
      <text x="100" y="92" text-anchor="middle" font-size="32" font-weight="200" fill="#e6eeff">${Math.round(pct * 100)}%</text>
      <text x="100" y="112" text-anchor="middle" font-size="11" fill="#7d8fb5">${label}</text>
    </svg>`;
  }

  return { area, spark, donut, gauge, PALETTE };
})();
