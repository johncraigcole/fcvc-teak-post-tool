// Drawing engine: turns photos + template + details into a finished post on a canvas.
// Everything is drawn in output pixels, so the preview is exactly what gets downloaded.
//
// Every template shares the TEAK layout: club badge and two-line headline at the top,
// a gold-framed photo window, template-specific info below it, and the season footer.

// Output sizes. safeTop/safeBottom keep text and logos clear of Instagram's Story UI.
// `s` scales element sizes for that format.
export const FORMATS = {
  feed:   { id: 'feed',   label: 'Feed',   ratio: '4:5',  w: 1080, h: 1350, safeTop: 0,   safeBottom: 0,   s: 1 },
  story:  { id: 'story',  label: 'Story',  ratio: '9:16', w: 1080, h: 1920, safeTop: 250, safeBottom: 250, s: 1 },
  square: { id: 'square', label: 'Square', ratio: '1:1',  w: 1080, h: 1080, safeTop: 0,   safeBottom: 0,   s: 0.8 },
};

export const MAX_ZOOM = 5;
const SPONSOR_ROW = 100;   // height of the "PRESENTED BY [logo]" row
const RIBBON = 150;        // height of name/score ribbons

// ---------- Templates ----------
// photos: 'one' (one post per photo), 'multi' (collage of several), 'optional', or 'none'.
// fields: which detail inputs the app shows. sponsor: whether a sponsor appears.
// info: height (unscaled) of the area under the photo window.

export const TEMPLATES = {
  'game-day': {
    name: 'Game Day Result',
    desc: 'Score ribbons, date and "Presented by" sponsor',
    photos: 'one', sponsor: true,
    fields: ['date', 'opponent', 'score'],
    info: () => RIBBON + 26 + SPONSOR_ROW,
    draw(ctx, L, o, box) {
      const d = o.data, gap = 30 * L.s;
      const w = (box.w - gap) / 2;
      ribbon(ctx, L, box.x, box.y, w, RIBBON * L.s, 'green', o.brand.clubShortName, d.ourScore || '–', 74);
      ribbon(ctx, L, box.x + w + gap, box.y, w, RIBBON * L.s, 'green', d.opponent || 'OPPONENT', d.theirScore || '–', 74);
      sponsorRow(ctx, L, o, box.y + (RIBBON + 26) * L.s, d.dateLabel);
    },
  },

  'highlight': {
    name: 'Player / Moment Highlight',
    desc: 'Your headline (e.g. "Big save!") over a big photo',
    photos: 'one', sponsor: true, headline: { label: 'Headline', placeholder: 'e.g. Big save!' },
    fields: ['headline', 'subtext', 'date', 'opponent'],
    info: () => SPONSOR_ROW,
    draw(ctx, L, o, box) {
      sponsorRow(ctx, L, o, box.y, subLine(o.data));
    },
  },

  'collage': {
    name: 'Photo Collage',
    desc: '2–4 photos in one post. Mixes portrait and landscape',
    photos: 'multi', sponsor: true, headline: { label: 'Headline', placeholder: 'e.g. Game day' },
    fields: ['collageCount', 'headline', 'subtext', 'date', 'opponent'],
    info: () => SPONSOR_ROW,
    draw(ctx, L, o, box) {
      sponsorRow(ctx, L, o, box.y, subLine(o.data));
    },
  },

  'meet-team': {
    name: 'Meet the Team / Coaches',
    desc: 'Photo with up to 3 name ribbons',
    photos: 'one', sponsor: false, headline: { label: 'Headline', placeholder: 'e.g. Meet the coaches' },
    fields: ['headline', 'people', 'date'],
    info: () => RIBBON,
    draw(ctx, L, o, box) {
      const people = o.data.people.length ? o.data.people : [{ role: 'ROLE', name: 'Name' }];
      const gap = 24 * L.s, n = people.length;
      const w = (box.w - gap * (n - 1)) / n;
      people.forEach((p, i) => ribbon(ctx, L, box.x + i * (w + gap), box.y, w, RIBBON * L.s, 'green', p.role, p.name, n > 2 ? 46 : 56));
    },
  },

  'next-game': {
    name: 'Next Game',
    desc: 'Upcoming match: opponent, date, time, venue',
    photos: 'optional', sponsor: true,
    fields: ['opponent', 'date', 'time', 'venue'],
    info: () => 90 + 20 + 110 + 26 + SPONSOR_ROW,
    draw(ctx, L, o, box) {
      const { s } = L, d = o.data;
      const vs = `VS ${(d.opponent || 'OPPONENT').toUpperCase()}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = font(L, 'display', 700, fitSize(ctx, L, vs, 'display', 700, 76 * s, box.w));
      ctx.fillStyle = L.brand.colors.text;
      ctx.fillText(vs, L.W / 2, box.y + 70 * s);
      iconRow(ctx, L, box.x, box.y + 110 * s, box.w, 110 * s, [
        ['calendar', 'DATE', d.dateShort || 'TBC'],
        ['clock', 'TIME', d.timeLabel || 'TBC'],
        ['pin', 'VENUE', d.venue || 'TBC'],
      ]);
      sponsorRow(ctx, L, o, box.y + (90 + 20 + 110 + 26) * s);
    },
  },

  'tournament': {
    name: 'Tournament Result',
    desc: 'Event name, finish (medal colours) and record',
    photos: 'one', sponsor: true, headline: { label: 'Event name', placeholder: 'e.g. Youth Nationals' },
    fields: ['headline', 'placing', 'record', 'subtext', 'date'],
    info: () => RIBBON + 26 + SPONSOR_ROW,
    draw(ctx, L, o, box) {
      const d = o.data, w = Math.min(box.w, 760 * L.s);
      ribbon(ctx, L, L.W / 2 - w / 2, box.y, w, RIBBON * L.s, medalStyle(d.placing),
        d.subtext || L.brand.labels.tournamentRibbon || 'FINAL STANDING', d.placing || 'Placing');
      sponsorRow(ctx, L, o, box.y + (RIBBON + 26) * L.s, d.record ? `RECORD ${d.record}` : '');
    },
  },

  'thank-you': {
    name: 'Sponsor Thank-You',
    desc: 'Sponsor tier ribbon and big logo. No photo needed',
    photos: 'none', sponsor: true,
    fields: ['date'],
    draw(ctx, L, o, box) {
      const { s, brand } = L, d = o.data;
      const msgSize = 29 * s, msgLine = 46 * s;
      ctx.font = font(L, 'body', 500, msgSize);
      const msg = wrapLines(ctx, (brand.labels.thankYouMessage || '').toUpperCase(), box.w - 80 * s, 2.5 * s);
      const ribbonH = d.sponsorTier ? 130 * s : 0;
      const gap = 44 * s;
      const fixed = 40 * s + gap + (ribbonH ? ribbonH + gap : 0) + gap + msg.length * msgLine;
      const logoH = Math.max(160 * s, Math.min(400 * s, box.h - fixed));
      let y = box.y + (box.h - fixed - logoH) / 2;

      ctx.fillStyle = brand.colors.text;
      spaced(ctx, L, brand.labels.supportLine || '', L.W / 2, y + 30 * s, 'body', 500, 30 * s, 6 * s, 'center', box.w);
      y += 40 * s + gap;
      if (ribbonH) {
        const w = Math.min(box.w, 900 * s);
        ribbon(ctx, L, L.W / 2 - w / 2, y, w, ribbonH, medalStyle(d.sponsorTier), null, d.sponsorTier.toUpperCase(), 64, brand.labels.sponsorWord || 'SPONSOR');
        y += ribbonH + gap;
      }
      const bw = Math.min(box.w, 900 * s);
      logoBox(ctx, L, o, L.W / 2 - bw / 2, y, bw, logoH, 0.62);
      y += logoH + gap;
      ctx.font = font(L, 'body', 500, msgSize);
      ctx.fillStyle = brand.colors.text;
      msg.forEach((line, i) => spaced(ctx, L, line, L.W / 2, y + msgSize + i * msgLine, 'body', 500, msgSize, 2.5 * s, 'center'));
    },
  },
};

// Default headline text per template (config.headlines overrides).
const DEFAULT_HEADLINES = {
  'game-day': 'FINAL SCORE', 'highlight': 'GAME HIGHLIGHT', 'collage': 'GAME DAY', 'meet-team': 'MEET THE TEAM',
  'next-game': 'NEXT GAME', 'tournament': 'TOURNAMENT RESULT', 'thank-you': 'THANK YOU',
};

// ---------- Main entry ----------
// o: { template, photos: [{ img, fit, crops }], data, brand, assets }
// Returns the photo regions (canvas pixels) so the app can map drags to the right photo.

export function drawPost(ctx, fmt, o) {
  const s = fmt.s, W = fmt.w, H = fmt.h;
  const T = Math.max(44 * s, fmt.safeTop + 20);
  const B = H - Math.max(36 * s, fmt.safeBottom + 10);
  const L = { W, H, s, brand: o.brand, M: 50, T, B };
  const t = TEMPLATES[o.template];

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = o.brand.colors.background;
  ctx.fillRect(0, 0, W, H);

  const headBottom = header(ctx, L, o, headlineText(o));
  const footTop = footer(ctx, L);
  const top = headBottom + 34 * s, bottom = footTop - 30 * s;
  const contentW = W - 2 * L.M;
  let regions = [];

  if (t.photos === 'none') {
    t.draw(ctx, L, o, { x: L.M, y: top, w: contentW, h: bottom - top });
  } else {
    const infoH = t.info() * s;
    const win = { x: L.M + 14 * s, y: top + 14 * s, w: contentW - 28 * s, h: bottom - top - infoH - 34 * s - 28 * s };
    regions = photoWindow(ctx, L, o, win, fmt.id);
    t.draw(ctx, L, o, { x: L.M, y: bottom - infoH, w: contentW, h: infoH });
  }

  const overlay = o.assets.overlays?.[o.template]?.[fmt.id];
  if (overlay) ctx.drawImage(overlay, 0, 0, W, H);
  ctx.restore();
  return regions;
}

function headlineText(o) {
  const custom = TEMPLATES[o.template].headline && o.data.headline;
  return (custom || o.brand.headlines?.[o.template] || DEFAULT_HEADLINES[o.template]).toUpperCase();
}

// Preview-only: shade the Story areas Instagram covers with its own UI.
export function drawGuides(ctx, fmt) {
  if (!fmt.safeTop && !fmt.safeBottom) return;
  ctx.save();
  ctx.fillStyle = 'rgba(255,40,90,0.22)';
  ctx.fillRect(0, 0, fmt.w, fmt.safeTop);
  ctx.fillRect(0, fmt.h - fmt.safeBottom, fmt.w, fmt.safeBottom);
  ctx.setLineDash([18, 14]);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, fmt.safeTop); ctx.lineTo(fmt.w, fmt.safeTop);
  ctx.moveTo(0, fmt.h - fmt.safeBottom); ctx.lineTo(fmt.w, fmt.h - fmt.safeBottom);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Instagram covers this area (preview only)', fmt.w / 2, fmt.safeTop / 2);
  ctx.fillText('Instagram covers this area (preview only)', fmt.w / 2, fmt.h - fmt.safeBottom / 2);
  ctx.restore();
}

// ---------- Header & footer ----------

// Badge on the left; eyebrow, gold rule and two-line headline (cream / gold) on the right.
function header(ctx, L, o, text) {
  const { s, brand } = L;
  const size = 300 * s;
  if (o.assets.club) {
    const fit = fitBox(o.assets.club, size, size);
    ctx.drawImage(o.assets.club.img, L.M + (size - fit.w) / 2, L.T + (size - fit.h) / 2, fit.w, fit.h);
  }
  const x0 = L.M + size + 44 * s, x1 = L.W - L.M, colW = x1 - x0;
  ctx.fillStyle = brand.colors.accent;
  spaced(ctx, L, brand.labels.eyebrow || '', x0, L.T + 46 * s, 'body', 600, 28 * s, 6 * s, 'left', colW);
  ctx.fillRect(x0, L.T + 76 * s, colW, 2 * s);

  const lines = splitHeadline(ctx, L, text);
  let fsize = 124 * s;
  for (const line of lines) fsize = Math.min(fsize, fitSize(ctx, L, line, 'display', 700, 124 * s, colW));
  ctx.font = font(L, 'display', 700, fsize);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const room = L.T + size - (L.T + 90 * s);
  const lh = fsize * 1.02;
  let y = L.T + 90 * s + (room - lh * lines.length) / 2 + fsize * 0.86;
  lines.forEach((line, i) => {
    ctx.fillStyle = lines.length > 1 && i === 0 ? brand.colors.text : (lines.length > 1 ? brand.colors.accent : brand.colors.text);
    ctx.fillText(line, x0, y);
    y += lh;
  });
  return L.T + size;
}

// "MEET THE|COACHES" splits at the bar; otherwise split into two balanced lines.
function splitHeadline(ctx, L, text) {
  if (text.includes('|')) return text.split('|').map((t) => t.trim()).filter(Boolean).slice(0, 2);
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return [text];
  ctx.font = font(L, 'display', 700, 100);
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const wid = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
    if (!best || wid < best.wid) best = { lines: [a, b], wid };
  }
  return best.lines;
}

// Gold season line with rules either side. Returns the footer's top edge.
function footer(ctx, L) {
  const { s, brand } = L;
  const y = L.B - 8 * s, size = 30 * s;
  const text = brand.labels.season || '';
  ctx.font = font(L, 'body', 600, size);
  const tw = spacedWidth(ctx, text, 8 * s);
  ctx.fillStyle = brand.colors.accent;
  spaced(ctx, L, text, L.W / 2, y, 'body', 600, size, 8 * s, 'center');
  const mid = y - size * 0.36, pad = 34 * s;
  ctx.fillRect(L.M, mid, L.W / 2 - tw / 2 - pad - L.M, 2 * s);
  ctx.fillRect(L.W / 2 + tw / 2 + pad, mid, L.W / 2 - tw / 2 - pad - L.M, 2 * s);
  return y - size - 10 * s;
}

// ---------- Photo window ----------

export const defaultCrop = () => ({ x: 0.5, y: 0.5, zoom: 1 });

function photoWindow(ctx, L, o, win, fmtId) {
  const { s, brand } = L;
  const photos = o.photos.length ? o.photos : [null];
  const cells = collageCells(win, photos.length, 10 * s);
  const regions = [];
  cells.forEach((cell, i) => {
    const ph = photos[i];
    const key = photos.length > 1 ? `${fmtId}:c${photos.length}:${i}` : fmtId;
    drawPhotoIn(ctx, L, o, ph, cell, key);
    if (ph) regions.push({ ...cell, key, ref: ph.ref, index: i });
  });
  // Gold double frame
  ctx.strokeStyle = brand.colors.accent;
  ctx.lineWidth = 3 * s;
  ctx.strokeRect(win.x - 14 * s, win.y - 14 * s, win.w + 28 * s, win.h + 28 * s);
  ctx.lineWidth = 2 * s;
  ctx.strokeRect(win.x - 5 * s, win.y - 5 * s, win.w + 10 * s, win.h + 10 * s);
  return regions;
}

// Split the window into 1–4 cells, adapting to whether the window is wide or tall.
function collageCells(r, n, g) {
  const wide = r.w >= r.h;
  if (n <= 1) return [r];
  if (n === 2) {
    return wide
      ? [{ x: r.x, y: r.y, w: (r.w - g) / 2, h: r.h }, { x: r.x + (r.w + g) / 2, y: r.y, w: (r.w - g) / 2, h: r.h }]
      : [{ x: r.x, y: r.y, w: r.w, h: (r.h - g) / 2 }, { x: r.x, y: r.y + (r.h + g) / 2, w: r.w, h: (r.h - g) / 2 }];
  }
  if (n === 3) {
    if (wide) {
      const bw = (r.w - g) * 0.58, sw = r.w - g - bw, sh = (r.h - g) / 2;
      return [{ x: r.x, y: r.y, w: bw, h: r.h }, { x: r.x + bw + g, y: r.y, w: sw, h: sh }, { x: r.x + bw + g, y: r.y + sh + g, w: sw, h: sh }];
    }
    const bh = (r.h - g) * 0.58, sh = r.h - g - bh, sw = (r.w - g) / 2;
    return [{ x: r.x, y: r.y, w: r.w, h: bh }, { x: r.x, y: r.y + bh + g, w: sw, h: sh }, { x: r.x + sw + g, y: r.y + bh + g, w: sw, h: sh }];
  }
  const w = (r.w - g) / 2, h = (r.h - g) / 2;
  return [0, 1, 2, 3].map((i) => ({ x: r.x + (i % 2) * (w + g), y: r.y + Math.floor(i / 2) * (h + g), w, h }));
}

function drawPhotoIn(ctx, L, o, ph, r, key) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  if (!ph) {
    placeholderPanel(ctx, L, o, r);
  } else {
    const img = ph.img, iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (ph.fit) {
      // Whole photo, uncropped, on a blurred and darkened copy of itself.
      const cs = Math.max(r.w / iw, r.h / ih);
      if ('filter' in ctx) ctx.filter = `blur(${Math.round(28 * L.s)}px)`;
      ctx.drawImage(img, r.x + (r.w - iw * cs) / 2 - 40, r.y + (r.h - ih * cs) / 2 - 40, iw * cs + 80, ih * cs + 80);
      ctx.filter = 'none';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      const fs = Math.min(r.w / iw, r.h / ih);
      ctx.drawImage(img, r.x + (r.w - iw * fs) / 2, r.y + (r.h - ih * fs) / 2, iw * fs, ih * fs);
    } else {
      const crop = clampCrop({ ...(ph.crops[key] ||= defaultCrop()) }, iw, ih, r.w, r.h);
      const sc = coverScale(iw, ih, r.w, r.h, crop.zoom);
      const dw = iw * sc, dh = ih * sc;
      ctx.drawImage(img, r.x + r.w / 2 - crop.x * dw, r.y + r.h / 2 - crop.y * dh, dw, dh);
    }
  }
  ctx.restore();
}

// Shown when a template's photo is optional and none was added (or in the empty preview).
function placeholderPanel(ctx, L, o, r) {
  const g = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 0, r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) * 0.7);
  g.addColorStop(0, L.brand.colors.primary);
  g.addColorStop(1, L.brand.colors.background);
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  if (o.assets.club) {
    const fit = fitBox(o.assets.club, r.w * 0.6, r.h * 0.75);
    ctx.globalAlpha = 0.18;
    ctx.drawImage(o.assets.club.img, r.x + (r.w - fit.w) / 2, r.y + (r.h - fit.h) / 2, fit.w, fit.h);
    ctx.globalAlpha = 1;
  }
}

function coverScale(iw, ih, W, H, zoom) {
  return Math.max(W / iw, H / ih) * zoom;
}

// A crop is { x, y, zoom }: x/y is the point of the photo (0–1) shown at the centre of its
// window; zoom 1 means "just covers the window".
export function clampCrop(crop, iw, ih, W, H) {
  crop.zoom = Math.min(MAX_ZOOM, Math.max(1, crop.zoom));
  const sc = coverScale(iw, ih, W, H, crop.zoom);
  const hx = W / 2 / (iw * sc), hy = H / 2 / (ih * sc);
  crop.x = Math.min(1 - hx, Math.max(hx, crop.x));
  crop.y = Math.min(1 - hy, Math.max(hy, crop.y));
  return crop;
}

// Move the crop by a distance in canvas pixels.
export function panCrop(crop, iw, ih, W, H, dx, dy) {
  const sc = coverScale(iw, ih, W, H, crop.zoom);
  crop.x -= dx / (iw * sc);
  crop.y -= dy / (ih * sc);
  return clampCrop(crop, iw, ih, W, H);
}

// ---------- Info elements ----------

const RIBBON_STYLES = {
  green:    { fill: ['#356038', '#2A4A2D'], label: 'accent', value: 'text' },
  gold:     { fill: ['#F0DB9A', '#C9A04F'], label: '#2F5233', value: '#141414' },
  silver:   { fill: ['#F4F5F7', '#B7BCC4'], label: '#2F5233', value: '#141414' },
  bronze:   { fill: ['#EBC29C', '#A86C3C'], label: '#2F2014', value: '#141414' },
  platinum: { fill: ['#FAFBFC', '#C9D3DC'], label: '#2F5233', value: '#141414' },
};

function medalStyle(text) {
  const t = (text || '').toLowerCase();
  if (/platinum/.test(t)) return 'platinum';
  if (/gold|1st|first|champ|winner/.test(t)) return 'gold';
  if (/silver|2nd|second/.test(t)) return 'silver';
  if (/bronze|3rd|third/.test(t)) return 'bronze';
  return 'green';
}

// Ribbon banner with notched ends: small spaced label above (or below) a serif value.
function ribbon(ctx, L, x, y, w, h, style, label, value, valueSize = 60, labelBelow = null) {
  const { s, brand } = L, st = RIBBON_STYLES[style] || RIBBON_STYLES.green;
  const col = (c) => (c === 'accent' ? brand.colors.accent : c === 'text' ? brand.colors.text : c);
  const n = Math.min(40 * s, h * 0.3);
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - n, y + h / 2); ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h); ctx.lineTo(x + n, y + h / 2); ctx.closePath();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, st.fill[0]); g.addColorStop(1, st.fill[1]);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = brand.colors.accent;
  ctx.lineWidth = 3 * s;
  ctx.stroke();

  const inner = w - 2 * n - 30 * s;
  const vsize = fitSize(ctx, L, String(value), 'display', 700, valueSize * s, inner);
  const lsize = 24 * s, sp = 5 * s;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  if (label != null) {
    ctx.fillStyle = col(st.label);
    spaced(ctx, L, String(label).toUpperCase(), x + w / 2, y + h * 0.36, 'body', 600, lsize, sp, 'center', inner);
    ctx.textAlign = 'center';
    ctx.font = font(L, 'display', 700, vsize);
    ctx.fillStyle = col(st.value);
    ctx.fillText(value, x + w / 2, y + h * 0.36 + 18 * s + vsize * 0.78);
  } else {
    ctx.font = font(L, 'display', 700, vsize);
    ctx.fillStyle = col(st.value);
    ctx.fillText(value, x + w / 2, y + h * 0.58);
    if (labelBelow) {
      ctx.fillStyle = col(st.label);
      spaced(ctx, L, labelBelow, x + w / 2, y + h * 0.84, 'body', 600, lsize, 8 * s, 'center', inner);
    }
  }
}

// "PRESENTED BY [logo box]", right-aligned when there's text on the left, else centred.
function sponsorRow(ctx, L, o, y, leftText = '') {
  const { s, brand } = L, h = SPONSOR_ROW * s;
  const label = brand.labels.presentedBy || 'PRESENTED BY';
  const lsize = 24 * s, sp = 4 * s;
  ctx.font = font(L, 'body', 600, lsize);
  const lw = spacedWidth(ctx, label, sp);
  const boxH = h, boxW = Math.min(400 * s, boxH * 3.6), gap = 26 * s;
  const groupW = lw + gap + boxW;
  const x1 = L.W - L.M;
  const gx = leftText ? x1 - groupW : L.W / 2 - groupW / 2;
  ctx.fillStyle = brand.colors.accent;
  spaced(ctx, L, label, gx, y + h / 2 + lsize * 0.36, 'body', 600, lsize, sp, 'left');
  logoBox(ctx, L, o, gx + lw + gap, y, boxW, boxH, 0.7);
  if (leftText) {
    ctx.fillStyle = brand.colors.text;
    spaced(ctx, L, leftText.toUpperCase(), L.M, y + h / 2 + 10 * s, 'body', 500, 28 * s, 3 * s, 'left', gx - 40 * s - L.M);
  }
}

// White box with a gold double border holding the sponsor logo (or the name as text).
function logoBox(ctx, L, o, x, y, w, h, fill) {
  const { s, brand } = L;
  const dark = o.data.sponsorPlate === 'dark';
  ctx.fillStyle = dark ? '#151515' : brand.colors.secondary;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = brand.colors.accent;
  ctx.lineWidth = 3 * s;
  ctx.strokeRect(x - 7 * s, y - 7 * s, w + 14 * s, h + 14 * s);
  ctx.lineWidth = 1.5 * s;
  ctx.strokeRect(x, y, w, h);
  const a = o.assets.sponsor;
  const pad = Math.min(w, h) * (1 - fill) / 2;
  if (a) {
    const fit = fitBox(a, w - pad * 2, h - pad * 2);
    ctx.drawImage(a.img, x + (w - fit.w) / 2, y + (h - fit.h) / 2, fit.w, fit.h);
  } else {
    ctx.fillStyle = dark ? '#fff' : '#141414';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(L, 'body', 600, fitSize(ctx, L, o.data.sponsorName, 'body', 600, h * 0.4, w - pad * 2));
    ctx.fillText(o.data.sponsorName, x + w / 2, y + h / 2);
  }
}

// Three columns of [icon] LABEL / value, separated by thin gold rules.
function iconRow(ctx, L, x, y, w, h, items) {
  const { s, brand } = L, colW = w / items.length, r = 34 * s;
  items.forEach(([icon, label, value], i) => {
    const cx = x + i * colW;
    if (i) { ctx.fillStyle = brand.colors.accent; ctx.fillRect(cx, y + 14 * s, 2 * s, h - 28 * s); }
    const ix = cx + 22 * s + r, iy = y + h / 2;
    ctx.strokeStyle = brand.colors.accent;
    ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.arc(ix, iy, r, 0, Math.PI * 2); ctx.stroke();
    drawIcon(ctx, icon, ix, iy, r * 0.5, s, brand.colors.accent);
    const tx = ix + r + 16 * s, tw = cx + colW - tx - 12 * s;
    ctx.fillStyle = brand.colors.accent;
    spaced(ctx, L, label, tx, iy - 8 * s, 'body', 600, 20 * s, 4 * s, 'left', tw);
    ctx.fillStyle = brand.colors.text;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = font(L, 'body', 600, fitSize(ctx, L, value, 'body', 600, 30 * s, tw));
    ctx.fillText(value, tx, iy + 30 * s);
  });
}

function drawIcon(ctx, kind, x, y, r, s, color) {
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.5 * s; ctx.lineCap = 'round';
  if (kind === 'calendar') {
    ctx.strokeRect(x - r, y - r * 0.75, r * 2, r * 1.75);
    ctx.fillRect(x - r, y - r * 0.75, r * 2, r * 0.45);
    ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r); ctx.lineTo(x - r * 0.5, y - r * 0.55);
    ctx.moveTo(x + r * 0.5, y - r); ctx.lineTo(x + r * 0.5, y - r * 0.55); ctx.stroke();
  } else if (kind === 'clock') {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - r * 0.6); ctx.moveTo(x, y); ctx.lineTo(x + r * 0.45, y + r * 0.2); ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(x, y - r * 0.25, r * 0.7, Math.PI * 0.85, Math.PI * 2.15);
    ctx.lineTo(x, y + r); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y - r * 0.25, r * 0.25, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// "vs Opponent · date" unless the user typed their own small line.
function subLine(d) {
  return d.subtext || [d.opponent && `vs ${d.opponent}`, d.dateLabel].filter(Boolean).join('  ·  ');
}

// ---------- Text helpers ----------

const FALLBACK = { display: 'Georgia, "Times New Roman", serif', body: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' };

function font(L, role, weight, size) {
  return `${weight} ${Math.round(size)}px "${L.brand.fonts[role]}", ${FALLBACK[role]}`;
}

// Largest size (≤ max) at which the text fits in maxW.
function fitSize(ctx, L, text, role, weight, max, maxW) {
  ctx.font = font(L, role, weight, max);
  const w = ctx.measureText(text).width;
  return w <= maxW ? max : Math.max(12, Math.floor(max * maxW / w));
}

function spacedWidth(ctx, text, sp) {
  return ctx.measureText(text).width + Math.max(0, [...text].length - 1) * sp;
}

// Letter-spaced text drawn character by character (canvas letterSpacing isn't on all phones).
// Shrinks to fit maxW if given. Uses the current fillStyle.
function spaced(ctx, L, text, x, y, role, weight, size, sp, align, maxW) {
  ctx.font = font(L, role, weight, size);
  let w = spacedWidth(ctx, text, sp);
  if (maxW && w > maxW) {
    const k = maxW / w;
    size *= k; sp *= k;
    ctx.font = font(L, role, weight, size);
    w = spacedWidth(ctx, text, sp);
  }
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + sp;
  }
}

// Greedy word wrap using the current font, accounting for letter spacing.
function wrapLines(ctx, text, maxW, sp) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${word}` : word;
    if (line && spacedWidth(ctx, test, sp) > maxW) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

// Size a logo to fit a box without stretching.
function fitBox(a, maxW, maxH) {
  const r = Math.min(maxW / a.w, maxH / a.h);
  return { w: a.w * r, h: a.h * r };
}

// ---------- Logo loading ----------
// Loads a logo, trims transparent margins (so every logo fills its box the same way) and
// collects warnings for the maintainer about size, format and transparency.

export async function loadLogo(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Logo file not found: ${url}`);
  const blob = await res.blob();
  const img = await blobToImage(blob);
  const warnings = [];
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if (!/\.png$/i.test(url) || blob.type !== 'image/png') warnings.push(`${url} is not a PNG. Use a PNG with a transparent background.`);
  if (iw < 600) warnings.push(`${url} is only ${iw}px wide. Use one at least 1000px wide so it looks crisp.`);

  const c = document.createElement('canvas');
  c.width = iw; c.height = ih;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, iw, ih);
  const alpha = (x, y) => data[(y * iw + x) * 4 + 3];
  if ([alpha(0, 0), alpha(iw - 1, 0), alpha(0, ih - 1), alpha(iw - 1, ih - 1)].every((v) => v === 255)) {
    warnings.push(`${url} doesn't seem to have a transparent background.`);
  }
  let x0 = iw, y0 = ih, x1 = -1, y1 = -1;
  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      if (data[(y * iw + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = iw - 1; y1 = ih - 1; }
  const tw = x1 - x0 + 1, th = y1 - y0 + 1;
  const k = Math.min(1, 1600 / Math.max(tw, th));
  const out = document.createElement('canvas');
  out.width = Math.round(tw * k); out.height = Math.round(th * k);
  const octx = out.getContext('2d');
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(c, x0, y0, tw, th, 0, 0, out.width, out.height);
  c.width = c.height = 0;
  return { img: out, w: out.width, h: out.height, warnings };
}

export function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}
