/* App shell: login gate, sidebar and bottom nav, hash router. */
import { $, h, icon, toast, closeLayer, initials } from './ui.js';
import { store, MODE } from './store.js';
import * as remote from './remote.js';
import { FROM } from './model.js';
import * as dashboard from './views/dashboard.js';
import * as leads from './views/leads.js';
import * as phone from './views/phone.js';
import * as clients from './views/clients.js';
import * as calendar from './views/calendar.js';
import * as email from './views/email.js';
import * as team from './views/team.js';
import * as seoVault from './views/seo-vault.js';
import * as content from './views/content.js';
import * as siteBuilder from './views/site-builder.js';
import * as settings from './views/settings.js';

const NAV = [
  ['dashboard', 'Dashboard', 'dashboard', dashboard],
  ['leads', 'Leads', 'leads', leads],
  ['phone', 'Phone', 'phone', phone],
  ['clients', 'Clients', 'clients', clients],
  ['content', 'Content', 'doc', content],
  ['site-builder', 'Site Builder', 'globe', siteBuilder],
  ['calendar', 'Calendar', 'calendar', calendar],
  ['email', 'Email', 'mail', email],
  ['team', 'Team', 'team', team],
  ['seo-vault', 'SEO Vault', 'spark', seoVault],
  ['settings', 'Settings', 'settings', settings]
];

const root = $('#root');
let unmount = null;

const authed = () => MODE === 'remote' ? remote.signedIn() : sessionStorage.getItem('towpath-crm-auth') === '1';

/* ---------- login ---------- */
function renderLogin(message = '') {
  root.replaceChildren();
  const email = h('input', { id: 'l-email', type: 'email', autocomplete: 'username', value: FROM, required: true });
  const pass = h('input', { id: 'l-pass', type: 'password', autocomplete: 'current-password', required: true, placeholder: 'Password' });
  const err = h('p', { class: 'form-error', role: 'alert', text: message });
  const go = h('button', { class: 'btn primary block', type: 'submit', text: 'Sign in' });
  const form = h('form', { class: 'login-card', onsubmit: async e => {
    e.preventDefault();
    if (!pass.value) { err.textContent = 'Enter your password.'; return; }
    if (MODE === 'local') { sessionStorage.setItem('towpath-crm-auth', '1'); start(); return; }
    go.disabled = true; go.textContent = 'Signing in'; err.textContent = '';
    try { await remote.signIn(email.value.trim(), pass.value); await boot(); }
    catch (ex) { err.textContent = ex.message; go.disabled = false; go.textContent = 'Sign in'; pass.value = ''; pass.focus(); }
  } },
    h('div', { class: 'brand-lockup' }, h('span', { class: 'brand-mark' }), h('span', { class: 'brand-name', text: 'Towpath' })),
    h('h1', { text: 'Sign in' }),
    h('p', { class: 'muted', text: 'Local roots. Real results.' }),
    h('div', { class: 'field' }, h('label', { for: 'l-email', text: 'Email' }), email),
    h('div', { class: 'field' }, h('label', { for: 'l-pass', text: 'Password' }), pass),
    err, go,
    MODE === 'local' ? h('p', { class: 'preview-note' }, icon('lock', 14), h('span', { text: 'Local preview. Any password works here and nothing leaves this browser.' })) : null);
  root.append(h('main', { class: 'login' }, form));
  (MODE === 'remote' && email.value ? pass : email).focus();
}

/* Whoever is actually signed in, matched against the human entries in the team roster.
   Local preview has no real per-user session, so it always shows Kendall. */
function meInfo() {
  const emailAddr = (MODE === 'remote' && remote.userEmail()) || FROM;
  const match = MODE === 'remote' ? store.list('agents').find(a => a.human && a.email === emailAddr) : null;
  return { name: match ? match.name : 'Kendall Clark', email: emailAddr, initials: match ? initials(match.name) : 'KC' };
}

/* ---------- shell ---------- */
function shell() {
  root.replaceChildren();
  const side = h('nav', { class: 'side', 'aria-label': 'Main' },
    h('div', { class: 'brand-lockup' }, h('span', { class: 'brand-mark' }), h('span', { class: 'brand-name', text: 'Towpath' })),
    h('div', { class: 'side-links' }, NAV.map(([id, label, ic]) =>
      h('a', { href: '#/' + id, class: 'side-link', 'data-nav': id }, icon(ic), h('span', { text: label })))),
    h('div', { class: 'side-foot' },
      h('div', { class: 'me' }, h('span', { class: 'avatar', text: meInfo().initials }), h('div', null, h('strong', { text: meInfo().name }), h('span', { text: meInfo().email }))),
      h('button', { class: 'side-link ghost', type: 'button', onclick: signOut }, icon('logout'), h('span', { text: 'Sign out' }))));
  const bottom = h('nav', { class: 'bottom', 'aria-label': 'Main' }, NAV.map(([id, label, ic]) =>
    h('a', { href: '#/' + id, class: 'bottom-link', 'data-nav': id }, icon(ic, 21), h('span', { text: label }))));
  const top = h('header', { class: 'topbar' },
    h('div', { class: 'brand-lockup' }, h('span', { class: 'brand-mark' }), h('span', { class: 'brand-name', text: 'Towpath' })),
    h('button', { class: 'icon-btn light', type: 'button', 'aria-label': 'Sign out', onclick: signOut }, icon('logout')));
  const main = h('main', { id: 'main', class: 'main', tabindex: '-1' });
  root.append(h('div', { class: 'app' }, side, top, main, bottom));
}

function signOut() {
  sessionStorage.removeItem('towpath-crm-auth');
  remote.signOut(); store.stop();
  if (unmount) { unmount(); unmount = null; }
  closeLayer();
  location.hash = '';
  renderLogin();
}

/* ---------- router ---------- */
function route() {
  if (!authed()) return;
  const main = $('#main');
  if (!main) return;
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const name = NAV.some(n => n[0] === parts[0]) ? parts[0] : 'dashboard';
  const view = NAV.find(n => n[0] === name)[3];
  if (unmount) { unmount(); unmount = null; }
  closeLayer();
  main.replaceChildren();
  document.querySelectorAll('[data-nav]').forEach(a => {
    const on = a.dataset.nav === name;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const params = { args: parts.slice(1), query: new URLSearchParams(qs || '') };
  unmount = view.mount(main, params) || null;
  document.title = NAV.find(n => n[0] === name)[1] + ' | Towpath CRM';
  window.scrollTo(0, 0);
}

function start() {
  shell();
  if (!location.hash) location.hash = '#/dashboard'; else route();
}

/* Remote mode: load the database as the signed-in owner, then show the app. */
async function boot() {
  root.replaceChildren(h('main', { class: 'login' }, h('p', { class: 'boot', role: 'status', text: 'Loading your CRM' })));
  try { await store.init(); start(); }
  catch (e) { remote.signOut(); renderLogin(e.signedOut ? '' : 'Could not load the CRM: ' + e.message); }
}

window.addEventListener('hashchange', route);
if (!authed()) renderLogin(); else if (MODE === 'remote') boot(); else start();
if (MODE === 'local') window.towpathCRM = { store, toast }; // preview only: towpathCRM.store.reset()
