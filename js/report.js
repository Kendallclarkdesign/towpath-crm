/* Builds client-facing HTML documents (resolved-issues report, time report) and opens
   them in a new tab for printing to PDF. Matches the design of the hand-built client reports it replaces
   Cleaning Service: navy-style masthead, priority badges, print-ready CSS.
   Client and item text is untrusted (same rule as ui.js), everything interpolated below
   goes through escapeHtml() first, never inserted raw. */

const escapeHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLabel = (d = new Date()) => MONTHS[d.getMonth()] + ' ' + d.getFullYear();

/* Towpath's own palette, used when a client has no brand kit on file. */
const FALLBACK = { dark: '#1A2E14', accent: '#C49A3A' };
const brandOf = c => {
  const cols = (c.brand && c.brand.colors) || [];
  return { dark: (cols[0] && cols[0][1]) || FALLBACK.dark, accent: (cols[1] && cols[1][1]) || FALLBACK.accent };
};

const SEV = { high: ['High', '#B23A3A', '#8C2C2C'], med: ['Medium', '#D4A040', '#8A6118'], low: ['Low', '#4A7FB5', '#2E5A8A'] };

function shell({ clientName, period, dark, accent, bodyHtml }) {
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(clientName) + ', ' + escapeHtml(period) + '</title><style>'
    + ':root{--ink:#11203A;--dark:' + dark + ';--accent:' + accent + ';--paper:#FBFAF7;--surface:#FFFFFF;--muted:#5C6B84;--hair:#DDD8CE}'
    + 'body{background:var(--paper);color:var(--ink);font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:17px;line-height:1.65;margin:0;-webkit-font-smoothing:antialiased}'
    + '.wrap{max-width:43rem;margin:0 auto;padding:0 1.5rem}'
    + '.masthead{background:var(--dark);color:#F4F0E8;padding:3.5rem 0 3rem;border-bottom:3px solid var(--accent)}'
    + '.masthead .wrap{display:flex;flex-direction:column;gap:1.1rem}'
    + '.agency{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:#B9C4D6}'
    + '.masthead h1{font-family:ui-serif,Georgia,serif;font-size:clamp(1.8rem,6vw,2.6rem);line-height:1.1;font-weight:600;margin:0;color:#fff}'
    + '.period{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;color:var(--accent)}'
    + '.intro{padding:2.5rem 0 0}.intro p{font-family:ui-serif,Georgia,serif;font-size:1.15rem;line-height:1.6}'
    + '.summary{display:flex;align-items:baseline;gap:1.5rem;flex-wrap:wrap;margin:2rem 0 .75rem;padding:1.3rem 1.6rem;background:var(--dark);color:#F4F0E8}'
    + '.summary .count{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:2.4rem;font-weight:700;color:#fff;line-height:1}'
    + '.summary .count-label{font-size:.88rem;color:#C3CEE0}'
    + '.summary .breakdown{display:flex;gap:1.1rem;margin-left:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.78rem}'
    + '.summary .breakdown b{font-weight:700}'
    + '.summary-note{font-size:.82rem;color:var(--muted);margin-bottom:2.5rem}'
    + '.rows{display:flex;flex-direction:column;gap:1px;background:var(--hair);border:1px solid var(--hair)}'
    + '.row{background:var(--surface);padding:1.3rem 1.6rem;display:flex;flex-direction:column;gap:.5rem}'
    + '.row-top{display:flex;align-items:center;gap:.7rem;flex-wrap:wrap}'
    + '.badge{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.68rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;padding:.22rem .55rem;border-radius:3px}'
    + '.status{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.7rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#2C5D3B;margin-left:auto}.status::before{content:"\\2713 "}'
    + '.row p{margin:0}.row .desc{color:var(--ink)}'
    + '.row .benefit{font-family:ui-serif,Georgia,serif;font-style:italic;font-size:.98rem;color:' + accent + ';border-top:1px solid var(--hair);padding-top:.55rem;margin-top:.1rem}'
    + '.dur{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;color:var(--ink)}'
    + '.close{padding:2.5rem 0 3.5rem}.close p{font-family:ui-serif,Georgia,serif;font-size:1.05rem;line-height:1.6}'
    + '.sig{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-top:1.7rem;padding-top:1.1rem;border-top:1px solid var(--hair)}'
    + '@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{font-size:11.5pt}.wrap{max-width:100%;padding:0 .35in}.masthead{padding:.5in 0 .42in}.row{break-inside:avoid}.close{padding:1.5rem 0 0}}'
    + '</style></head><body>'
    + '<header class="masthead"><div class="wrap"><div class="agency">Towpath Creative</div><h1>' + escapeHtml(clientName) + '</h1><div class="period">' + escapeHtml(period) + '</div></div></header>'
    + '<main class="wrap">' + bodyHtml + '</main></body></html>';
}

/* ---------- resolved-issues report ---------- */
export function resolvedReportHTML(client, doneItems, period = monthLabel()) {
  const { dark, accent } = brandOf(client);
  const counts = { high: 0, med: 0, low: 0 };
  doneItems.forEach(i => { counts[i.sev] = (counts[i.sev] || 0) + 1; });
  const rows = doneItems.map(i => {
    const [label, bg, text] = SEV[i.sev] || SEV.low;
    return '<div class="row"><div class="row-top"><span class="badge" style="background:' + bg + '22;color:' + text + '">' + label + '</span><span class="status">Resolved</span></div>'
      + '<p class="desc">' + escapeHtml(i.text) + '</p>'
      + (i.benefit ? '<p class="benefit">' + escapeHtml(i.benefit) + '</p>' : '') + '</div>';
  }).join('');
  const body =
    '<section class="intro"><p>Every issue we found and fixed on your site and listings, tracked the same way from the first audit through today.</p></section>'
    + '<section><div class="summary"><div><div class="count">' + doneItems.length + '</div><div class="count-label">issues resolved</div></div>'
    + '<div class="breakdown"><span><b>' + counts.high + '</b> High</span><span><b>' + counts.med + '</b> Medium</span><span><b>' + counts.low + '</b> Low</span></div></div>'
    + '<p class="summary-note">High means it could affect your safety or your customers’ trust. Medium means something important was missing. Low means cleanup or behind-the-scenes work.</p></section>'
    + '<div class="rows">' + (rows || '<div class="row"><p class="desc">Nothing marked resolved yet.</p></div>') + '</div>'
    + '<section class="close"><p>This is what we mean when we say we’re actually managing your website, not just building it once and walking away.</p><div class="sig">Towpath Creative</div></section>';
  return shell({ clientName: client.name, period: 'Resolved Issues Log · ' + period, dark, accent, bodyHtml: body });
}

/* ---------- time report ---------- */
const hours = ms => (ms / 3600000);
const fmtHours = h => (Math.round(h * 100) / 100).toString();
const fmtDate = iso => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function timeReportHTML(client, entries, period = monthLabel()) {
  const { dark, accent } = brandOf(client);
  const closed = entries.filter(e => e.endedAt).sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const totalH = closed.reduce((sum, e) => sum + hours(new Date(e.endedAt) - new Date(e.startedAt)), 0);
  const rows = closed.map(e => {
    const h = hours(new Date(e.endedAt) - new Date(e.startedAt));
    return '<div class="row"><div class="row-top"><span class="desc">' + escapeHtml(fmtDate(e.startedAt)) + '</span><span class="dur" style="margin-left:auto">' + fmtHours(h) + ' hrs</span></div>'
      + (e.note ? '<p class="desc">' + escapeHtml(e.note) + '</p>' : '') + '</div>';
  }).join('');
  const body =
    '<section class="intro"><p>Time logged working on your account, so hours worked are documented plainly rather than tracked by memory.</p></section>'
    + '<section><div class="summary"><div><div class="count">' + fmtHours(totalH) + '</div><div class="count-label">hours logged</div></div>'
    + '<div class="breakdown"><span><b>' + closed.length + '</b> entries</span></div></div></section>'
    + '<div class="rows">' + (rows || '<div class="row"><p class="desc">No time logged for this period yet.</p></div>') + '</div>'
    + '<section class="close"><div class="sig">Towpath Creative</div></section>';
  return shell({ clientName: client.name, period: 'Time Report · ' + period, dark, accent, bodyHtml: body });
}

/* ---------- open for printing ---------- */
export function openPrintable(html) {
  const w = window.open('', '_blank');
  if (!w) { return false; }
  w.document.open(); w.document.write(html); w.document.close();
  return true;
}
