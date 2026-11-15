import { GOOGLE_CLIENT_ID } from './auth-config.js';

// One popup does both jobs: signs the user in and grants a hidden, app-only
// Google Drive folder (drive.appdata) where their settings are saved.
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const SCOPE = `openid email profile ${DRIVE_SCOPE}`;
const SESSION_KEY = 'vm_user';
const FILE = 'vlogme-settings.json';

let tokenClient = null;
let pending = null;
let accessToken = null;
let tokenExpiry = 0;
let driveGranted = false;
let fileId = null;

export function getUser() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function saveUser(u) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(u)); } catch { /* ignore */ } }
export function hasDrive() { return driveGranted || !!getUser()?.drive; }

function waitForGoogle() {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function poll() {
      if (window.google?.accounts?.oauth2) return resolve();
      if (Date.now() - t0 > 10000) return reject(new Error('Google sign-in could not load. Check your connection or ad blocker and try again.'));
      setTimeout(poll, 100);
    })();
  });
}
function ensureClient() {
  if (tokenClient) return;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPE,
    callback: (r) => {
      const p = pending; pending = null;
      if (!p) return;
      r.error ? p.reject(new Error(r.error_description || r.error)) : p.resolve(r);
    },
    error_callback: (e) => {
      const p = pending; pending = null;
      p?.reject(new Error(e?.type === 'popup_closed' ? 'Sign-in was cancelled.' : e?.type === 'popup_failed_to_open' ? 'Your browser blocked the sign-in popup. Allow popups for this site and try again.' : 'Sign-in failed.'));
    },
  });
}
async function requestToken(prompt) {
  await waitForGoogle();
  ensureClient();
  return new Promise((resolve, reject) => { pending = { resolve, reject }; tokenClient.requestAccessToken({ prompt }); });
}
function setToken(r) {
  accessToken = r.access_token;
  tokenExpiry = Date.now() + (Number(r.expires_in) || 3600) * 1000;
  driveGranted = window.google.accounts.oauth2.hasGrantedAnyScope(r, DRIVE_SCOPE);
  const u = getUser();
  if (u) saveUser({ ...u, drive: driveGranted });
}

export async function signIn() {
  if (!GOOGLE_CLIENT_ID) throw new Error('Sign-in is not configured yet.');
  const r = await requestToken('');
  setToken(r);
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error('Could not read your Google profile.');
  const p = await res.json();
  const user = { sub: p.sub, name: p.name || p.given_name || '', email: p.email || '', picture: p.picture || '', drive: driveGranted };
  saveUser(user);
  return user;
}
export async function ensureToken(interactive = false) {
  if (accessToken && Date.now() < tokenExpiry - 60000) return true;
  try { setToken(await requestToken(interactive ? '' : 'none')); return true; } catch { return false; }
}
export function signOut() {
  accessToken = null; tokenExpiry = 0; driveGranted = false; fileId = null;
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

async function drive(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${accessToken}`, ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`Drive ${r.status}`);
  return r;
}
export async function loadSettings() {
  if (!accessToken) return null;
  const q = encodeURIComponent(`name='${FILE}'`);
  const list = await (await drive(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)`)).json();
  fileId = list.files?.[0]?.id || null;
  if (!fileId) return null;
  return (await drive(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`)).json();
}
export async function saveSettings(obj) {
  if (!accessToken) return;
  const body = JSON.stringify(obj);
  if (fileId) {
    await drive(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    return;
  }
  const b = 'vm' + Date.now();
  const meta = JSON.stringify({ name: FILE, parents: ['appDataFolder'] });
  const multipart = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
  const r = await drive('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body: multipart });
  fileId = (await r.json()).id;
}
