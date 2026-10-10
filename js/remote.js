/* Minimal Supabase client: password sign in plus the REST API, using plain fetch.
   No library, so the strict Content Security Policy in netlify.toml needs no exceptions. */
import { SUPABASE_URL as URL_, SUPABASE_KEY as KEY } from './config.js';

const SESSION_KEY = 'towpath-crm-session';
export const enabled = !!(URL_ && KEY) && !new URLSearchParams(location.search).has('local');

let session = null;
try { session = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { /* no stored session */ }
const save = s => {
  session = s;
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch (e) { /* storage blocked */ }
};
const pack = j => ({ access: j.access_token, refresh: j.refresh_token, exp: Date.now() + Math.max(60, (j.expires_in || 3600) - 60) * 1000, email: (j.user && j.user.email) || '' });

async function authCall(grant, body) {
  const r = await fetch(URL_ + '/auth/v1/token?grant_type=' + grant, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_code === 'invalid_credentials' ? 'That email and password do not match.' : (j.msg || j.error_description || 'Sign in failed.'));
  return j;
}

export async function signIn(email, password) { save(pack(await authCall('password', { email, password }))); }
export const signOut = () => save(null);
export const signedIn = () => !!(session && session.refresh);
export const userEmail = () => (session && session.email) || '';

async function token() {
  if (!session) return null;
  if (Date.now() < session.exp) return session.access;
  try { save(pack(await authCall('refresh_token', { refresh_token: session.refresh }))); return session.access; }
  catch (e) { save(null); return null; }
}

export async function rest(path, { method = 'GET', body, prefer } = {}) {
  const t = await token();
  if (!t) throw Object.assign(new Error('Signed out'), { signedOut: true });
  const r = await fetch(URL_ + '/rest/v1/' + path, {
    method,
    headers: Object.assign({ apikey: KEY, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, prefer ? { Prefer: prefer } : {}),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || 'Request failed (' + r.status + ')'); }
  return r.status === 204 ? null : r.json().catch(() => null);
}

/* Calls a Supabase Edge Function as the signed-in owner. Used for anything that needs a
   server-side secret (an AI provider key, an SMTP password), never for plain data reads/writes. */
export async function fn(name, body) {
  const t = await token();
  if (!t) throw Object.assign(new Error('Signed out'), { signedOut: true });
  const r = await fetch(URL_ + '/functions/v1/' + name, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Request failed (' + r.status + ')');
  return j;
}

/* Storage: private buckets only, RLS-gated the same way every table is (owner only).
   Used for call recordings uploaded from the phone page. */
export async function uploadFile(bucket, path, file) {
  const t = await token();
  if (!t) throw Object.assign(new Error('Signed out'), { signedOut: true });
  const r = await fetch(URL_ + '/storage/v1/object/' + bucket + '/' + path, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: 'Bearer ' + t, 'Content-Type': file.type || 'application/octet-stream' },
    body: file
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || 'Upload failed (' + r.status + ')'); }
  return r.json().catch(() => ({}));
}
export async function signedUrl(bucket, path, expiresIn = 3600) {
  const t = await token();
  if (!t) throw Object.assign(new Error('Signed out'), { signedOut: true });
  const r = await fetch(URL_ + '/storage/v1/object/sign/' + bucket + '/' + path, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || 'Could not get a link (' + r.status + ')');
  return URL_ + '/storage/v1' + j.signedURL;
}
