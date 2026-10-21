// Club Post Maker: everything runs in the browser. Photos are read from the device,
// drawn onto a canvas and saved back to the device. Nothing is ever uploaded.

import { FORMATS, TEMPLATES, MAX_ZOOM, drawPost, drawGuides, defaultCrop, clampCrop, panCrop, loadLogo, blobToImage } from './render.js';
import { makeZip } from './zip.js';

const $ = (sel) => document.querySelector(sel);
const PREFS_KEY = 'postmaker.prefs';
const LOG_KEY = 'postmaker.sponsorLog';
const MAX_PHOTO_SIDE = 2560;   // photos are downscaled to this on load to keep phones happy
const JPG_QUALITY = 0.92;

let config, sponsors = [];
const assets = { club: null, sponsors: new Map(), overlays: {} };
const state = {
  photos: [],          // { id, name, img, thumb, crops: { feed, story, square } }
  sel: 0,
  format: 'feed',
  template: 'game-day',
  sponsorName: '',
  fields: { date: todayISO(), opponent: '', ourScore: '', theirScore: '', headline: '', subtext: '' },
  out: { feed: true, story: true, square: false },
  fileType: 'jpg',
  captionIdx: 0,
  outputs: [],         // { name, blob, url }
};

init();

async function init() {
  try {
    [config, sponsors] = await Promise.all([getJSON('config.json'), getJSON('sponsors.json')]);
  } catch (e) {
    return fatal(e.message);
  }
  sponsors = sponsors.filter((sp) => sp && sp.name && sp.active !== false);
  if (!sponsors.length) return fatal('No active sponsors found in sponsors.json. Add one with "active": true.');

  loadPrefs();
  applyBranding();
  buildFormatUI();
  buildTemplatePicker();
  buildSponsorSelect();
  bindFields();
  bindPreview();
  bindPhotos();
  bindOutputs();
  bindCaption();
  bindLog();
  showFields();
  renderThumbs();
  updateCaption();
  renderLog();
  render();

  // Assets load in the background; the preview redraws as each one arrives.
  await loadFonts();
  render();
  loadLogo(config.clubLogo)
    .then((a) => { assets.club = a; showLogoWarnings(); render(); })
    .catch((e) => { assets.clubError = e.message; showLogoWarnings(); });
  ensureSponsorLogo();
  loadOverlays();
}

// ---------- Config & branding ----------

async function getJSON(url) {
  let res;
  try {
    res = await fetch(url, { cache: 'no-cache' });
  } catch {
    throw new Error(`Couldn't load ${url}. If you opened index.html directly from your computer, run it from a local web server instead (see README).`);
  }
  if (!res.ok) throw new Error(`Couldn't load ${url} (${res.status}).`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${url} has a formatting mistake, so the app can't read it.\n${e.message}\n\nCheck for a missing comma, quote mark or bracket near that spot.`);
  }
}

function fatal(msg) {
  const el = $('#fatal');
  el.textContent = msg;
  el.hidden = false;
  document.querySelector('.layout').hidden = true;
}

function applyBranding() {
  const root = document.documentElement.style;
  root.setProperty('--primary', config.colors.primary);
  root.setProperty('--accent', config.colors.accent);
  $('#appTitle').textContent = `${config.clubName} Post Maker`;
  document.title = `${config.clubName} Post Maker`;
  $('#clubLogoImg').src = config.clubLogo;
  if (config.fonts?.googleFontsUrl) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = config.fonts.googleFontsUrl;
    document.head.appendChild(link);
  }
}

// Fonts must be loaded before drawing, or the canvas silently uses a fallback.
async function loadFonts() {
  const f = config.fonts || {};
  try {
    for (const face of f.files || []) {
      const ff = new FontFace(face.family, `url(${face.url})`, { weight: String(face.weight || 400) });
      document.fonts.add(await ff.load());
    }
    await Promise.race([
      Promise.all([
        document.fonts.load(`400 100px "${f.display}"`),
        document.fonts.load(`600 100px "${f.body}"`),
        document.fonts.load(`800 100px "${f.body}"`),
      ]),
      sleep(5000),
    ]);
  } catch (e) {
    console.warn('Font loading failed', e);
  }
}

// Optional image-based frames: config.frameOverlays = { "game-day": { "feed": "templates/x.png" } }
function loadOverlays() {
  for (const [tpl, byFormat] of Object.entries(config.frameOverlays || {})) {
    for (const [fmt, url] of Object.entries(byFormat || {})) {
      fetch(url, { cache: 'no-cache' })
        .then((r) => (r.ok ? r.blob() : Promise.reject()))
        .then(blobToImage)
        .then((img) => { (assets.overlays[tpl] ||= {})[fmt] = img; render(); })
        .catch(() => console.warn(`Frame overlay not found: ${url}`));
    }
  }
}

function currentSponsor() {
  return sponsors.find((sp) => sp.name === state.sponsorName) || sponsors[0];
}

async function ensureSponsorLogo() {
  const sp = currentSponsor();
  if (!assets.sponsors.has(sp.name)) {
    const entry = { asset: null, error: null };
    assets.sponsors.set(sp.name, entry);
    if (!sp.logo) entry.error = `${sp.name} has no "logo" in sponsors.json.`;
    else {
      try { entry.asset = await loadLogo(sp.logo); }
      catch (e) { entry.error = e.message; }
    }
  }
  showLogoWarnings();
  render();
}

function showLogoWarnings() {
  const sp = currentSponsor();
  const entry = assets.sponsors.get(sp.name);
  const msgs = [
    ...(assets.clubError ? [assets.clubError] : assets.club?.warnings || []),
    ...(entry?.error ? [`${entry.error} Showing the sponsor's name instead.`] : entry?.asset?.warnings || []),
  ];
  const box = $('#logoWarnings');
  box.hidden = !msgs.length;
  box.innerHTML = msgs.length ? `<strong>Logo check (for the maintainer):</strong><ul>${msgs.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '';
}

// ---------- Preferences ----------

function loadPrefs() {
  const p = storageGet(PREFS_KEY) || {};
  if (TEMPLATES[p.template]) state.template = p.template;
  if (sponsors.some((sp) => sp.name === p.sponsorName)) state.sponsorName = p.sponsorName;
  else state.sponsorName = sponsors[0].name;
  if (p.out && Object.values(p.out).some(Boolean)) state.out = { ...state.out, ...p.out };
  if (p.fileType === 'png' || p.fileType === 'jpg') state.fileType = p.fileType;
}

function savePrefs() {
  storageSet(PREFS_KEY, { template: state.template, sponsorName: state.sponsorName, out: state.out, fileType: state.fileType });
}

// ---------- Controls ----------

function buildFormatUI() {
  const tabs = $('#formatTabs'), checks = $('#formatChecks');
  for (const f of Object.values(FORMATS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab';
    b.role = 'tab';
    b.dataset.format = f.id;
    b.innerHTML = `${f.label}<small>${f.ratio}</small>`;
    b.onclick = () => { state.format = f.id; updateTabs(); render(); };
    tabs.appendChild(b);

    const l = document.createElement('label');
    l.className = 'check';
    l.innerHTML = `<input type="checkbox" value="${f.id}"> ${f.label} <span class="muted small">${f.w}×${f.h}</span>`;
    const cb = l.querySelector('input');
    cb.checked = !!state.out[f.id];
    cb.onchange = () => { state.out[f.id] = cb.checked; savePrefs(); };
    checks.appendChild(l);
  }
  updateTabs();
  $('#fileType').value = state.fileType;
  $('#fileType').onchange = (e) => { state.fileType = e.target.value; savePrefs(); };
}

function updateTabs() {
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.format === state.format)));
}

function buildTemplatePicker() {
  const box = $('#templatePicker');
  const desc = {
    'game-day': 'Score, opponent, date and "Presented by" sponsor bar',
    'highlight': 'A big headline like "Big save!" plus sponsor logo',
    'thank-you': 'Large sponsor logo with a thank-you message',
  };
  for (const [id, t] of Object.entries(TEMPLATES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.role = 'radio';
    b.dataset.template = id;
    b.innerHTML = `<strong>${esc(t.name)}</strong><span>${esc(desc[id] || '')}</span>`;
    b.onclick = () => {
      state.template = id;
      state.captionIdx = 0;
      savePrefs();
      updateTemplatePicker();
      showFields();
      buildCaptionPick();
      updateCaption();
      render();
    };
    box.appendChild(b);
  }
  updateTemplatePicker();
}

function updateTemplatePicker() {
  document.querySelectorAll('#templatePicker button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.template === state.template)));
}

function buildSponsorSelect() {
  const sel = $('#sponsor');
  sel.innerHTML = sponsors.map((sp) => `<option>${esc(sp.name)}</option>`).join('');
  sel.value = state.sponsorName;
  sel.onchange = () => {
    state.sponsorName = sel.value;
    savePrefs();
    updateCaption();
    ensureSponsorLogo();
  };
}

const FIELD_IDS = ['date', 'opponent', 'ourScore', 'theirScore', 'headline', 'subtext'];

function bindFields() {
  for (const id of FIELD_IDS) {
    const el = $(`#f-${id}`);
    el.value = state.fields[id];
    el.addEventListener('input', () => {
      state.fields[id] = el.value.trim();
      updateCaption();
      render();
    });
  }
}

// Show only the inputs the chosen template uses.
function showFields() {
  const used = TEMPLATES[state.template].fields;
  document.querySelectorAll('[data-field]').forEach((el) => { el.hidden = !used.includes(el.dataset.field); });
  document.querySelectorAll('[data-opt-for]').forEach((el) => { el.hidden = el.dataset.optFor !== state.template; });
}

// Text and settings that go onto the image.
function postData() {
  const f = state.fields, sp = currentSponsor();
  const score = f.ourScore !== '' || f.theirScore !== '' ? `${f.ourScore || '0'} – ${f.theirScore || '0'}` : '';
  return {
    dateLabel: prettyDate(f.date),
    opponent: f.opponent,
    score,
    headline: f.headline,
    subtext: f.subtext,
    sponsorName: sp.name,
    sponsorPlate: sp.plate,
  };
}

function postOpts(photo, formatId) {
  return {
    photo: photo?.img || null,
    crop: photo?.crops[formatId] || defaultCrop(),
    template: state.template,
    data: postData(),
    brand: config,
    assets: { club: assets.club, sponsor: assets.sponsors.get(currentSponsor().name)?.asset || null, overlays: assets.overlays },
  };
}

// ---------- Preview ----------

let frame = 0;
function render() {
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; drawPreview(); });
}

function drawPreview() {
  if (!config) return;
  const fmt = FORMATS[state.format];
  const c = $('#preview');
  if (c.width !== fmt.w) c.width = fmt.w;
  if (c.height !== fmt.h) c.height = fmt.h;
  c.style.maxWidth = `calc(var(--stage-h) * ${fmt.w / fmt.h})`;
  const ctx = c.getContext('2d');
  const p = currentPhoto();
  drawPost(ctx, fmt, postOpts(p, state.format));
  drawGuides(ctx, fmt);
  $('#cropRow').hidden = !p;
  $('#cropHint').hidden = !p;
  if (p) $('#zoom').value = p.crops[state.format].zoom;
}

function currentPhoto() {
  return state.photos[state.sel] || null;
}

function bindPreview() {
  const c = $('#preview');
  const pointers = new Map();

  const toCanvas = (px) => px * (c.width / c.getBoundingClientRect().width);
  const withCrop = (fn) => {
    const p = currentPhoto();
    if (!p) return;
    const fmt = FORMATS[state.format];
    fn(p.crops[state.format], p.img.naturalWidth, p.img.naturalHeight, fmt.w, fmt.h);
    render();
  };
  const zoomBy = (k) => withCrop((cr, iw, ih, W, H) => { cr.zoom *= k; clampCrop(cr, iw, ih, W, H); });

  c.addEventListener('pointerdown', (e) => {
    if (!currentPhoto()) { $('#fileInput').click(); return; }
    c.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    c.classList.add('dragging');
  });
  c.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    if (pointers.size === 1) {
      withCrop((cr, iw, ih, W, H) => panCrop(cr, iw, ih, W, H, toCanvas(now.x - prev.x), toCanvas(now.y - prev.y)));
    } else if (pointers.size === 2) {
      const other = [...pointers].find(([id]) => id !== e.pointerId)[1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
      const d1 = Math.hypot(now.x - other.x, now.y - other.y);
      if (d0 > 0) zoomBy(d1 / d0);
    }
    pointers.set(e.pointerId, now);
  });
  const end = (e) => { pointers.delete(e.pointerId); if (!pointers.size) c.classList.remove('dragging'); };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
  c.addEventListener('wheel', (e) => {
    if (!currentPhoto()) return;
    e.preventDefault();
    zoomBy(Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  $('#zoom').max = MAX_ZOOM;
  $('#zoom').addEventListener('input', (e) => withCrop((cr, iw, ih, W, H) => { cr.zoom = +e.target.value; clampCrop(cr, iw, ih, W, H); }));
  $('#resetCrop').onclick = () => withCrop((cr) => Object.assign(cr, defaultCrop()));
}

// ---------- Photos ----------

function bindPhotos() {
  $('#fileInput').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const firstNew = state.photos.length;
    let failed = 0;
    $('#addLabel').textContent = 'Loading photos…';
    for (const file of files) {
      try {
        state.photos.push(await readPhoto(file));
      } catch {
        failed++;
      }
    }
    $('#addLabel').textContent = 'Add more photos';
    if (failed) toast(`${failed} photo${failed > 1 ? 's' : ''} couldn't be opened. Try JPG or PNG.`);
    if (state.photos.length > firstNew) state.sel = firstNew;
    renderThumbs();
    clearOutputs();
    render();
  });
}

// Read a photo, downscaled so 10+ photos fit in a phone's memory. The photo itself is
// never altered beyond this resize: all cropping happens at draw time.
async function readPhoto(file) {
  const src = await blobToImage(file);
  const k = Math.min(1, MAX_PHOTO_SIDE / Math.max(src.naturalWidth, src.naturalHeight));
  let img = src;
  if (k < 1) {
    const c = document.createElement('canvas');
    c.width = Math.round(src.naturalWidth * k);
    c.height = Math.round(src.naturalHeight * k);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    img = await blobToImage(await canvasBlob(c, 'image/jpeg', 0.95));
    c.width = c.height = 0;
  }
  const t = document.createElement('canvas');
  const tk = 160 / Math.min(img.naturalWidth, img.naturalHeight);
  t.width = Math.round(img.naturalWidth * tk);
  t.height = Math.round(img.naturalHeight * tk);
  t.getContext('2d').drawImage(img, 0, 0, t.width, t.height);
  return {
    id: Math.random().toString(36).slice(2),
    name: file.name,
    img,
    thumb: t.toDataURL('image/jpeg', 0.7),
    crops: { feed: defaultCrop(), story: defaultCrop(), square: defaultCrop() },
  };
}

function renderThumbs() {
  const box = $('#thumbs');
  box.innerHTML = '';
  state.photos.forEach((p, i) => {
    const b = document.createElement('div');
    b.className = 'thumb';
    b.role = 'button';
    b.tabIndex = 0;
    b.setAttribute('aria-label', `Photo ${i + 1}`);
    b.setAttribute('aria-current', String(i === state.sel));
    b.innerHTML = `<img src="${p.thumb}" alt=""><span class="num">${i + 1}</span><button type="button" class="thumb-remove" aria-label="Remove photo ${i + 1}">×</button>`;
    b.onclick = (e) => {
      if (e.target.closest('.thumb-remove')) {
        state.photos.splice(i, 1);
        state.sel = Math.min(state.sel, Math.max(0, state.photos.length - 1));
        clearOutputs();
      } else {
        state.sel = i;
      }
      renderThumbs();
      render();
    };
    box.appendChild(b);
  });
  const n = state.photos.length;
  box.hidden = n < 1;
  $('#addLabel').textContent = n ? 'Add more photos' : 'Add photos';
  $('#photoCount').textContent = n === 0
    ? 'Pick one photo, or several from the same game for batch mode.'
    : n === 1 ? '1 photo. Add more from the same game to make them all at once.'
    : `${n} photos. Tap a thumbnail to adjust its crop. Details, template and sponsor apply to all.`;
  $('#createOne').textContent = n > 1 ? `Create for photo ${state.sel + 1}` : 'Create images';
  $('#createAll').hidden = n < 2;
  $('#createAll').textContent = `Create for all ${n} photos`;
}

// ---------- Creating & saving images ----------

function bindOutputs() {
  $('#createOne').onclick = () => createImages(false);
  $('#createAll').onclick = () => createImages(true);
  $('#downloadAll').onclick = downloadAll;
  $('#downloadZip').onclick = downloadZip;
  $('#shareBtn').onclick = shareAll;
}

async function createImages(all) {
  const photos = all ? state.photos : [currentPhoto()].filter(Boolean);
  if (!photos.length) return toast('Add a photo first.');
  const formats = Object.keys(FORMATS).filter((f) => state.out[f]);
  if (!formats.length) return toast('Tick at least one size.');
  if (state.template === 'game-day' && !state.fields.opponent) toast('Tip: add the opponent so the post and filename include it.');

  clearOutputs();
  const btns = [$('#createOne'), $('#createAll')];
  btns.forEach((b) => (b.disabled = true));
  const type = state.fileType === 'png' ? 'image/png' : 'image/jpeg';
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const total = photos.length * formats.length;
  try {
    for (const p of photos) {
      const index = state.photos.indexOf(p) + 1;
      for (const f of formats) {
        $('#progress').textContent = `Creating image ${state.outputs.length + 1} of ${total}…`;
        await nextFrame();
        const fmt = FORMATS[f];
        c.width = fmt.w; c.height = fmt.h;
        drawPost(ctx, fmt, postOpts(p, f));
        const blob = await canvasBlob(c, type, JPG_QUALITY);
        state.outputs.push({ name: fileName(f, index), blob, url: URL.createObjectURL(blob), format: f });
      }
    }
  } catch (e) {
    console.error(e);
    toast('Something went wrong creating the images. Try fewer photos at once.');
  } finally {
    c.width = c.height = 0;
    btns.forEach((b) => (b.disabled = false));
  }
  $('#progress').textContent = '';
  if (state.outputs.length) {
    logSponsorUse(photos.length);
    showOutputs();
  }
}

function fileName(format, index) {
  const f = state.fields;
  let label;
  if (state.template === 'thank-you') label = `thanks-${slug(currentSponsor().name)}`;
  else if (f.opponent) label = `vs-${slug(f.opponent)}`;
  else label = slug(f.headline) || state.template;
  const ext = state.fileType === 'png' ? 'png' : 'jpg';
  return `${f.date || todayISO()}_${label}_${format}_${String(index).padStart(2, '0')}.${ext}`;
}

function showOutputs() {
  const grid = $('#resultGrid');
  grid.innerHTML = '';
  for (const o of state.outputs) {
    const a = document.createElement('a');
    a.href = o.url;
    a.download = o.name;
    a.title = `Download ${o.name}`;
    const ratio = FORMATS[o.format];
    a.innerHTML = `<img src="${o.url}" alt="" style="aspect-ratio:${ratio.w}/${ratio.h}"><small>${esc(o.name)}</small>`;
    grid.appendChild(a);
  }
  const n = state.outputs.length;
  const canShare = !!navigator.canShare && navigator.canShare({ files: [toFile(state.outputs[0])] });
  $('#shareBtn').hidden = !canShare;
  $('#downloadAll').textContent = n === 1 ? 'Download' : `Download ${n} files`;
  $('#downloadAll').classList.toggle('primary', !canShare);
  $('#downloadZip').hidden = n < 2;
  $('#saveTip').textContent = canShare
    ? 'On a phone, "Save to Photos / Share" puts the images straight into your camera roll. Tap a single image to download just that one.'
    : 'Tap a single image to download just that one.';
  $('#results').hidden = false;
  $('#results').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearOutputs() {
  state.outputs.forEach((o) => URL.revokeObjectURL(o.url));
  state.outputs = [];
  $('#results').hidden = true;
}

function toFile(o) {
  return new File([o.blob], o.name, { type: o.blob.type });
}

async function shareAll() {
  try {
    await navigator.share({ files: state.outputs.map(toFile) });
  } catch (e) {
    if (e.name !== 'AbortError') toast("Sharing didn't work here. Use Download instead.");
  }
}

async function downloadAll() {
  for (const o of state.outputs) {
    saveBlob(o.url, o.name);
    await sleep(350); // browsers drop rapid-fire downloads
  }
}

async function downloadZip() {
  const btn = $('#downloadZip');
  btn.disabled = true;
  try {
    const zip = await makeZip(state.outputs);
    const url = URL.createObjectURL(zip);
    const f = state.fields;
    saveBlob(url, `${f.date || todayISO()}_${f.opponent ? `vs-${slug(f.opponent)}` : state.template}_posts.zip`);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } finally {
    btn.disabled = false;
  }
}

function saveBlob(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------- Caption helper ----------

function bindCaption() {
  buildCaptionPick();
  $('#captionPick').onchange = (e) => { state.captionIdx = +e.target.value; updateCaption(); };
  $('#copyCaption').onclick = async () => {
    const text = $('#caption').value;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      $('#caption').select();
      document.execCommand('copy');
    }
    toast('Caption copied');
  };
}

function captionList() {
  return config.captions?.[state.template] || [];
}

function buildCaptionPick() {
  const list = captionList();
  $('#captionPick').innerHTML = list.map((c, i) => `<option value="${i}">Caption ${i + 1}: ${esc(c.slice(0, 48))}…</option>`).join('');
  $('#captionPick').hidden = list.length < 2;
}

function updateCaption() {
  const tpl = captionList()[state.captionIdx] || captionList()[0] || '';
  const f = state.fields;
  const tags = config.hashtags || [];
  const values = {
    Opponent: f.opponent,
    Score: f.ourScore !== '' || f.theirScore !== '' ? `${f.ourScore || '0'}–${f.theirScore || '0'}` : '',
    Sponsor: currentSponsor().name,
    Date: prettyDate(f.date),
    Headline: f.headline,
    Club: config.clubName,
    Hashtags: tags.join(' '),
    ClubHashtag: (tags[0] || '').replace(/^#/, ''),
    Sport: (config.sport || '').replace(/\s+/g, ''),
  };
  // Blank details stay as [Placeholder] so it's obvious what still needs filling in.
  $('#caption').value = tpl
    .replace(/\[(\w+)\]/g, (m, k) => (values[k] ? values[k] : m))
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// ---------- Sponsor log ----------

function bindLog() {
  $('#exportLog').onclick = exportLog;
  $('#clearLog').onclick = () => {
    if (!confirm('Clear the sponsor log on this device? Export it first if you need it.')) return;
    storageSet(LOG_KEY, []);
    renderLog();
  };
}

function readLog() {
  return storageGet(LOG_KEY) || [];
}

// One row per post. Re-creating the same post within a few hours updates its row
// instead of adding a duplicate.
function logSponsorUse(photoCount) {
  const log = readLog();
  const entry = {
    created: new Date().toISOString(),
    gameDate: state.fields.date,
    sponsor: currentSponsor().name,
    template: TEMPLATES[state.template].name,
    opponent: state.fields.opponent,
    photos: photoCount,
  };
  const last = log[log.length - 1];
  const same = last && ['gameDate', 'sponsor', 'template', 'opponent'].every((k) => last[k] === entry[k])
    && Date.now() - Date.parse(last.created) < 3 * 3600 * 1000;
  if (same) Object.assign(last, entry, { photos: Math.max(last.photos, photoCount) });
  else log.push(entry);
  storageSet(LOG_KEY, log);
  renderLog();
}

function renderLog() {
  const log = readLog();
  $('#logCount').textContent = log.length ? `${log.length} post${log.length > 1 ? 's' : ''}` : 'empty';
  const totals = {};
  log.forEach((e) => { totals[e.sponsor] = (totals[e.sponsor] || 0) + 1; });
  $('#logTotals').innerHTML = Object.entries(totals).sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `<span class="chip">${esc(name)}: <strong>${n}</strong></span>`).join('');
  $('#logTable').innerHTML = log.length
    ? `<thead><tr><th>Game date</th><th>Sponsor</th><th>Template</th><th>Opponent</th><th>Photos</th></tr></thead><tbody>${
      log.slice().reverse().map((e) => `<tr><td>${esc(e.gameDate)}</td><td>${esc(e.sponsor)}</td><td>${esc(e.template)}</td><td>${esc(e.opponent || '')}</td><td>${e.photos}</td></tr>`).join('')
    }</tbody>`
    : '<tbody><tr><td class="muted">Nothing logged yet. Entries appear when you create images.</td></tr></tbody>';
  $('#exportLog').disabled = !log.length;
}

function exportLog() {
  const rows = [['created_at', 'game_date', 'sponsor', 'template', 'opponent', 'photos']]
    .concat(readLog().map((e) => [e.created, e.gameDate, e.sponsor, e.template, e.opponent || '', e.photos]));
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
  saveBlob(url, `sponsor-log_${todayISO()}.csv`);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ---------- Utilities ----------

function storageGet(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode etc. */ }
}

function canvasBlob(c, type, quality) {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality));
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function prettyDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  return new Date(+m[1], m[2] - 1, +m[3]).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function slug(s) {
  return (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => setTimeout(r, 0));

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}
