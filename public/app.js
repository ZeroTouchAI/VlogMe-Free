import { OWNER, MORE_PROJECTS, LINKS, REFERRALS, DISCLOSURE } from './referrals.js';
import { icon } from './icons.js';
import { STYLES } from './styles-data.js';

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  }
  kids.forEach((c) => n.append(c));
  return n;
};
const state = { ffmpeg: null, clips: [], moments: [], busy: false, lastUrls: [], picked: [], style: 'general', format: 'horizontal' };
const FORMATS = {
  horizontal: { ratio: '16:9', use: 'YouTube (widescreen)', w: 30, h: 18, dims: [1280, 720] },
  portrait: { ratio: '4:5', use: 'Instagram feed', w: 20, h: 25, dims: [720, 900] },
  shorts: { ratio: '9:16', use: 'Shorts, Reels, TikTok', w: 16, h: 28, dims: [720, 1280] },
};
const LIMITS = { clips: 12, totalBytes: 800e6, proxyBytes: 14e6 };

// ---------- referrals / links ----------
function refLink(r) {
  return el('a', { href: r.url, target: '_blank', rel: 'sponsored noopener noreferrer', text: r.name });
}
function refCard(r, text) {
  return el('div', { class: 'referral' }, refLink(r), el('span', { text: ' - ' + text }));
}
function enabled(placement) {
  return REFERRALS.filter((r) => r.enabled && r.url && r.placements.includes(placement));
}
function initLinks() {
  $('disclosure').textContent = DISCLOSURE;
  $('geminiLink').href = LINKS.geminiKey;
  $('musicLink').href = LINKS.pixabayMusic;
  $('owner').href = OWNER.url;
  $('owner').textContent = OWNER.name;
  const eleven = REFERRALS.find((r) => r.id === 'elevenlabs' && r.enabled);
  if (eleven) {
    $('elevenHelp').append('Get a key at ', refLink(eleven), ' (Profile > API keys).');
  }
  const setup = $('referral-setup');
  enabled('setup').forEach((r) => r.setup && setup.append(refCard(r, r.setup)));
  const tools = enabled('tools');
  if (tools.length) {
    $('tools').classList.remove('hidden');
    tools.forEach((r) => $('tools-list').append(refCard(r, r.tools || '')));
  }
  if (MORE_PROJECTS.length) {
    $('makers').classList.remove('hidden');
    const list = $('makers-list');
    MORE_PROJECTS.forEach((p, i) => {
      if (i) list.append(' \u00b7 ');
      list.append(el('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer', text: p.name }));
    });
  }
}
function showQuotaReferral() {
  const box = $('referral-quota');
  box.replaceChildren();
  enabled('quota').forEach((r) => r.quota && box.append(refCard(r, r.quota)));
  if (box.children.length) box.classList.remove('hidden');
}

// ---------- keys (browser only) ----------
const KEYS = { geminiKey: 'vm_gemini', elevenKey: 'vm_eleven', geminiModel: 'vm_model', voice: 'vm_voice' };
function store() { return $('remember').checked ? localStorage : sessionStorage; }
function loadSaved() {
  try {
    const useLocal = localStorage.getItem('vm_gemini') || localStorage.getItem('vm_eleven');
    $('remember').checked = !!useLocal;
    const s = useLocal ? localStorage : sessionStorage;
    for (const [id, k] of Object.entries(KEYS)) {
      const v = s.getItem(k);
      if (v && id !== 'voice') $(id).value = v;
    }
  } catch { /* storage blocked: fine */ }
}
function saveKeys() {
  try {
    const s = store();
    const other = s === localStorage ? sessionStorage : localStorage;
    for (const [id, k] of Object.entries(KEYS)) {
      other.removeItem(k);
      const v = $(id).value.trim();
      if (id === 'voice' && !v) continue; // keep the remembered voice until voices load
      s.setItem(k, v);
    }
  } catch { /* ignore */ }
}

// ---------- helpers ----------
const log = (m) => { const pt = $('progressText'); if (pt) pt.textContent = m; const l = $('log'); l.textContent += m + '\n'; l.scrollTop = l.scrollHeight; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function extOf(name) { const m = /\.([a-z0-9]{2,4})$/i.exec(name); return m ? m[1].toLowerCase() : 'mp4'; }
function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function parseTime(t) {
  if (typeof t === 'number') return t;
  const p = String(t).trim().split(':').map(Number);
  if (p.some((x) => !Number.isFinite(x))) return NaN;
  return p.reduce((a, x) => a * 60 + x, 0);
}
function fmt(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }
function setBusy(b) { state.busy = b; ['analyze', 'render', 'loadVoices'].forEach((id) => ($(id).disabled = b)); }

// ---------- ffmpeg.wasm ----------
async function getFFmpeg() {
  if (state.ffmpeg) return state.ffmpeg;
  if (!window.FFmpegWASM) throw new Error('Video engine failed to load. Refresh the page.');
  const ff = new window.FFmpegWASM.FFmpeg();
  log('Loading video engine (about 30 MB, first time only)...');
  await ff.load({ coreURL: '/vendor/core/ffmpeg-core.js', wasmURL: '/vendor/core/ffmpeg-core.wasm' });
  state.ffmpeg = ff;
  return ff;
}
async function makeProxy(clip, i) {
  const ff = await getFFmpeg();
  await ff.writeFile(clip.name, await window.FFmpegUtil.fetchFile(clip.file));
  const out = `p${i}.mp4`;
  const code = await ff.exec(['-i', clip.name, '-vf', 'scale=-2:360,fps=4', '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '35', out]);
  if (code !== 0) throw new Error(`Could not read ${clip.file.name}. Try converting it to H.264 MP4 first.`);
  const data = await ff.readFile(out);
  await ff.deleteFile(out);
  return data;
}

// ---------- Gemini ----------
async function gemini(parts) {
  const key = $('geminiKey').value.trim();
  const model = $('geminiModel').value.trim() || 'gemini-2.5-flash';
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.7 } }),
    });
    if ((r.status === 429 || r.status === 503) && attempt < 2) { log('Gemini is busy, retrying...'); await sleep(4000 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error(`Gemini error ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    const txt = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    return JSON.parse(txt.replace(/^```json\s*|```\s*$/g, '').trim());
  }
}
const ANALYZE_PROMPT = 'This is a low-resolution silent copy of one clip from a personal vlog. Return JSON: {"summary": string, "moments": [{"start": "MM:SS", "end": "MM:SS", "what": string}]}. Pick the 1 to 4 most interesting, non-overlapping moments, each 3 to 15 seconds long. Times must be inside the clip. "what" is one plain sentence describing what is visible.';

async function analyze() {
  const files = [...state.picked];
  if (!$('geminiKey').value.trim()) throw new Error('Add your Gemini key first.');
  if (!files.length) throw new Error('Choose at least one video clip.');
  if (files.length > LIMITS.clips) throw new Error(`Please use ${LIMITS.clips} clips or fewer.`);
  if (files.reduce((a, f) => a + f.size, 0) > LIMITS.totalBytes) throw new Error('Footage is over about 800 MB. Trim or pick fewer clips; browsers run out of memory beyond that.');
  saveKeys();
  $('log').textContent = '';
  state.clips = files.map((f, i) => ({ file: f, name: `in${i}.${extOf(f.name)}` }));
  state.moments = [];
  for (let i = 0; i < state.clips.length; i++) {
    const c = state.clips[i];
    log(`Clip ${i + 1}/${files.length}: preparing ${c.file.name}`);
    const proxy = await makeProxy(c, i);
    if (proxy.length > LIMITS.proxyBytes) throw new Error(`${c.file.name} is too long to analyze. Trim it to a few minutes.`);
    log('Gemini is watching it...');
    const res = await gemini([{ inline_data: { mime_type: 'video/mp4', data: toB64(proxy) } }, { text: ANALYZE_PROMPT }]);
    (res.moments || []).forEach((m, j) => {
      const s = parseTime(m.start), e = parseTime(m.end);
      if (Number.isFinite(s) && Number.isFinite(e) && e > s) state.moments.push({ id: `c${i}m${j}`, clip: i, start: s, end: e, what: String(m.what || '') });
    });
  }
  if (!state.moments.length) throw new Error('Gemini did not find usable moments. Try different clips.');
  log('Writing your script...');
  const catalog = state.moments.map((m) => `${m.id} | clip "${state.clips[m.clip].file.name}" ${fmt(m.start)}-${fmt(m.end)} | ${m.what}`).join('\n');
  const words = Math.round(Number($('length').value || 60) * 2.5);
  const prompt = `You write narration for a personal vlog. Video style: ${STYLES[state.style].guide} Tone: ${$('tone').value}. Topic notes from the creator: ${$('topic').value.trim() || '(none)'}.\nAvailable moments:\n${catalog}\n\nReturn JSON: {"title": string, "description": string, "segments": [{"moment": string, "narration": string}]}.\nRules: first person, spoken style, about ${words} words of narration in total; use each moment at most once, in an order that tells a story; 1 to 3 sentences per segment; narration is only the words to be spoken (no emojis, no stage directions); only describe what the moment descriptions support.`;
  const plan = await gemini([{ text: prompt }]);
  const segs = (plan.segments || []).filter((s) => state.moments.some((m) => m.id === s.moment) && String(s.narration || '').trim());
  if (!segs.length) throw new Error('The script came back empty. Try again.');
  showPlan(plan.title, plan.description, segs);
  log('Script ready. Review it below, then render.');
}
function showPlan(title, desc, segs) {
  $('title').value = $('vName').value.trim() || title || '';
  $('desc').value = desc || '';
  const box = $('segments');
  box.replaceChildren();
  segs.forEach((s) => {
    const m = state.moments.find((x) => x.id === s.moment);
    const del = el('button', { type: 'button', text: 'Remove' });
    const ta = el('textarea', { rows: '3' });
    ta.value = String(s.narration).trim();
    const row = el('div', { class: 'seg', 'data-moment': m.id }, el('div', { class: 'meta' }, el('span', { text: `${state.clips[m.clip].file.name} ${fmt(m.start)}-${fmt(m.end)}: ${m.what}` }), del), ta);
    del.addEventListener('click', () => row.remove());
    box.append(row);
  });
  $('step-script').classList.remove('hidden');
  $('step-script').scrollIntoView({ behavior: 'smooth' });
}

// ---------- ElevenLabs ----------
async function loadVoices() {
  const key = $('elevenKey').value.trim();
  if (!key) throw new Error('Add your ElevenLabs key first.');
  saveKeys();
  const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
  if (!r.ok) throw new Error(`ElevenLabs error ${r.status}: could not load voices. Check the key.`);
  const j = await r.json();
  const sel = $('voice');
  sel.replaceChildren();
  (j.voices || []).forEach((v) => sel.append(el('option', { value: v.voice_id, text: v.name })));
  try { const saved = (state.keyStore || store()).getItem(KEYS.voice); if (saved) sel.value = saved; } catch { /* ignore */ }
  log(`Loaded ${sel.options.length} voices.`);
}
async function tts(text, prev, next) {
  const voice = $('voice').value;
  if (!voice) throw new Error('Load your voices and pick one first.');
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': $('elevenKey').value.trim(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', previous_text: prev || undefined, next_text: next || undefined }),
  });
  if (!r.ok) {
    const body = await r.text();
    const e = new Error(`ElevenLabs error ${r.status}: ${body.slice(0, 200)}`);
    e.quota = [401, 402, 429].includes(r.status) || /quota|limit|credit/i.test(body);
    throw e;
  }
  return new Uint8Array(await r.arrayBuffer());
}
async function audioDuration(u8) {
  const ctx = new AudioContext();
  try { return (await ctx.decodeAudioData(u8.slice().buffer)).duration; } finally { ctx.close(); }
}

// ---------- render ----------
function srtTime(t) {
  const ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(ms % 1000, 3)}`;
}
function buildSrt(items) {
  let n = 1, t = 0, out = '';
  for (const it of items) {
    const words = it.text.split(/\s+/).filter(Boolean);
    const chunks = [];
    for (let i = 0; i < words.length; i += 7) chunks.push(words.slice(i, i + 7).join(' '));
    const each = it.dur / Math.max(chunks.length, 1);
    chunks.forEach((c, i) => { out += `${n++}\n${srtTime(t + i * each)} --> ${srtTime(t + (i + 1) * each)}\n${c}\n\n`; });
    t += it.dur;
  }
  return out;
}
async function render() {
  const rows = [...$('segments').children].map((r) => ({ moment: state.moments.find((m) => m.id === r.dataset.moment), text: r.querySelector('textarea').value.trim() })).filter((r) => r.moment && r.text);
  if (!rows.length) throw new Error('No segments to render.');
  if (!$('elevenKey').value.trim()) throw new Error('Add your ElevenLabs key first.');
  saveKeys();
  const ff = await getFFmpeg();
  const [W, H] = FORMATS[state.format].dims;
  const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=60`;
  const items = [];
  let list = '';
  for (let i = 0; i < rows.length; i++) {
    const { moment, text } = rows[i];
    log(`Segment ${i + 1}/${rows.length}: recording narration...`);
    let audio;
    try { audio = await tts(text, rows[i - 1]?.text, rows[i + 1]?.text); }
    catch (e) { if (e.quota) showQuotaReferral(); throw e; }
    const dur = await audioDuration(audio);
    await ff.writeFile(`a${i}.mp3`, audio);
    log(`Segment ${i + 1}/${rows.length}: cutting video (${dur.toFixed(1)}s)...`);
    const code = await ff.exec(['-ss', String(moment.start), '-i', state.clips[moment.clip].name, '-i', `a${i}.mp3`, '-t', dur.toFixed(2), '-vf', vf, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', `s${i}.mp4`]);
    if (code !== 0) throw new Error(`Rendering segment ${i + 1} failed.`);
    await ff.deleteFile(`a${i}.mp3`);
    list += `file 's${i}.mp4'\n`;
    items.push({ text, dur });
  }
  log('Joining segments...');
  await ff.writeFile('list.txt', list);
  if (await ff.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'joined.mp4']) !== 0) throw new Error('Joining failed.');
  let finalName = 'joined.mp4';
  const music = $('music').files[0];
  if (music) {
    log('Mixing in your music...');
    const mname = `music.${extOf(music.name)}`;
    await ff.writeFile(mname, await window.FFmpegUtil.fetchFile(music));
    const code = await ff.exec(['-i', 'joined.mp4', '-stream_loop', '-1', '-i', mname, '-filter_complex', '[1:a]volume=0.12[m];[0:a][m]amix=inputs=2:duration=first,volume=1.6[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', 'final.mp4']);
    if (code === 0) finalName = 'final.mp4'; else log('Music mix failed; using narration only.');
  }
  const data = await ff.readFile(finalName);
  state.lastUrls.forEach((u) => URL.revokeObjectURL(u));
  const vUrl = URL.createObjectURL(new Blob([data], { type: 'video/mp4' }));
  const sUrl = URL.createObjectURL(new Blob([buildSrt(items)], { type: 'text/plain' }));
  state.lastUrls = [vUrl, sUrl];
  $('player').src = vUrl;
  $('dlVideo').href = vUrl;
  $('dlSrt').href = sUrl;
  $('step-result').classList.remove('hidden');
  $('step-result').scrollIntoView({ behavior: 'smooth' });
  log('Done! Download your video below.');
}

// ---------- page UI (design ported from VlogMe) ----------
function drawStyles() {
  $('styles').replaceChildren(...Object.entries(STYLES).map(([key, s]) => {
    const tile = el('button', { type: 'button', class: 'tile-btn', 'aria-pressed': String(state.style === key) });
    tile.style.background = `linear-gradient(160deg, hsl(${s.hue} 70% 45%), hsl(${(s.hue + 40) % 360} 65% 18%))`;
    const img = el('img', { class: 'photo', src: `/styles/${key}.jpg`, alt: '' });
    img.addEventListener('load', () => tile.classList.add('has-img'));
    img.addEventListener('error', () => img.remove());
    tile.append(img, el('span', { class: 'pic', 'aria-hidden': 'true', text: s.emoji }), el('span', { class: 'cap', text: s.label }));
    tile.addEventListener('click', () => { state.style = key; drawStyles(); });
    return tile;
  }));
  const label = STYLES[state.style].label;
  $('inspire').href = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(label + ' vlog');
  $('inspireText').textContent = `See what popular ${label} videos look like on YouTube.`;
}
function drawFormats() {
  $('formats').replaceChildren(...Object.entries(FORMATS).map(([key, f]) => {
    const shape = el('span', { class: 'shape' });
    shape.style.width = f.w + 'px';
    shape.style.height = f.h + 'px';
    const b = el('button', { type: 'button', class: 'format', 'aria-pressed': String(state.format === key) }, shape, el('div', {}, el('b', { text: f.ratio }), el('small', { text: f.use })));
    b.addEventListener('click', () => { state.format = key; drawFormats(); });
    return b;
  }));
}
function drawFiles() {
  $('files').replaceChildren(...state.picked.map((f, i) => {
    const rm = el('button', { type: 'button', class: 'x', 'aria-label': `Remove ${f.name}` });
    rm.append(icon('x'));
    rm.addEventListener('click', () => { state.picked.splice(i, 1); drawFiles(); });
    return el('li', {}, el('span', { class: 'pos', text: String(i + 1) }), el('b', { class: 'fname', text: f.name }), el('small', { class: 'muted', text: (f.size / 1e6).toFixed(1) + ' MB' }), rm);
  }));
}
function addFiles(list) {
  for (const f of list) {
    if (!/^video\//.test(f.type) && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name)) continue;
    if (!state.picked.some((p) => p.name === f.name && p.size === f.size)) state.picked.push(f);
  }
  drawFiles();
}
function initUi() {
  document.querySelectorAll('[data-icon]').forEach((n) => {
    const svg = icon(n.dataset.icon);
    n.tagName === 'I' ? n.replaceWith(svg) : n.append(svg);
  });
  drawStyles();
  drawFormats();
  const drop = $('drop'), input = $('clips');
  drop.addEventListener('click', (e) => { if (e.target !== input) input.click(); });
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files); });
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  $('srcDevice').addEventListener('click', () => input.click());
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    document.getElementById(b.dataset.go)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelectorAll('.side nav button').forEach((x) => x.classList.toggle('on', x === b));
  }));
}

// ---------- wiring ----------
function run(fn) {
  return async () => {
    if (state.busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { console.error(e); log('Error: ' + (e.message || e)); }
    finally { setBusy(false); }
  };
}
initLinks();
initUi();
loadSaved();
$('analyze').addEventListener('click', run(analyze));
$('render').addEventListener('click', run(render));
$('loadVoices').addEventListener('click', run(loadVoices));
$('voice').addEventListener('change', () => { try { store().setItem(KEYS.voice, $('voice').value); } catch { /* ignore */ } });
