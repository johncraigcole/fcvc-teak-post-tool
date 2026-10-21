// Drawing engine: turns a photo + template + details into a finished post on a canvas.
// Everything is drawn in output pixels, so the preview is exactly what gets downloaded.

// Output sizes. safeTop/safeBottom keep text and logos clear of Instagram's Story UI.
// `s` scales the template's element sizes for that format.
export const FORMATS = {
  feed:   { id: 'feed',   label: 'Feed',   ratio: '4:5',  w: 1080, h: 1350, safeTop: 0,   safeBottom: 0,   s: 1 },
  story:  { id: 'story',  label: 'Story',  ratio: '9:16', w: 1080, h: 1920, safeTop: 250, safeBottom: 250, s: 1.05 },
  square: { id: 'square', label: 'Square', ratio: '1:1',  w: 1080, h: 1080, safeTop: 0,   safeBottom: 0,   s: 0.85 },
};

const FRAME = 22;          // width of the club-coloured frame around every post
const MAX_ZOOM = 5;

// ---------- Templates ----------
// Each template lists the detail fields it uses, an optional shade (drawn over the photo,
// under the frame) and the foreground elements.

export const TEMPLATES = {
  'game-day': {
    name: 'Game Day Result',
    short: 'Result',
    fields: ['date', 'opponent', 'score'],
    shade(ctx, L) {
      topShade(ctx, L);
      const barY = L.B - 130 * L.s;
      vShade(ctx, L, barY - 660 * L.s, barY, 0, 0.88);
      ctx.fillStyle = rgba(L.brand.colors.dark, 0.88);
      ctx.fillRect(0, barY, L.W, L.H - barY);
    },
    draw(ctx, L, o) {
      const { s, brand } = L, d = o.data;
      clubLogo(ctx, L, o);
      pill(ctx, L, brand.labels?.result || 'FULL TIME');

      // Sponsor bar: "PRESENTED BY [logo]"
      const barH = 130 * s, barY = L.B - barH;
      ctx.fillStyle = brand.colors.secondary;
      ctx.fillRect(L.X0, barY, L.X1 - L.X0, barH);
      ctx.fillStyle = brand.colors.accent;
      ctx.fillRect(L.X0, barY, L.X1 - L.X0, 8 * s);
      const label = brand.labels?.presentedBy || 'PRESENTED BY';
      ctx.font = font(L, 'body', 800, 28 * s);
      const labelW = ctx.measureText(label).width, gap = 32 * s;
      const logoH = barH - 50 * s, logoMaxW = (L.X1 - L.X0) - labelW - gap - 100 * s;
      const fit = fitBox(o.assets.sponsor, Math.min(logoMaxW, 420 * s), logoH, ctx, L, o);
      let x = L.W / 2 - (labelW + gap + fit.w) / 2;
      const midY = barY + 4 * s + (barH - 4 * s) / 2;
      ctx.fillStyle = brand.colors.primary;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(label, x, midY);
      sponsorLogo(ctx, L, o, x + labelW + gap, midY - fit.h / 2, fit.w, fit.h, 'onWhite');

      // Score block, stacked upwards from the bar
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      let y = barY - 46 * s;
      if (d.dateLabel) {
        ctx.font = font(L, 'body', 600, 34 * s);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(d.dateLabel.toUpperCase(), L.W / 2, y);
        y -= 34 * s + 34 * s;
      }
      if (d.score) {
        const size = fitSize(ctx, L, d.score, 'display', 400, 250 * s, L.X1 - L.X0 - 120 * s);
        ctx.font = font(L, 'display', 400, size);
        ctx.fillStyle = brand.colors.text;
        ctx.fillText(d.score, L.W / 2, y);
        y -= ctx.measureText(d.score).actualBoundingBoxAscent + 36 * s;
      }
      const matchup = [brand.clubShortName || brand.clubName, d.opponent && 'VS', d.opponent].filter(Boolean).join('  ').toUpperCase();
      const size = fitSize(ctx, L, matchup, 'display', 400, 78 * s, L.X1 - L.X0 - 120 * s);
      ctx.font = font(L, 'display', 400, size);
      ctx.fillStyle = brand.colors.accent;
      ctx.fillText(matchup, L.W / 2, y);
    },
  },

  'highlight': {
    name: 'Player / Moment Highlight',
    short: 'Highlight',
    fields: ['date', 'opponent', 'headline', 'subtext'],
    shade(ctx, L) {
      topShade(ctx, L);
      vShade(ctx, L, L.B - 720 * L.s, L.B, 0, 0.88);
      ctx.fillStyle = rgba(L.brand.colors.dark, 0.88);
      ctx.fillRect(0, L.B, L.W, L.H - L.B);
    },
    draw(ctx, L, o) {
      const { s, brand } = L, d = o.data;
      clubLogo(ctx, L, o);
      pill(ctx, L, brand.labels?.highlight || 'HIGHLIGHT');

      // Sponsor logo on a plate, bottom right
      const pad = 22 * s;
      const fit = fitBox(o.assets.sponsor, 300 * s, 100 * s, ctx, L, o);
      const plateH = fit.h + pad * 2, plateR = L.X1 - 40 * s, plateB = L.B - 40 * s;
      const lx = plateR - pad - fit.w, ly = plateB - pad - fit.h;
      sponsorLogo(ctx, L, o, lx, ly, fit.w, fit.h, 'onPhoto', pad);

      // Sub line (defaults to "vs Opponent · date")
      const left = L.X0 + 48 * s;
      const sub = d.subtext || [d.opponent && `vs ${d.opponent}`, d.dateLabel].filter(Boolean).join('  ·  ');
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      if (sub) {
        const maxW = lx - pad - 36 * s - left;
        ctx.font = font(L, 'body', 600, fitSize(ctx, L, sub, 'body', 600, 38 * s, maxW, 600));
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText(sub, left, plateB - plateH / 2);
      }

      // Headline: up to two lines, auto-sized
      const text = (d.headline || 'Big moment!').toUpperCase();
      const maxW = L.X1 - L.X0 - 96 * s;
      const lines = wrapTwo(ctx, L, text, 'display', 400, 150 * s, maxW);
      ctx.font = font(L, 'display', 400, lines.size);
      ctx.fillStyle = brand.colors.text;
      ctx.textBaseline = 'alphabetic';
      let y = plateB - plateH - 40 * s;
      for (let i = lines.lines.length - 1; i >= 0; i--) {
        ctx.fillText(lines.lines[i], left, y);
        y -= lines.size * 1.0;
      }
      const top = y + lines.size - ctx.measureText(lines.lines[0]).actualBoundingBoxAscent;
      ctx.fillStyle = brand.colors.accent;
      ctx.fillRect(left, top - 40 * s, 120 * s, 12 * s);
    },
  },

  'thank-you': {
    name: 'Sponsor Thank-You',
    short: 'Thank You',
    fields: ['date'],
    shade(ctx, L) {
      topShade(ctx, L);
      vShade(ctx, L, L.B - 760 * L.s, L.H, 0, 0.6);
    },
    draw(ctx, L, o) {
      const { s, brand } = L, d = o.data;
      clubLogo(ctx, L, o);

      // White card with a big sponsor logo
      const m = 56 * s, cardW = L.X1 - L.X0 - m * 2, cardH = 480 * s;
      const cx = L.X0 + m, cy = L.B - 50 * s - cardH;
      ctx.save();
      roundRect(ctx, cx, cy, cardW, cardH, 30 * s);
      ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 40 * s; ctx.shadowOffsetY = 12 * s;
      ctx.fillStyle = brand.colors.secondary;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.clip();
      ctx.fillStyle = brand.colors.accent;
      ctx.fillRect(cx, cy, cardW, 14 * s);
      ctx.restore();

      const label = brand.labels?.thankYou || 'THANKS TO OUR SPONSOR';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = font(L, 'display', 400, fitSize(ctx, L, label, 'display', 400, 58 * s, cardW - 100 * s));
      ctx.fillStyle = brand.colors.primary;
      const labelY = cy + 50 * s + ctx.measureText(label).actualBoundingBoxAscent;
      ctx.fillText(label, L.W / 2, labelY);

      const nameY = cy + cardH - 48 * s;
      const fit = fitBox(o.assets.sponsor, cardW - 140 * s, nameY - labelY - 130 * s, ctx, L, o);
      const top = labelY + 30 * s + ((nameY - 66 * s) - (labelY + 30 * s) - fit.h) / 2;
      sponsorLogo(ctx, L, o, L.W / 2 - fit.w / 2, top, fit.w, fit.h, 'onWhite');

      ctx.font = font(L, 'body', 800, fitSize(ctx, L, d.sponsorName, 'body', 800, 40 * s, cardW - 100 * s, 800));
      ctx.fillStyle = brand.colors.primary;
      ctx.fillText(d.sponsorName, L.W / 2, nameY);
    },
  },
};

// ---------- Main entry ----------

export function drawPost(ctx, fmt, o) {
  const W = fmt.w, H = fmt.h, s = fmt.s;
  const L = {
    W, H, s, brand: o.brand,
    X0: FRAME, X1: W - FRAME,
    T: Math.max(FRAME, fmt.safeTop), B: H - Math.max(FRAME, fmt.safeBottom),
  };
  const t = TEMPLATES[o.template];
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  drawPhoto(ctx, o.photo, o.crop, W, H, o.brand);
  t.shade?.(ctx, L);
  const overlay = o.assets.overlays?.[o.template]?.[fmt.id];
  if (overlay) ctx.drawImage(overlay, 0, 0, W, H);
  else drawFrame(ctx, L);
  t.draw(ctx, L, o);
  ctx.restore();
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

// ---------- Photo cropping ----------
// A crop is { x, y, zoom }: x/y is the point of the photo (0–1) shown at the centre of the
// canvas; zoom 1 means "just covers the canvas".

export const defaultCrop = () => ({ x: 0.5, y: 0.5, zoom: 1 });

function coverScale(iw, ih, W, H, zoom) {
  return Math.max(W / iw, H / ih) * zoom;
}

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

export { MAX_ZOOM };

function drawPhoto(ctx, img, crop, W, H, brand) {
  if (!img) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, brand.colors.primary);
    g.addColorStop(1, brand.colors.dark);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '600 44px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Your photo goes here', W / 2, H * 0.4);
    return;
  }
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const c = clampCrop({ ...crop }, iw, ih, W, H);
  const sc = coverScale(iw, ih, W, H, c.zoom);
  const dw = iw * sc, dh = ih * sc;
  ctx.drawImage(img, W / 2 - c.x * dw, H / 2 - c.y * dh, dw, dh);
}

// ---------- Shared elements ----------

function drawFrame(ctx, L) {
  const { W, H, brand } = L;
  ctx.fillStyle = brand.colors.primary;
  ctx.fillRect(0, 0, W, FRAME);
  ctx.fillRect(0, H - FRAME, W, FRAME);
  ctx.fillRect(0, 0, FRAME, H);
  ctx.fillRect(W - FRAME, 0, FRAME, H);
  ctx.strokeStyle = brand.colors.accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(FRAME + 8, FRAME + 8, W - 2 * FRAME - 16, H - 2 * FRAME - 16);
}

function clubLogo(ctx, L, o) {
  const size = 180 * L.s, x = L.X0 + 34 * L.s, y = L.T + 34 * L.s;
  const a = o.assets.club;
  if (!a) return;
  const fit = fitBox(a, size, size);
  drawLogo(ctx, a, x, y, fit.w, fit.h, L.brand.clubLogoPlate || 'none', 18 * L.s, L.s);
}

// Accent label pill, top right, vertically centred on the club logo.
function pill(ctx, L, text) {
  const s = L.s, h = 72 * s, padX = 30 * s;
  ctx.font = font(L, 'display', 400, 44 * s);
  const w = ctx.measureText(text).width + padX * 2;
  const x = L.X1 - 34 * s - w, y = L.T + 34 * s + 90 * s - h / 2;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = L.brand.colors.accent;
  ctx.fill();
  ctx.fillStyle = L.brand.colors.primary;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2 + 2 * s);
}

// Sponsor logo, or the sponsor's name as text if the logo couldn't be loaded.
// `where` picks the default backing plate: logos on photos get a light plate unless the
// sponsor entry says otherwise; logos on the white bar/card only get one if set to "dark".
function sponsorLogo(ctx, L, o, x, y, w, h, where, pad = 18 * L.s) {
  const a = o.assets.sponsor, setting = o.data.sponsorPlate;
  const plate = where === 'onPhoto' ? (setting || 'light') : (setting === 'dark' ? 'dark' : 'none');
  if (a) return drawLogo(ctx, a, x, y, w, h, plate, pad, L.s);
  if (plate !== 'none') plateRect(ctx, x - pad, y - pad, w + pad * 2, h + pad * 2, plate, L.s);
  ctx.save();
  ctx.fillStyle = plate === 'dark' ? '#fff' : L.brand.colors.primary;
  ctx.font = font(L, 'body', 800, fitSize(ctx, L, o.data.sponsorName, 'body', 800, h * 0.6, w, 800));
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(o.data.sponsorName, x + w / 2, y + h / 2);
  ctx.restore();
}

// Size a logo to fit a box without stretching. Text fallback uses the full box width.
function fitBox(a, maxW, maxH, ctx, L, o) {
  if (!a) {
    if (!ctx) return { w: maxW, h: maxH };
    ctx.font = font(L, 'body', 800, maxH * 0.6);
    return { w: Math.min(maxW, ctx.measureText(o.data.sponsorName).width), h: maxH };
  }
  const r = Math.min(maxW / a.w, maxH / a.h);
  return { w: a.w * r, h: a.h * r };
}

function drawLogo(ctx, a, x, y, w, h, plate, pad, s) {
  if (plate && plate !== 'none') plateRect(ctx, x - pad, y - pad, w + pad * 2, h + pad * 2, plate, s);
  ctx.drawImage(a.img, x, y, w, h);
}

function plateRect(ctx, x, y, w, h, plate, s) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 18 * s);
  ctx.fillStyle = plate === 'dark' ? 'rgba(10,15,25,0.82)' : 'rgba(255,255,255,0.94)';
  ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 20 * s;
  ctx.fill();
  ctx.restore();
}

function topShade(ctx, L) {
  vShade(ctx, L, 0, L.T + 320 * L.s, 0.55, 0);
}

function vShade(ctx, L, y0, y1, a0, a1) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgba(L.brand.colors.dark, a0));
  g.addColorStop(1, rgba(L.brand.colors.dark, a1));
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, L.W, y1 - y0);
}

// ---------- Text helpers ----------

const FALLBACK = { display: 'Impact, "Arial Narrow Bold", sans-serif', body: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' };

function font(L, role, weight, size) {
  return `${weight} ${Math.round(size)}px "${L.brand.fonts[role]}", ${FALLBACK[role]}`;
}

// Largest size (≤ max) at which the text fits in maxW.
function fitSize(ctx, L, text, role, weight, max, maxW) {
  ctx.font = font(L, role, weight, max);
  const w = ctx.measureText(text).width;
  return w <= maxW ? max : Math.max(12, Math.floor(max * maxW / w));
}

// Fit text on one line, or split into two balanced lines if that allows a bigger size.
function wrapTwo(ctx, L, text, role, weight, max, maxW) {
  const one = fitSize(ctx, L, text, role, weight, max, maxW);
  const words = text.split(/\s+/);
  if (one >= max * 0.8 || words.length < 2) return { lines: [text], size: one };
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    ctx.font = font(L, role, weight, 100);
    const wid = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
    if (!best || wid < best.wid) best = { a, b, wid };
  }
  const size = Math.min(max, Math.floor(100 * maxW / best.wid));
  return size > one ? { lines: [best.a, best.b], size } : { lines: [text], size: one };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function rgba(hex, a) {
  const v = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
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
