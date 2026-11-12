/**
 * The MCP Apps view (SEP-1865) that hosts such as Claude render inline under a tool result.
 * One self-contained HTML document, no external requests: the host hands it the tool result
 * over postMessage JSON-RPC and it draws `structuredContent._view` (see views.ts).
 */

export const WIDGET_URI = 'ui://traceiq/view.html';
export const WIDGET_MIME_TYPE = 'text/html;profile=mcp-app';
export const APPS_EXTENSION = 'io.modelcontextprotocol/ui';

const STYLE = String.raw`
:root {
  color-scheme: light;
  --surface: var(--color-background-primary, #fcfcfb);
  --surface-2: var(--color-background-secondary, #f4f4f1);
  --ink: var(--color-text-primary, #0b0b0b);
  --ink-2: var(--color-text-secondary, #52514e);
  --muted: var(--color-text-tertiary, #898781);
  --line: var(--color-border-primary, rgba(11, 11, 11, 0.1));
  --grid: #e1e0d9;
  --axis: #c3c2b7;
  --series: #2a78d6;
  --series-soft: rgba(42, 120, 214, 0.12);
  --good: #0ca30c;
  --good-ink: #006300;
  --warning: #fab219;
  --critical: #d03b3b;
  --critical-ink: #b42626;
  --radius: var(--border-radius-lg, 12px);
  --font: var(--font-sans, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif);
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --surface: var(--color-background-primary, #1a1a19);
  --surface-2: var(--color-background-secondary, #232321);
  --ink: var(--color-text-primary, #f0efec);
  --ink-2: var(--color-text-secondary, #c3c2b7);
  --line: var(--color-border-primary, rgba(255, 255, 255, 0.1));
  --grid: #2c2c2a;
  --axis: #383835;
  --series: #3987e5;
  --series-soft: rgba(57, 135, 229, 0.18);
  --good-ink: #0ca30c;
  --critical-ink: #ef6b6b;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--surface); color: var(--ink); font: 14px/1.45 var(--font); }
#app { padding: 16px; display: grid; gap: 14px; }
header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
h1 { margin: 0; font-size: 15px; font-weight: 600; }
.sub { margin: 2px 0 0; color: var(--ink-2); font-size: 13px; }
.open { flex: none; border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 8px; padding: 5px 10px; font: inherit; font-size: 12.5px; cursor: pointer; }
.open:hover { background: var(--surface-2); }
.status { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.status[data-tone="good"] .dot { background: var(--good); }
.status[data-tone="warning"] .dot { background: var(--warning); }
.status[data-tone="critical"] .dot { background: var(--critical); }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
.stat { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
.stat .label { color: var(--ink-2); font-size: 12px; }
.stat .value { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 2px; }
.delta { font-size: 12px; color: var(--ink-2); }
.delta[data-good="true"] { color: var(--good-ink); }
.delta[data-good="false"] { color: var(--critical-ink); }
.section-title { font-size: 12.5px; font-weight: 600; color: var(--ink-2); margin: 0 0 6px; }
.chart { position: relative; }
.chart svg { display: block; width: 100%; height: 180px; overflow: visible; }
.tip { position: absolute; pointer-events: none; background: var(--ink); color: var(--surface); font-size: 12px; padding: 4px 8px; border-radius: 6px; white-space: nowrap; transform: translate(-50%, -110%); opacity: 0; transition: opacity 0.1s; font-variant-numeric: tabular-nums; }
.rows { display: grid; gap: 8px; }
.row { display: grid; grid-template-columns: minmax(80px, 34%) 1fr auto; align-items: center; gap: 10px; font-size: 13px; }
.row .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.track { height: 10px; background: var(--surface-2); border-radius: 4px; overflow: hidden; }
.fill { height: 100%; background: var(--series); border-radius: 4px; min-width: 2px; }
.row[data-highlight="true"] .fill { background: var(--critical); }
.row .num { font-variant-numeric: tabular-nums; color: var(--ink); text-align: right; }
.row .note { grid-column: 2 / 4; margin-top: -6px; color: var(--muted); font-size: 12px; }
.notes { margin: 0; padding-left: 18px; color: var(--ink-2); font-size: 13px; }
details { font-size: 12.5px; color: var(--ink-2); }
table { border-collapse: collapse; margin-top: 6px; width: 100%; }
th, td { text-align: left; padding: 3px 6px; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
.empty { color: var(--ink-2); font-size: 13px; }
`;

const SCRIPT = String.raw`
(function () {
  var app = document.getElementById('app');
  var nextId = 1;
  var pending = {};
  var link = null;

  function post(message) { window.parent.postMessage(message, '*'); }
  function request(method, params) {
    var id = nextId++;
    post({ jsonrpc: '2.0', id: id, method: method, params: params || {} });
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      setTimeout(function () { if (pending[id]) { delete pending[id]; reject(new Error('timeout')); } }, 10000);
    });
  }
  function notify(method, params) { post({ jsonrpc: '2.0', method: method, params: params || {} }); }

  function applyContext(ctx) {
    if (!ctx) return;
    if (ctx.theme === 'dark' || ctx.theme === 'light') document.documentElement.setAttribute('data-theme', ctx.theme);
    var vars = ctx.styles && ctx.styles.variables;
    if (vars) for (var key in vars) if (vars[key]) document.documentElement.style.setProperty(key, vars[key]);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    for (var key in attrs || {}) {
      if (key === 'text') node.textContent = attrs[key];
      else node.setAttribute(key, attrs[key]);
    }
    (children || []).forEach(function (child) { if (child) node.appendChild(child); });
    return node;
  }
  var NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) {
    var node = document.createElementNS(NS, tag);
    for (var key in attrs) node.setAttribute(key, attrs[key]);
    return node;
  }

  function lineChart(series) {
    var points = series.points || [];
    var wrap = el('div', { class: 'chart' });
    if (points.length < 2) return null;
    var W = 600, H = 180, L = 40, R = 8, T = 8, B = 22;
    var max = 0;
    points.forEach(function (p) { if (p.y > max) max = p.y; });
    max = niceMax(max);
    var x = function (i) { return L + (i * (W - L - R)) / (points.length - 1); };
    var y = function (v) { return T + (H - T - B) * (1 - v / max); };
    var chart = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', role: 'img', 'aria-label': series.label });
    [0, 0.5, 1].forEach(function (f) {
      var gy = y(max * f);
      chart.appendChild(svg('line', { x1: L, x2: W - R, y1: gy, y2: gy, stroke: f === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
      var label = svg('text', { x: L - 6, y: gy + 4, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--muted)' });
      label.textContent = compact(max * f);
      chart.appendChild(label);
    });
    var d = points.map(function (p, i) { return (i ? 'L' : 'M') + x(i) + ' ' + y(p.y); }).join(' ');
    chart.appendChild(svg('path', { d: d + ' L' + x(points.length - 1) + ' ' + y(0) + ' L' + x(0) + ' ' + y(0) + ' Z', fill: 'var(--series-soft)', stroke: 'none' }));
    chart.appendChild(svg('path', { d: d, fill: 'none', stroke: 'var(--series)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }));
    [0, points.length - 1].forEach(function (i, k) {
      var t = svg('text', { x: x(i), y: H - 4, 'text-anchor': k ? 'end' : 'start', 'font-size': 11, fill: 'var(--muted)' });
      t.textContent = points[i].x;
      chart.appendChild(t);
    });
    var cross = svg('line', { y1: T, y2: H - B, stroke: 'var(--axis)', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', opacity: 0 });
    var marker = svg('circle', { r: 4, fill: 'var(--series)', stroke: 'var(--surface)', 'stroke-width': 2, opacity: 0 });
    chart.appendChild(cross);
    chart.appendChild(marker);
    var tip = el('div', { class: 'tip' });
    wrap.appendChild(chart);
    wrap.appendChild(tip);
    function hide() { cross.setAttribute('opacity', 0); marker.setAttribute('opacity', 0); tip.style.opacity = 0; }
    chart.addEventListener('pointermove', function (event) {
      var box = chart.getBoundingClientRect();
      var px = ((event.clientX - box.left) / box.width) * W;
      var i = Math.round(((px - L) / (W - L - R)) * (points.length - 1));
      i = Math.max(0, Math.min(points.length - 1, i));
      var p = points[i];
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', 1);
      marker.setAttribute('cx', x(i)); marker.setAttribute('cy', y(p.y)); marker.setAttribute('opacity', 1);
      tip.textContent = p.x + ': ' + (p.label || compact(p.y));
      tip.style.left = (x(i) / W) * box.width + 'px';
      tip.style.top = (y(p.y) / H) * box.height + 'px';
      tip.style.opacity = 1;
    });
    chart.addEventListener('pointerleave', hide);
    var table = el('table', {}, [el('tr', {}, [el('th', { text: 'Date' }), el('th', { text: series.label })])]);
    points.forEach(function (p) { table.appendChild(el('tr', {}, [el('td', { text: p.x }), el('td', { text: p.label || String(p.y) })])); });
    return el('div', {}, [el('p', { class: 'section-title', text: series.label }), wrap, el('details', {}, [el('summary', { text: 'Show data' }), table])]);
  }

  function bars(section) {
    var rows = section.rows || [];
    if (!rows.length) return null;
    var max = section.max || 0;
    rows.forEach(function (r) { if (r.value > max) max = r.value; });
    if (max <= 0) max = 1;
    var list = el('div', { class: 'rows', role: 'list' });
    rows.forEach(function (r) {
      var fill = el('div', { class: 'fill' });
      fill.style.width = Math.max(0, Math.min(100, (r.value / max) * 100)) + '%';
      var row = el('div', { class: 'row', role: 'listitem', 'data-highlight': r.highlight ? 'true' : 'false', title: r.note || '' }, [
        el('span', { class: 'name', text: r.label }),
        el('div', { class: 'track' }, [fill]),
        el('span', { class: 'num', text: r.display })
      ]);
      if (r.note) row.appendChild(el('span', { class: 'note', text: r.note }));
      list.appendChild(row);
    });
    return el('div', {}, [el('p', { class: 'section-title', text: section.label }), list]);
  }

  // Round the axis top up to 1, 2 or 5 times a power of ten so ticks read cleanly.
  function niceMax(n) {
    if (n <= 0) return 1;
    var step = Math.pow(10, Math.floor(Math.log10(n)));
    var steps = [1, 2, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * step >= n) return steps[i] * step;
    return 10 * step;
  }

  function compact(n) {
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(Math.round(n * 100) / 100);
  }

  function render(result) {
    var data = (result && result.structuredContent) || {};
    var view = data._view;
    link = (data._links && data._links.dashboard) || (view && view.link) || null;
    app.textContent = '';
    if (!view) {
      app.appendChild(el('p', { class: 'empty', text: 'Nothing to chart for this result.' }));
      if (link) app.appendChild(openButton());
      return;
    }
    var heading = el('div', {}, [el('h1', { text: view.title }), view.subtitle ? el('p', { class: 'sub', text: view.subtitle }) : null]);
    app.appendChild(el('header', {}, [heading, link ? openButton() : null]));
    if (view.status) {
      app.appendChild(el('div', { class: 'status', 'data-tone': view.status.tone, role: 'status' }, [el('span', { class: 'dot', 'aria-hidden': 'true' }), el('span', { text: view.status.label })]));
    }
    if (view.stats && view.stats.length) {
      var stats = el('div', { class: 'stats' });
      view.stats.forEach(function (s) {
        stats.appendChild(el('div', { class: 'stat' }, [
          el('div', { class: 'label', text: s.label }),
          el('div', { class: 'value', text: s.value }),
          s.delta ? el('div', { class: 'delta', 'data-good': s.delta.good === null || s.delta.good === undefined ? '' : String(s.delta.good), text: s.delta.text }) : null
        ]));
      });
      app.appendChild(stats);
    }
    if (view.series) { var chart = lineChart(view.series); if (chart) app.appendChild(chart); }
    if (view.bars) { var b = bars(view.bars); if (b) app.appendChild(b); }
    if (view.notes && view.notes.length) {
      var list = el('ul', { class: 'notes' });
      view.notes.forEach(function (n) { list.appendChild(el('li', { text: n })); });
      app.appendChild(list);
    }
  }

  function openButton() {
    var button = el('button', { class: 'open', type: 'button', text: 'Open in TraceIQ ↗' });
    button.addEventListener('click', function () {
      if (!link) return;
      request('ui/open-link', { url: link }).catch(function () { window.open(link, '_blank', 'noopener'); });
    });
    return button;
  }

  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || msg.jsonrpc !== '2.0') return;
    if (msg.id !== undefined && !msg.method) {
      var waiting = pending[msg.id];
      if (waiting) { delete pending[msg.id]; msg.error ? waiting.reject(msg.error) : waiting.resolve(msg.result); }
      return;
    }
    switch (msg.method) {
      case 'ui/notifications/tool-input':
        if (!app.firstChild || app.firstChild.className === 'empty') app.innerHTML = '<p class="empty">Loading…</p>';
        break;
      case 'ui/notifications/tool-result':
        render(msg.params);
        break;
      case 'ui/notifications/tool-cancelled':
        app.innerHTML = '';
        app.appendChild(el('p', { class: 'empty', text: 'Cancelled.' }));
        break;
      case 'ui/notifications/host-context-changed':
        applyContext(msg.params);
        break;
      case 'ui/resource-teardown':
        if (msg.id !== undefined) post({ jsonrpc: '2.0', id: msg.id, result: {} });
        break;
    }
  });

  new ResizeObserver(function () {
    notify('ui/notifications/size-changed', { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight });
  }).observe(document.documentElement);

  request('ui/initialize', {
    protocolVersion: '2026-01-26',
    appInfo: { name: 'TraceIQ', version: '1' },
    clientInfo: { name: 'TraceIQ', version: '1' },
    appCapabilities: { availableDisplayModes: ['inline'] },
    capabilities: {}
  }).then(function (result) {
    applyContext(result && result.hostContext);
    notify('ui/notifications/initialized');
  }).catch(function () {
    notify('ui/notifications/initialized');
  });
})();
`;

export const WIDGET_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TraceIQ</title>
<style>${STYLE}</style>
</head>
<body>
<main id="app" aria-live="polite"><p class="empty">Loading…</p></main>
<script>${SCRIPT}</script>
</body>
</html>
`;
