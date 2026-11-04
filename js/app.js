// Club Post Maker: everything runs in the browser. Photos are read from the device,
// drawn onto a canvas and saved back to the device. Nothing is ever uploaded.

import { FORMATS, TEMPLATES, MAX_ZOOM, drawPost, drawGuides, defaultCrop, clampCrop, panCrop, loadLogo, logoFromFile, blobToImage } from './render.js';
import { makeZip } from './zip.js';

const $ = (sel) => document.querySelector(sel);
const PREFS_KEY = 'postmaker.prefs';
const LOG_KEY = 'postmaker.sponsorLog';
const MAX_PHOTO_SIDE = 2560;   // photos are downscaled to this on load to keep phones happy
const JPG_QUALITY = 0.92;

const FIELD_IDS = ['date', 'time', 'opponent', 'venue', 'ourScore', 'theirScore', 'headline', 'subtext', 'placing', 'record',
  'p1Role', 'p1Name', 'p2Role', 'p2Name', 'p3Role', 'p3Name', 'collageCount', 'context',
  'eyebrow', 'tySupport', 'tyTier', 'tyWord', 'tyMessage', 'season', 'logoBg', 'logoBgCustom', 'teamBg',
  'g1Time', 'g1Team', 'g2Time', 'g2Team', 'g3Time', 'g3Team', 'g4Time', 'g4Team'];
const TEAM_SLOTS = 8;

let config, sponsors = [], teamList = [];
const assets = { club: null, sponsors: new Map(), overlays: {} };
const state = {
  photos: [],          // { id, name, img, thumb, fit, crops: { [key]: crop } }
  teams: Array(TEAM_SLOTS).fill(null),
  oppUpload: null,     // Game Time opponent logo picked from the device: { asset, thumb }
  oppSaved: null,      // ...or the saved team's logo matching the opponent's name: { asset, thumb, bg, name }   // other teams' logos for Upcoming Tournament: { asset, thumb, name, bg }
  sel: 0,
  format: 'feed',
  template: 'game-day',
  sponsorName: '',
  fields: Object.fromEntries(FIELD_IDS.map((id) => [id, ''])),
  out: { feed: true, story: true },
  fileType: 'jpg',
  captionIdx: 0,
  outputs: [],         // { name, blob, url, format }
  regions: [],         // photo areas in the current preview (canvas pixels)
};
state.fields.date = todayISO();
state.fields.collageCount = '4';
state.fields.logoBgCustom = '#ffffff';

const tpl = () => TEMPLATES[state.template];

init();

async function init() {
  try {
    [config, sponsors] = await Promise.all([getJSON('config.json'), getJSON('sponsors.json')]);
  } catch (e) {
    return fatal(e.message);
  }
  sponsors = sponsors.filter((sp) => sp && sp.name && sp.active !== false);
  // The shared team logo library is optional: without teams.json the slots still take logos from the device
  try { teamList = (await getJSON('teams.json')).filter((t) => t && t.name && t.logo && t.active !== false); }
  catch (e) {
    // A typo in teams.json should be noticed; a missing file just means no saved teams
    if (/formatting mistake/.test(e.message)) setTimeout(() => toast('teams.json has a formatting mistake, so saved teams are hidden.'), 500);
    console.warn(e.message);
  }

  loadPrefs();
  applyBranding();
  buildFormatUI();
  buildTemplatePicker();
  buildSponsorSelect();
  bindFields();
  bindTeams();
  bindOpponent();
  bindPreview();
  bindPhotos();
  bindOutputs();
  bindCaption();
  bindLog();
  applyTemplate();
  renderLog();

  // Assets load in the background; the preview redraws as each one arrives.
  await loadFonts();
  render();
  loadLogo(config.clubLogo)
    .then((a) => { assets.club = a; showLogoWarnings(); render(); })
    .catch((e) => { assets.clubError = e.message; showLogoWarnings(); });
  ensureSponsorLogo();
  loadOverlays();
  if (config.tournamentBackdrop?.logo) {
    loadLogo(config.tournamentBackdrop.logo)
      .then((a) => { assets.backdrop = a; render(); })
      .catch((e) => console.warn(e.message));
  }
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
  root.setProperty('--header-bg', config.colors.background || config.colors.primary);
  $('#appTitle').textContent = `${config.clubShortName || config.clubName} Post Maker`;
  document.title = `${config.clubShortName || config.clubName} Post Maker`;
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
        document.fonts.load(`700 100px "${f.display}"`),
        document.fonts.load(`500 100px "${f.body}"`),
        document.fonts.load(`600 100px "${f.body}"`),
      ]),
      sleep(5000),
    ]);
  } catch (e) {
    console.warn('Font loading failed', e);
  }
}

// Optional image-based frames: config.frameOverlays = { "game-day": { "feed": "templates/x.png" } }
function loadOverlays() {
  for (const [id, byFormat] of Object.entries(config.frameOverlays || {})) {
    for (const [fmt, url] of Object.entries(byFormat || {})) {
      fetch(url, { cache: 'no-cache' })
        .then((r) => (r.ok ? r.blob() : Promise.reject()))
        .then(blobToImage)
        .then((img) => { (assets.overlays[id] ||= {})[fmt] = img; render(); })
        .catch(() => console.warn(`Frame overlay not found: ${url}`));
    }
  }
}

// The chosen sponsor, or null for "No sponsor" (always allowed).
function currentSponsor() {
  return sponsors.find((sp) => sp.name === state.sponsorName) || null;
}

async function ensureSponsorLogo() {
  const sp = currentSponsor();
  if (sp && !assets.sponsors.has(sp.name)) {
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
  const entry = sp && assets.sponsors.get(sp.name);
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
  state.sponsorName = p.sponsorName === '' || sponsors.some((sp) => sp.name === p.sponsorName) ? p.sponsorName : sponsors[0]?.name || '';
  // Only sizes that still exist (Square was removed); keep the defaults if none are ticked.
  const out = Object.fromEntries(Object.keys(FORMATS).map((f) => [f, !!p.out?.[f]]));
  if (Object.values(out).some(Boolean)) state.out = out;
  if (p.fileType === 'png' || p.fileType === 'jpg') state.fileType = p.fileType;
  if (['2', '3', '4'].includes(p.collageCount)) state.fields.collageCount = p.collageCount;
}

function savePrefs() {
  storageSet(PREFS_KEY, {
    template: state.template, sponsorName: state.sponsorName, out: state.out,
    fileType: state.fileType, collageCount: state.fields.collageCount,
  });
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
  for (const [id, t] of Object.entries(TEMPLATES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.role = 'radio';
    b.dataset.template = id;
    b.innerHTML = `<strong>${esc(t.name)}</strong><span>${esc(t.desc)}</span>`;
    b.onclick = () => {
      state.template = id;
      state.captionIdx = 0;
      savePrefs();
      clearOutputs();
      applyTemplate();
    };
    box.appendChild(b);
  }
}

// Show the inputs and cards the chosen template uses, and refresh everything that depends on it.
function applyTemplate() {
  const t = tpl();
  document.querySelectorAll('#templatePicker button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.template === state.template)));
  document.querySelectorAll('[data-field]').forEach((el) => { el.hidden = !t.fields.includes(el.dataset.field); });
  document.querySelectorAll('[data-opt-for]').forEach((el) => { el.hidden = !el.dataset.optFor.split(' ').includes(state.template); });
  $('#headlineLabel').textContent = t.headline?.label || 'Headline';
  $('#f-headline').placeholder = !t.headline ? '' : t.headline.below ? t.headline.placeholder
    : `${t.headline.placeholder} (default: ${sentenceCase(defaultHeadline())})`;
  const tourney = state.template === 'tournament';
  $('#subtextLabel').textContent = tourney ? 'Dates & location' : 'Small line';
  $('#f-subtext').placeholder = tourney ? 'e.g. May 15–17 · Mississauga' : 'Leave blank to show opponent and date';
  $('#venueLabel').textContent = state.template === 'tournament-preview' ? 'Location' : 'Venue';
  $('#photoCard').hidden = t.photos === 'none';
  buildCaptionPick();
  updateCaption();
  renderThumbs();
  render();
}

function buildSponsorSelect() {
  const sel = $('#sponsor');
  sel.innerHTML = '<option value="">No sponsor</option>'
    + sponsors.map((sp) => `<option value="${esc(sp.name)}">${esc(sp.name)}${sp.tier ? ` (${esc(sp.tier)})` : ''}</option>`).join('');
  sel.value = state.sponsorName;
  sel.onchange = () => {
    state.sponsorName = sel.value;
    savePrefs();
    updateCaption();
    ensureSponsorLogo();
  };
}

// Logo box background choices for the Sponsor Thank-You post (colours from config.json).
function buildLogoBgOptions() {
  const c = config.colors;
  const opts = [['', 'Sponsor default'], ['transparent', 'Transparent'], ['#FFFFFF', 'White'], ['#0A0A0A', 'Black'],
    [c.primary, 'Club green'], [c.accent, 'Club gold'], ['custom', 'Custom colour…']];
  $('#f-logoBg').innerHTML = opts.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join('');
  $('#f-logoBg').addEventListener('change', (e) => { $('#f-logoBgCustom').hidden = e.target.value !== 'custom'; });
}

// A sponsor's usual logo box colour: "background" in sponsors.json, else from "plate", else none.
function sponsorBackground(sp) {
  if (!sp) return 'transparent';
  if (sp.background) return sp.background;
  return sp.plate === 'light' ? '#FFFFFF' : sp.plate === 'dark' ? '#151515' : 'transparent';
}

function bindFields() {
  buildLogoBgOptions();
  const c = config.colors;
  $('#f-teamBg').innerHTML = [['', 'White'], ['transparent', 'Transparent'], ['#0A0A0A', 'Black'], [c.primary, 'Club green']]
    .map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join('');
  // Pool play opponents come from the saved team list
  const teamOpts = '<option value="">Opponent…</option>' + teamList.map((t) => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('');
  [1, 2, 3, 4].forEach((i) => { $(`#f-g${i}Team`).innerHTML = teamOpts; });
  $('#teamNames').innerHTML = teamList.map((t) => `<option value="${esc(t.name)}">`).join('');
  // Sponsor Thank-You text boxes show the default wording they'll use if left blank
  const lb = config.labels || {};
  $('#f-eyebrow').placeholder = lb.eyebrow || '';
  $('#f-tySupport').placeholder = lb.supportLine || '';
  $('#f-tyTier').placeholder = "Sponsor's tier";
  $('#f-tyWord').placeholder = lb.sponsorWord || 'SPONSOR';
  $('#f-tyMessage').placeholder = lb.thankYouMessage || '';
  $('#f-season').placeholder = lb.season || '';
  for (const id of FIELD_IDS) {
    const el = $(`#f-${id}`);
    if (el.type === 'checkbox') {
      // Checkbox fields hold 'yes' or ''.
      el.addEventListener('change', () => {
        state.fields[id] = el.checked ? 'yes' : '';
        updateCaption();
        render();
      });
      continue;
    }
    el.value = state.fields[id];
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      state.fields[id] = el.value.trim();
      if (id === 'collageCount') { savePrefs(); clearOutputs(); renderThumbs(); }
      updateCaption();
      render();
    });
  }
}

// Upcoming Tournament: eight slots for the other teams' logos, filled from the shared library
// (teams.json) or from the device. Picking several files at once fills that slot and the
// empty ones after it, in order.
function bindTeams() {
  buildTeamLibrary();
  const box = $('#teamSlots');
  for (let i = 0; i < TEAM_SLOTS; i++) {
    const slot = document.createElement('div');
    slot.className = 'team-slot';
    slot.innerHTML = `<label class="team-pick" aria-label="Team logo ${i + 1}"><input type="file" accept="image/*" multiple><span class="num">${i + 1}</span></label>`
      + `<button type="button" class="thumb-remove" aria-label="Remove team logo ${i + 1}" hidden>×</button>`;
    slot.querySelector('input').addEventListener('change', async (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      let at = i, failed = 0;
      for (const file of files) {
        if (at >= TEAM_SLOTS) break;
        try {
          const asset = await logoFromFile(file);
          state.teams[at] = { asset, thumb: asset.img.toDataURL('image/png') };
        } catch {
          failed++;
          continue;
        }
        do at++; while (at < TEAM_SLOTS && state.teams[at]);
      }
      if (failed) toast(`${failed} logo${failed > 1 ? 's' : ''} couldn't be opened. Try PNG or JPG.`);
      renderTeams();
      clearOutputs();
      render();
    });
    slot.querySelector('.thumb-remove').onclick = () => {
      state.teams[i] = null;
      renderTeams();
      clearOutputs();
      render();
    };
    box.appendChild(slot);
  }
}

function renderTeams() {
  document.querySelectorAll('#teamSlots .team-slot').forEach((slot, i) => {
    const t = state.teams[i];
    slot.querySelector('.team-pick').style.backgroundImage = t ? `url(${t.thumb})` : '';
    slot.querySelector('.team-pick').title = t?.name || '';
    slot.classList.toggle('filled', !!t);
    slot.querySelector('.thumb-remove').hidden = !t;
  });
  document.querySelectorAll('#teamLibrary button').forEach((b) => {
    b.setAttribute('aria-pressed', String(state.teams.some((t) => t?.name === b.dataset.name)));
  });
}

// Saved teams: tap one to put it in the next empty slot, tap again to take it out.
const teamLogos = new Map();   // name -> Promise of the trimmed logo
function buildTeamLibrary() {
  const box = $('#teamLibrary');
  $('#teamLibraryWrap').hidden = !teamList.length;
  box.innerHTML = teamList.map((t) => `<button type="button" data-name="${esc(t.name)}" aria-pressed="false">`
    + `<img src="${esc(t.logo)}" alt="" loading="lazy"><span>${esc(t.name)}</span></button>`).join('');
  box.querySelectorAll('button').forEach((b, k) => {
    b.onclick = async () => {
      const team = teamList[k];
      const i = state.teams.findIndex((t) => t?.name === team.name);
      if (i >= 0) state.teams[i] = null;
      else {
        const at = state.teams.indexOf(null);
        if (at < 0) return toast('All 8 slots are full. Remove a team first.');
        state.teams[at] = { pending: true, name: team.name };   // hold the slot while the logo loads
        if (!teamLogos.has(team.name)) teamLogos.set(team.name, loadLogo(team.logo));
        try {
          const asset = await teamLogos.get(team.name);
          state.teams[at] = { asset, thumb: team.logo, name: team.name, bg: team.background };
        } catch (e) {
          teamLogos.delete(team.name);
          state.teams[at] = null;
          toast(`${team.name}'s logo couldn't be loaded.`);
        }
      }
      renderTeams();
      clearOutputs();
      render();
    };
  });
}

// Game Time: the opponent's logo. Typing a saved team's name uses its logo automatically;
// tapping the circle uses a logo from the device instead.
function bindOpponent() {
  $('#f-opponent').addEventListener('input', matchOpponent);
  $('#oppFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const asset = await logoFromFile(file);
      state.oppUpload = { asset, thumb: asset.img.toDataURL('image/png') };
    } catch {
      toast("That logo couldn't be opened. Try PNG or JPG.");
    }
    renderOpponent();
  });
  $('#oppRemove').onclick = () => { state.oppUpload = null; renderOpponent(); };
  matchOpponent();
}

async function matchOpponent() {
  const name = state.fields.opponent.toLowerCase();
  const team = name && teamList.find((t) => t.name.toLowerCase() === name);
  if (!team) { state.oppSaved = null; return renderOpponent(); }
  if (state.oppSaved?.name === team.name) return;
  if (!teamLogos.has(team.name)) teamLogos.set(team.name, loadLogo(team.logo));
  try {
    const asset = await teamLogos.get(team.name);
    // Only if the opponent is still this team once the logo has loaded
    if (state.fields.opponent.toLowerCase() === name) state.oppSaved = { asset, thumb: team.logo, bg: team.background, name: team.name };
  } catch {
    teamLogos.delete(team.name);
  }
  renderOpponent();
}

function renderOpponent() {
  const op = state.oppUpload || state.oppSaved;
  $('#oppSlot .team-pick').style.backgroundImage = op ? `url(${op.thumb})` : '';
  $('#oppSlot').classList.toggle('filled', !!op);
  $('#oppRemove').hidden = !state.oppUpload;
  $('#oppHint').textContent = state.oppUpload ? 'Using a logo from this device. Tap × to go back.'
    : state.oppSaved ? `Using the saved logo for ${state.oppSaved.name}.`
    : 'Pick a saved team in Opponent and its logo appears here, or tap the circle to add one from this device.';
  if (state.template === 'next-game') clearOutputs();
  render();
}

function defaultHeadline() {
  return config.headlines?.[state.template] || TEMPLATES[state.template].name;
}

// Text and settings that go onto the image.
function postData() {
  const f = state.fields, sp = currentSponsor();
  return {
    dateLabel: prettyDate(f.date),
    dateShort: prettyDate(f.date, true),
    timeLabel: prettyTime(f.time),
    opponent: f.opponent,
    venue: f.venue,
    context: f.context,
    ourScore: f.ourScore,
    theirScore: f.theirScore,
    headline: f.headline,
    subtext: f.subtext,
    placing: f.placing,
    record: f.record,
    people: [1, 2, 3].map((i) => ({ role: f[`p${i}Role`], name: f[`p${i}Name`] })).filter((p) => p.role || p.name),
    hasSponsor: !!sp,
    sponsorName: sp?.name || '',
    sponsorTier: f.tyTier || sp?.tier || '',
    // Sponsor Thank-You wording: what's typed for this post, else config.json
    eyebrow: f.eyebrow,
    season: f.season,
    supportLine: f.tySupport || config.labels?.supportLine || '',
    sponsorWord: f.tyWord || config.labels?.sponsorWord || 'SPONSOR',
    message: f.tyMessage || config.labels?.thankYouMessage || '',
    sponsorPlate: sp?.plate,
    teamBg: f.teamBg || '#FFFFFF',
    // Pool play games with a time or an opponent, in the order entered
    pool: [1, 2, 3, 4].map((i) => ({ time: prettyTime(f[`g${i}Time`]), team: f[`g${i}Team`] })).filter((g) => g.time || g.team),
    logoBg: f.logoBg === 'custom' ? (f.logoBgCustom || '#ffffff') : f.logoBg || sponsorBackground(sp),
  };
}

function oppAsset() {
  const op = state.oppUpload || state.oppSaved;
  return op ? { ...op.asset, bg: op.bg } : null;
}

function postOpts(group) {
  return {
    template: state.template,
    photos: group.map((p) => ({ img: p.img, fit: p.fit, crops: p.crops, ref: p })),
    data: postData(),
    brand: config,
    assets: {
      club: assets.club, backdrop: assets.backdrop, sponsor: assets.sponsors.get(state.sponsorName)?.asset || null, overlays: assets.overlays,
      teams: state.teams.filter((t) => t?.asset).map((t) => ({ ...t.asset, bg: t.bg })),
      opponent: oppAsset(),
    },
  };
}

// Which photos go into each post: one each, collages of N, or none.
function photoGroups(all) {
  const t = tpl();
  if (t.photos === 'none') return [[]];
  if (!state.photos.length) return t.photos === 'optional' ? [[]] : [];
  if (t.photos === 'multi') {
    const k = +state.fields.collageCount || 4, groups = [];
    for (let i = 0; i < state.photos.length; i += k) groups.push(state.photos.slice(i, i + k));
    return all ? groups : [groups[Math.floor(state.sel / k)]];
  }
  return all ? state.photos.map((p) => [p]) : [[currentPhoto()]];
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
  state.regions = drawPost(ctx, fmt, postOpts(photoGroups(false)[0] || []));
  drawGuides(ctx, fmt);

  const p = currentPhoto(), r = currentRegion();
  $('#cropRow').hidden = !r || p.fit;
  $('#cropHint').hidden = !r || p.fit;
  $('#wholeRow').hidden = !r;
  if (r) {
    $('#wholePhoto').checked = !!p.fit;
    $('#zoom').value = (p.crops[r.key] ||= defaultCrop()).zoom;
  }
}

function currentPhoto() {
  return state.photos[state.sel] || null;
}

function currentRegion() {
  const p = currentPhoto();
  return state.regions.find((r) => r.ref === p) || null;
}

function bindPreview() {
  const c = $('#preview');
  const pointers = new Map();
  let active = null;   // region being dragged

  const toCanvas = (px) => px * (c.width / c.getBoundingClientRect().width);
  const regionAt = (e) => {
    const b = c.getBoundingClientRect();
    const x = toCanvas(e.clientX - b.left), y = toCanvas(e.clientY - b.top);
    return state.regions.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) || null;
  };
  const withCrop = (r, fn) => {
    if (!r || r.ref.fit) return;
    const img = r.ref.img;
    fn(r.ref.crops[r.key] ||= defaultCrop(), img.naturalWidth, img.naturalHeight, r.w, r.h);
    render();
  };
  const zoomBy = (r, k) => withCrop(r, (cr, iw, ih, W, H) => { cr.zoom *= k; clampCrop(cr, iw, ih, W, H); });

  c.addEventListener('pointerdown', (e) => {
    if (tpl().photos !== 'none' && !state.photos.length) { $('#fileInput').click(); return; }
    const r = regionAt(e);
    if (!r) return;
    if (pointers.size === 0) {
      active = r;
      const i = state.photos.indexOf(r.ref);
      if (i !== state.sel) { state.sel = i; renderThumbs(); render(); }
    }
    c.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    c.classList.add('dragging');
  });
  c.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    if (pointers.size === 1) {
      withCrop(active, (cr, iw, ih, W, H) => panCrop(cr, iw, ih, W, H, toCanvas(now.x - prev.x), toCanvas(now.y - prev.y)));
    } else if (pointers.size === 2) {
      const other = [...pointers].find(([id]) => id !== e.pointerId)[1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
      const d1 = Math.hypot(now.x - other.x, now.y - other.y);
      if (d0 > 0) zoomBy(active, d1 / d0);
    }
    pointers.set(e.pointerId, now);
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    if (!pointers.size) { c.classList.remove('dragging'); active = null; }
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
  c.addEventListener('wheel', (e) => {
    const r = regionAt(e);
    if (!r) return;
    e.preventDefault();
    zoomBy(r, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  $('#zoom').max = MAX_ZOOM;
  $('#zoom').addEventListener('input', (e) => withCrop(currentRegion(), (cr, iw, ih, W, H) => { cr.zoom = +e.target.value; clampCrop(cr, iw, ih, W, H); }));
  $('#resetCrop').onclick = () => withCrop(currentRegion(), (cr) => Object.assign(cr, defaultCrop()));
  $('#wholePhoto').onchange = (e) => { const p = currentPhoto(); if (p) { p.fit = e.target.checked; render(); } };
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
    fit: false,
    crops: {},
  };
}

function renderThumbs() {
  const box = $('#thumbs');
  box.innerHTML = '';
  const t = tpl();
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
  box.hidden = n < 1 || t.photos === 'none';
  $('#addLabel').textContent = n ? 'Add more photos' : 'Add photos';

  const k = +state.fields.collageCount || 4;
  const groups = t.photos === 'multi' ? Math.ceil(n / k) : n;
  const one = $('#createOne'), all = $('#createAll');
  all.hidden = true;
  if (t.photos === 'none' || (t.photos === 'optional' && !n)) {
    one.textContent = 'Create images';
  } else if (t.photos === 'multi') {
    one.textContent = groups > 1 ? `Create collage ${Math.floor(state.sel / k) + 1}` : 'Create collage';
    all.hidden = groups < 2;
    all.textContent = `Create all ${groups} collages`;
  } else {
    one.textContent = n > 1 ? `Create for photo ${state.sel + 1}` : 'Create images';
    all.hidden = n < 2;
    all.textContent = `Create for all ${n} photos`;
  }

  $('#photoCount').textContent = t.photos === 'multi'
    ? (n ? `${n} photo${n > 1 ? 's' : ''}: ${groups} collage${groups > 1 ? 's' : ''} of up to ${k}. Tap a photo in the preview to adjust its crop.` : `Add 2–${k} photos per collage. More photos make more collages, in order.`)
    : t.photos === 'optional' && !n ? 'Optional: without a photo the window shows the club badge.'
    : n === 0 ? 'Pick one photo, or several from the same game to make them all at once.'
    : n === 1 ? '1 photo. Add more from the same game to make them all at once.'
    : `${n} photos. Tap a thumbnail to adjust its crop. Details, template and sponsor apply to all.`;
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
  const t = tpl();
  const groups = photoGroups(all);
  if (!groups.length) return toast('Add a photo first.');
  const formats = Object.keys(FORMATS).filter((f) => state.out[f]);
  if (!formats.length) return toast('Tick at least one size.');

  clearOutputs();
  const btns = [$('#createOne'), $('#createAll')];
  btns.forEach((b) => (b.disabled = true));
  const type = state.fileType === 'png' ? 'image/png' : 'image/jpeg';
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const total = groups.length * formats.length;
  const k = +state.fields.collageCount || 4;
  try {
    for (const group of groups) {
      const first = state.photos.indexOf(group[0]);
      const index = first < 0 ? 1 : t.photos === 'multi' ? Math.floor(first / k) + 1 : first + 1;
      for (const f of formats) {
        $('#progress').textContent = `Creating image ${state.outputs.length + 1} of ${total}…`;
        await nextFrame();
        const fmt = FORMATS[f];
        c.width = fmt.w; c.height = fmt.h;
        drawPost(ctx, fmt, postOpts(group));
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
    if (currentSponsor()) logSponsorUse(groups.reduce((n, g) => n + g.length, 0));
    showOutputs();
  }
}

function fileName(format, index) {
  const f = state.fields;
  const label = {
    'thank-you': currentSponsor() ? `thanks-${slug(currentSponsor().name)}` : 'thank-you',
    'tournament': slug(f.headline) || 'tournament',
    'tournament-preview': slug(f.headline) || 'upcoming-tournament',
    'meet-team': slug(f.headline || defaultHeadline()).toLowerCase(),
    'next-game': f.opponent ? `game-time-vs-${slug(f.opponent)}` : 'game-time',
  }[state.template] || (f.opponent ? `vs-${slug(f.opponent)}` : slug(f.headline) || state.template);
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
  const list = captionList();
  let tplText = list[state.captionIdx] || list[0] || '';
  const f = state.fields, sp = currentSponsor();
  const tags = config.hashtags || [];
  const values = {
    Opponent: f.opponent,
    Score: f.ourScore !== '' || f.theirScore !== '' ? `${f.ourScore || '0'}–${f.theirScore || '0'}` : '',
    Sponsor: sp?.name,
    Tier: (f.tyTier || sp?.tier)?.toLowerCase(),
    Date: prettyDate(f.date),
    Time: prettyTime(f.time),
    Venue: f.venue,
    Headline: f.headline || (state.template === 'meet-team' ? sentenceCase(defaultHeadline()) : ''),
    Placing: f.placing,
    Record: f.record,
    Club: config.clubName,
    Hashtags: tags.join(' '),
    ClubHashtag: (tags[0] || '').replace(/^#/, ''),
    Sport: (config.sport || '').replace(/\s+/g, ''),
  };
  // Every game is streamed. The stream line goes in first, as its own sentence, so dropping sponsor sentences can't take it.
  const note = config.labels?.livestreamNote ? ` ${config.labels.livestreamNote}` : '';
  const where = config.labels?.youtubeUrl ? ` at ${config.labels.youtubeUrl}` : '';
  let text = tplText.replace(/\[Stream\]\s*/g, `Can't make it? Watch live${where}${note}! `);
  // No sponsor: drop the sentences that mention one. A sponsor without a tier: drop the tier word.
  const dropSponsor = (t) => (t.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) || []).filter((x) => !/\[(Sponsor|Tier)\]/.test(x)).join('');
  if (!sp) {
    text = dropSponsor(text);
    // Nothing left but hashtags (e.g. a sponsor thank-you): use the first caption that doesn't need a sponsor.
    if (!text.replace(/\[Hashtags\]|#\S+/g, '').trim()) text = list.find((c) => !/\[(Sponsor|Tier)\]/.test(c)) || text;
  }
  else if (!f.tyTier && !sp.tier) text = text.replace(/\[Tier\]\s*/g, '');
  // Blank details stay as [Placeholder] so it's obvious what still needs filling in.
  $('#caption').value = text
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
    template: tpl().name,
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
    ? `<thead><tr><th>Date</th><th>Sponsor</th><th>Template</th><th>Opponent</th><th>Photos</th></tr></thead><tbody>${
      log.slice().reverse().map((e) => `<tr><td>${esc(e.gameDate)}</td><td>${esc(e.sponsor)}</td><td>${esc(e.template)}</td><td>${esc(e.opponent || '')}</td><td>${e.photos}</td></tr>`).join('')
    }</tbody>`
    : '<tbody><tr><td class="muted">Nothing logged yet. Entries appear when you create images.</td></tr></tbody>';
  $('#exportLog').disabled = !log.length;
}

function exportLog() {
  const rows = [['created_at', 'date', 'sponsor', 'template', 'opponent', 'photos']]
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

function prettyDate(iso, short = false) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  const opts = short ? { weekday: 'short', month: 'short', day: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
  return new Date(+m[1], m[2] - 1, +m[3]).toLocaleDateString(undefined, opts);
}

function prettyTime(hhmm) {
  const m = /^(\d{2}):(\d{2})/.exec(hhmm || '');
  if (!m) return '';
  return new Date(2000, 0, 1, +m[1], +m[2]).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function sentenceCase(s) {
  const t = (s || '').replace(/\|/g, ' ').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
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
