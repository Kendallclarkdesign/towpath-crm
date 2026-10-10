/* Data layer. Views only talk to `store`, never to localStorage or a server.
   Two modes with the same API:
     local   saves to this browser (preview, or when config.js is empty, or ?local in the address)
     remote  reads and writes the towpath-crm Supabase database as the signed-in owner
   Reads are synchronous from an in-memory copy. Writes update that copy at once, then sync. */

import { uid, toast } from './ui.js';
import { enabled, rest } from './remote.js';

const KEY = 'towpath-crm';
export const MODE = enabled ? 'remote' : 'local';
const COLLECTIONS = ['leads', 'clients', 'agents', 'agent_tasks', 'messages', 'emails', 'events', 'activity', 'time_entries', 'settings', 'seo_vault', 'content_posts', 'site_previews', 'gsc_snapshots'];
const clone = x => JSON.parse(JSON.stringify(x));

/* Starting data (your leads, client notes, team) is loaded on demand and is NOT part of the deployed site.
   Local preview has it. The live site reads everything from the database behind your login instead. */
let SEEDS = null;
async function loadSeeds() {
  if (!SEEDS) { const [s, l] = await Promise.all([import('./seed.js'), import('./seed-leads.js')]); SEEDS = { ...s, LEADS: l.LEADS }; }
  return SEEDS;
}
if (MODE === 'local') await loadSeeds();
const seedData = () => ({
  leads: clone(SEEDS.LEADS), clients: clone(SEEDS.CLIENTS), agents: clone(SEEDS.AGENTS), agent_tasks: clone(SEEDS.AGENT_TASKS),
  messages: [], emails: [], events: [], activity: clone(SEEDS.ACTIVITY), time_entries: [], seo_vault: [], content_posts: [], site_previews: [], gsc_snapshots: [],
  settings: [{ id: 'app', provider: 'gemini', model: '', engines: {
    gemini: { enabled: false, apiKey: '' }, groq: { enabled: false, apiKey: '' },
    openrouter: { enabled: false, apiKey: '' }, cerebras: { enabled: false, apiKey: '' },
    custom: { enabled: false, apiKey: '', baseUrl: '', label: '' }
  } }]
});
const empty = () => Object.fromEntries(COLLECTIONS.map(c => [c, []]));

/* ---------- local persistence ---------- */
function persist(d) {
  if (MODE !== 'local') return; // business data never sits in browser storage in remote mode
  try { localStorage.setItem(KEY, JSON.stringify({ v: SEEDS.SEED_VERSION, data: d })); } catch (e) { /* storage full or blocked */ }
}
function loadLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.v === SEEDS.SEED_VERSION && COLLECTIONS.every(c => Array.isArray(raw.data[c]))) return raw.data;
  } catch (e) { /* fall through to a fresh seed */ }
  const d = seedData(); persist(d); return d;
}

let db = MODE === 'local' ? loadLocal() : empty();
const subs = new Set();
const emit = c => subs.forEach(fn => fn(c));

/* ---------- remote sync ---------- */
const fromRows = rows => (rows || []).map(r => ({ ...r.data, id: r.id }));
const toRow = obj => ({ id: obj.id, data: obj, updated_at: new Date().toISOString() });

/* The server returns rows in no promised order, but the roster and client list have a designed order.
   Seeding stamps each row with `order`, so nothing needs the seed files at run time. */
const byOrder = (a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.name || a.title).localeCompare(String(b.name || b.title));
const stable = (c, rows) => (c === 'agents' || c === 'clients') ? rows.sort(byOrder) : rows;
async function fetchOne(c) { return stable(c, fromRows(await rest(c + '?select=id,data&limit=5000'))); }
async function fetchAll() {
  const out = {};
  await Promise.all(COLLECTIONS.map(async c => { out[c] = await fetchOne(c); }));
  return out;
}
async function seedRemote() {
  const d = seedData();
  d.agents.forEach((a, i) => { a.order = i; });
  d.clients.forEach((c, i) => { c.order = i; });
  for (const c of COLLECTIONS) if (d[c].length) await rest(c, { method: 'POST', body: d[c].map(toRow), prefer: 'resolution=merge-duplicates,return=minimal' });
  return d;
}
async function resync(c) {
  try { db[c] = await fetchOne(c); emit(c); } catch (e) { /* next poll retries */ }
}
const syncFail = (c, e) => { if (!e.signedOut) toast('Could not save that change. Reloading the latest.'); resync(c); };

let timer = null;
async function poll() {
  if (document.hidden) return;
  try {
    const fresh = await fetchAll();
    COLLECTIONS.forEach(c => { if (JSON.stringify(fresh[c]) !== JSON.stringify(db[c])) { db[c] = fresh[c]; emit(c); } });
  } catch (e) { /* offline or signed out: keep what we have */ }
}

export const store = {
  /* Call once after sign in (remote) or at boot (local). First run in remote mode loads the starting data. */
  async init() {
    if (MODE === 'local') return;
    let d = await fetchAll();
    if (!d.agents.length) { // brand new database: load the starting team, leads and clients
      try { await loadSeeds(); } catch (e) { throw new Error('The database is empty and this copy of the app has no starting data. Sign in once from your local copy to load it.'); }
      d = await seedRemote();
    }
    db = d; emit('*');
    clearInterval(timer); timer = setInterval(poll, 60000);
    document.addEventListener('visibilitychange', poll);
  },
  stop() { clearInterval(timer); document.removeEventListener('visibilitychange', poll); db = MODE === 'local' ? db : empty(); },

  list: c => db[c],
  get: (c, id) => db[c].find(x => x.id === id),
  put(c, obj) {
    if (!obj.id) obj = { ...obj, id: uid() };
    const i = db[c].findIndex(x => x.id === obj.id);
    db[c] = i < 0 ? [...db[c], obj] : db[c].map((x, j) => j === i ? obj : x);
    if (MODE === 'local') persist(db);
    else rest(c + '?on_conflict=id', { method: 'POST', body: toRow(obj), prefer: 'resolution=merge-duplicates,return=minimal' }).catch(e => syncFail(c, e));
    emit(c);
    return obj;
  },
  patch(c, id, changes) { const o = this.get(c, id); return o ? this.put(c, { ...o, ...changes }) : null; },
  del(c, id) {
    db[c] = db[c].filter(x => x.id !== id);
    if (MODE === 'local') persist(db);
    else rest(c + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE', prefer: 'return=minimal' }).catch(e => syncFail(c, e));
    emit(c);
  },
  log(text, ref = '') { this.put('activity', { id: uid(), at: new Date().toISOString(), text, ref }); },
  sub(fn) { subs.add(fn); return () => subs.delete(fn); },
  reset() { if (MODE !== 'local') { console.warn('reset() only works in local preview mode'); return; } db = seedData(); persist(db); emit('*'); }
};
