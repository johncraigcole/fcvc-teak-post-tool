// "Next Game" hero artwork, drawn in code (no photos, no AI imagery): the ball comes over
// the net from the other side in a blazing trail and smashes through the club badge. The badge bursts into thick, gold-edged shards; zoom lines, shockwaves, light beams,
// slashes, halftone dots, sparks and grit give it a pumped-up sports-poster feel.

const TAU = Math.PI * 2;
const SPREAD = 0.58;          // how far the badge has burst apart (0 whole, 1 far apart)

export function drawHero(ctx, r, s, colors, badge) {
  const gold = colors.accent, green = colors.primary;
  // Badge (and ball) on the right, net on the left
  const L = Math.min(r.h * 0.92, r.w * 0.52);      // badge box size
  const R = L * 0.24;                               // ball radius
  const cx = r.x + r.w - L * 0.55, cy = r.y + r.h * 0.54;
  const net = netGeometry(r);
  // The ball comes from beyond the net (top left) and clears the tape on its way in.
  const from = [r.x - r.w * 0.04, r.y + r.h * 0.04];
  const travel = norm2(cx - from[0], cy - from[1]);

  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();

  // Background: black, sliding green bands, green glow, gold beams and slashes
  ctx.fillStyle = colors.background;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  stripes(ctx, r, s, green);
  const glow = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, Math.max(r.w, r.h) * 0.6);
  glow.addColorStop(0, rgba(green, 1));
  glow.addColorStop(0.5, rgba(green, 0.4));
  glow.addColorStop(1, rgba(green, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  beams(ctx, cx, cy, Math.hypot(r.w, r.h), gold);
  halftone(ctx, r, s, gold);
  slashes(ctx, r, s, gold, green);
  grit(ctx, r);
  zoomLines(ctx, cx, cy, R, r, s, gold);

  // Darken the background edges (before the subjects, so they stay bright)
  const mx = r.x + r.w / 2, my = r.y + r.h / 2;
  const v = ctx.createRadialGradient(mx, my, Math.min(r.w, r.h) * 0.4, mx, my, Math.hypot(r.w, r.h) * 0.55);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = v;
  ctx.fillRect(r.x, r.y, r.w, r.h);

  shockwaves(ctx, cx, cy, R, s, gold);
  core(ctx, cx, cy, R);
  if (badge) shatteredBadge(ctx, cx, cy, L, badge, s, gold, travel);
  drawNet(ctx, net, r, s, gold);
  trail(ctx, from, [cx, cy], R, s, gold);
  ball(ctx, cx, cy, R, s, colors);

  foregroundShards(ctx, r, s, gold);
  sparks(ctx, r, cx, cy, s, gold);
  ctx.restore();
}

// ---------- The shattered badge ----------

// Jagged pieces: a polar grid of rays and rings with jittered corners, so neighbouring
// pieces share edges. In units of the badge box, centred on the impact point.
function buildPieces() {
  const rand = mulberry32(31);
  const n = 13, rings = [0, 0.15, 0.34, 0.58, 0.95];
  const ang = Array.from({ length: n }, (_, i) => (i + (rand() - 0.5) * 0.5) * TAU / n);
  const V = ang.map((a) => rings.map((rr, j) => {
    if (j === 0) return [0, 0];
    const a2 = a + (rand() - 0.5) * 0.18, r2 = rr + (rand() - 0.5) * 0.06;
    return [Math.cos(a2) * r2, Math.sin(a2) * r2];
  }));
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = (i + 1) % n;
    for (let j = 0; j < rings.length - 1; j++) {
      const poly = j === 0 ? [V[i][0], V[i][1], V[k][1]] : [V[i][j], V[k][j], V[k][j + 1], V[i][j + 1]];
      const c = poly.reduce((m, q) => [m[0] + q[0] / poly.length, m[1] + q[1] / poly.length], [0, 0]);
      const d = Math.hypot(c[0], c[1]) || 0.01;
      out.push({
        poly, dir: [c[0] / d, c[1] / d], ring: j,
        dist: (0.55 - j * 0.08) * (0.8 + rand() * 0.45),   // inner pieces fly furthest
        rot: (rand() - 0.5) * (2.2 - j * 0.4),
        grow: 0.32 - j * 0.07,                             // inner pieces come toward the viewer
      });
    }
  }
  // Far pieces first so nearer (bigger) ones overlap them
  return out.sort((a, b) => a.grow - b.grow);
}

function shatteredBadge(ctx, cx, cy, L, badge, s, gold, travel) {
  const k = Math.min(L / badge.w, L / badge.h);
  const bw = badge.w * k, bh = badge.h * k;
  const thick = 9 * s;
  const size = Math.ceil(L), half = size / 2;
  for (const pc of buildPieces()) {
    // Cut the shard out of the badge on its own canvas. Its gold broken edge and highlight are
    // drawn 'source-atop', so they only appear where the badge has pixels: no empty slabs.
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.translate(half, half);
    g.beginPath();
    pc.poly.forEach(([x, y], i) => (i ? g.lineTo(x * L, y * L) : g.moveTo(x * L, y * L)));
    g.closePath();
    g.save();
    g.clip();
    g.drawImage(badge.img, -bw / 2, -bh / 2, bw, bh);
    g.restore();
    g.globalCompositeOperation = 'source-atop';
    const lg = g.createLinearGradient(-L * 0.5, -L * 0.5, L * 0.5, L * 0.5);
    lg.addColorStop(0, 'rgba(255,245,220,0.2)');
    lg.addColorStop(0.5, 'rgba(255,245,220,0)');
    g.fillStyle = lg;
    g.fillRect(-half, -half, size, size);
    g.lineJoin = 'miter';
    g.strokeStyle = gold;
    g.lineWidth = 7 * s;
    g.stroke();

    // Pieces fly away from the impact, pushed on in the direction the ball was travelling.
    // The shadow, offset down-right with no blur, gives each shard a slab-like thickness.
    const dir = norm2(pc.dir[0] + travel[0] * 0.6, pc.dir[1] + travel[1] * 0.6);
    const d = pc.dist * SPREAD * L, sc = 1 + pc.grow * SPREAD;
    ctx.save();
    ctx.translate(cx + dir[0] * d, cy + dir[1] * d);
    ctx.rotate(pc.rot * SPREAD);
    ctx.scale(sc, sc);
    ctx.shadowColor = '#2A1E0C';
    ctx.shadowOffsetX = thick * 0.6;
    ctx.shadowOffsetY = thick;
    ctx.drawImage(c, -half, -half);
    ctx.restore();
  }
}

// ---------- The net ----------
// A volleyball net on the left, seen at an angle, receding toward the badge. It's subdued
// (faded, slightly out of focus) and fades out from left to right, so it sets the scene
// without competing with the ball and badge.

function netGeometry(r) {
  return {
    farTop: [r.x + r.w * 0.42, r.y + r.h * 0.44], farBot: [r.x + r.w * 0.42, r.y + r.h * 0.76],
    nearTop: [r.x - r.w * 0.02, r.y + r.h * 0.3], nearBot: [r.x - r.w * 0.02, r.y + r.h * 1.08],
  };
}

function drawNet(ctx, n, r, s, gold) {
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  // Perspective spacing: strands bunch up toward the far end
  const along = (i, cols) => Math.pow(i / cols, 1.35);
  // Drawn on its own layer so the left-to-right fade can be masked in
  const c = document.createElement('canvas');
  c.width = Math.ceil(r.w); c.height = Math.ceil(r.h);
  const g = c.getContext('2d');
  g.translate(-r.x, -r.y);
  g.lineCap = 'round';

  // Mesh: dark strands with a faint gold glint
  const cols = 22, rows = 11;
  const strands = [];
  for (let i = 0; i <= cols; i++) {
    const t = along(i, cols);
    strands.push([lerp(n.farTop, n.nearTop, t), lerp(n.farBot, n.nearBot, t)]);
  }
  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    strands.push([lerp(n.farTop, n.farBot, v), lerp(n.nearTop, n.nearBot, v)]);
  }
  for (const [w, col] of [[3.2, 'rgba(0,0,0,0.7)'], [1.4, rgba(gold, 0.5)]]) {
    g.strokeStyle = col;
    g.lineWidth = w * s;
    g.beginPath();
    for (const [a, b] of strands) { g.moveTo(...a); g.lineTo(...b); }
    g.stroke();
  }

  // Top tape (off-white with a gold edge) and a thinner bottom tape
  const band = (a, b, wa, wb, fill) => {
    g.beginPath();
    g.moveTo(a[0], a[1] - wa / 2); g.lineTo(b[0], b[1] - wb / 2);
    g.lineTo(b[0], b[1] + wb / 2); g.lineTo(a[0], a[1] + wa / 2);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = rgba(gold, 0.6);
    g.lineWidth = 2 * s;
    g.stroke();
  };
  band(n.farTop, n.nearTop, 10 * s, 26 * s, '#D8D1C0');
  band(n.farBot, n.nearBot, 5 * s, 14 * s, '#8F897C');

  // Fade: full strength at the left edge, gone by the far end of the net
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createLinearGradient(0, 0, n.farTop[0] - r.x, 0);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.3, 'rgba(0,0,0,0.9)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, c.width, c.height);

  ctx.save();
  ctx.globalAlpha = 0.85;
  if ('filter' in ctx) ctx.filter = `blur(${(1.2 * s).toFixed(1)}px)`;
  ctx.drawImage(c, r.x, r.y);
  ctx.restore();
}

// Blazing comet trail into the ball, with fading after-images.
function trail(ctx, a, b, R, s, gold) {
  const [dx, dy] = norm2(b[0] - a[0], b[1] - a[1]), nx = -dy, ny = dx;
  ctx.save();
  for (const [w, col, al] of [[1.05, gold, 0.55], [0.6, '#FFF6DC', 0.75]]) {
    const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
    g.addColorStop(0, rgba(col, 0));
    g.addColorStop(0.55, rgba(col, al * 0.6));
    g.addColorStop(1, rgba(col, al));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(a[0] + nx * R * 0.08, a[1] + ny * R * 0.08);
    ctx.lineTo(b[0] + nx * R * w, b[1] + ny * R * w);
    ctx.lineTo(b[0] - nx * R * w, b[1] - ny * R * w);
    ctx.lineTo(a[0] - nx * R * 0.08, a[1] - ny * R * 0.08);
    ctx.closePath();
    ctx.fill();
  }
  // speed lines alongside the trail
  ctx.strokeStyle = rgba(gold, 0.7);
  ctx.lineCap = 'round';
  for (const [o, t0, w] of [[1.35, 0.35, 3], [-1.3, 0.45, 3], [1.8, 0.55, 2], [-1.75, 0.6, 2]]) {
    ctx.lineWidth = w * s;
    ctx.beginPath();
    const sx = a[0] + (b[0] - a[0]) * t0, sy = a[1] + (b[1] - a[1]) * t0;
    ctx.moveTo(sx + nx * R * o * t0, sy + ny * R * o * t0);
    ctx.lineTo(b[0] - dx * R * 1.3 + nx * R * o, b[1] - dy * R * 1.3 + ny * R * o);
    ctx.stroke();
  }
  // after-images of the ball along its path
  for (const [t, al] of [[0.35, 0.12], [0.55, 0.2], [0.72, 0.3]]) {
    ctx.fillStyle = `rgba(255,246,220,${al})`;
    ctx.beginPath();
    ctx.arc(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, R * (0.45 + 0.5 * t), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- The volleyball ----------
// Rendered pixel by pixel as a lit 3D sphere. Real volleyball layout: six sections of three
// strips, one section per cube face, with strip directions alternating between faces.
// The middle strip of each section is tinted (green / gold / cream).

function ball(ctx, cx, cy, R, s, colors) {
  const D = Math.ceil(R * 2) + 4;
  const c = document.createElement('canvas');
  c.width = c.height = D;
  const g = c.getContext('2d');
  const img = g.createImageData(D, D);
  shadeBall(img, D, R, colors);
  g.putImageData(img, 0, 0);

  const glow = ctx.createRadialGradient(cx, cy, R, cx, cy, R * 1.6);
  glow.addColorStop(0, rgba(colors.accent, 0.7));
  glow.addColorStop(1, rgba(colors.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(cx - R * 1.6, cy - R * 1.6, R * 3.2, R * 3.2);
  ctx.beginPath();
  ctx.arc(cx, cy, R + 5 * s, 0, TAU);
  ctx.fillStyle = '#0D0D0D';
  ctx.fill();
  ctx.drawImage(c, cx - D / 2, cy - D / 2);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, TAU);
  ctx.strokeStyle = rgba(colors.accent, 0.95);
  ctx.lineWidth = 3 * s;
  ctx.stroke();
}

function shadeBall(img, D, R, colors) {
  const data = img.data;
  const cream = [246, 240, 225], seam = [42, 36, 22];
  const tint = [hexRGB(colors.primary), hexRGB(colors.accent), [228, 220, 198]];
  const M = mul(mul(rotZ(0.35), rotX(0.5)), rotY(0.75));   // a pose that shows all three colours
  const [Lx, Ly, Lz] = norm(-0.45, 0.55, 0.7);              // light from the top left
  const [Hx, Hy, Hz] = norm(Lx, Ly, Lz + 1);                 // highlight direction
  const W = 0.05;                                             // seam half-width, cube-face units
  const half = D / 2;

  for (let py = 0; py < D; py++) {
    for (let px = 0; px < D; px++) {
      const i = (py * D + px) * 4;
      const u = (px + 0.5 - half) / R, v = -(py + 0.5 - half) / R;
      const d2 = u * u + v * v;
      const edge = clamp01((1 - Math.sqrt(d2)) * R + 0.5);
      if (edge <= 0) { data[i + 3] = 0; continue; }
      const z = Math.sqrt(Math.max(0, 1 - d2));
      // camera -> ball space (transpose of M)
      const bx = M[0] * u + M[3] * v + M[6] * z;
      const by = M[1] * u + M[4] * v + M[7] * z;
      const bz = M[2] * u + M[5] * v + M[8] * z;
      const ax = Math.abs(bx), ay = Math.abs(by), az = Math.abs(bz);
      let face, m, q, second;
      if (ax >= ay && ax >= az) { face = 0; m = ax; q = by / ax; second = Math.max(ay, az); }
      else if (ay >= az) { face = 1; m = ay; q = bz / ay; second = Math.max(ax, az); }
      else { face = 2; m = az; q = bx / az; second = Math.max(ax, ay); }
      const sd = Math.min(1 - second / m, Math.abs(Math.abs(q) - 1 / 3));   // to nearest seam
      const seamMix = clamp01((W - sd) * R * 0.9 + 0.5);
      const base = Math.abs(q) < 1 / 3 ? tint[face] : cream;
      const diff = Math.max(0, u * Lx + v * Ly + z * Lz);
      const spec = Math.pow(Math.max(0, u * Hx + v * Hy + z * Hz), 48) * 0.55;
      const shade = (0.32 + 0.78 * diff) * (0.78 + 0.22 * z);
      for (let c = 0; c < 3; c++) {
        const col = base[c] * (1 - seamMix) + seam[c] * seamMix;
        data[i + c] = Math.min(255, col * shade + spec * 255);
      }
      data[i + 3] = edge * 255;
    }
  }
}

const rotX = (a) => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
const rotY = (a) => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
const rotZ = (a) => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
const norm = (x, y, z) => { const n = Math.hypot(x, y, z); return [x / n, y / n, z / n]; };
const norm2 = (x, y) => { const n = Math.hypot(x, y) || 1; return [x / n, y / n]; };
function mul(A, B) {
  const C = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  }
  return C;
}

// ---------- Effects ----------

// White-hot burst right behind the ball.
function core(ctx, cx, cy, R) {
  const g = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 2.4);
  g.addColorStop(0, 'rgba(255,250,235,0.95)');
  g.addColorStop(0.35, 'rgba(255,230,160,0.55)');
  g.addColorStop(1, 'rgba(255,230,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - R * 2.4, cy - R * 2.4, R * 4.8, R * 4.8);
}

// Radial zoom lines bursting out from the impact.
function zoomLines(ctx, cx, cy, R, r, s, gold) {
  const rand = mulberry32(13), far = Math.hypot(r.w, r.h);
  ctx.save();
  for (let i = 0; i < 64; i++) {
    const a = rand() * TAU, w = 0.003 + rand() * 0.011;
    const r0 = R * (1.4 + rand() * 1.2);
    ctx.fillStyle = i % 4 ? rgba(gold, 0.5) : 'rgba(255,248,230,0.55)';
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a - w) * far, cy + Math.sin(a - w) * far);
    ctx.lineTo(cx + Math.cos(a + w) * far, cy + Math.sin(a + w) * far);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Two angular (octagon) shockwaves rippling out.
function shockwaves(ctx, cx, cy, R, s, gold) {
  ctx.save();
  for (const [k, a, w] of [[2.3, 0.75, 7], [3.5, 0.4, 4]]) {
    ctx.strokeStyle = rgba(gold, a);
    ctx.lineWidth = w * s;
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const ang = i * TAU / 8 + Math.PI / 8;
      const x = cx + Math.cos(ang) * R * k, y = cy + Math.sin(ang) * R * k;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Diagonal green bands.
function stripes(ctx, r, s, green) {
  const w = 70 * s, slope = 0.45;
  ctx.save();
  ctx.fillStyle = rgba(green, 0.28);
  for (let x = r.x - r.h * slope - w * 2; x < r.x + r.w + w * 2; x += w * 2) {
    ctx.beginPath();
    ctx.moveTo(x, r.y + r.h);
    ctx.lineTo(x + w, r.y + r.h);
    ctx.lineTo(x + w + r.h * slope, r.y);
    ctx.lineTo(x + r.h * slope, r.y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Narrow, sharp gold beams from the centre.
function beams(ctx, cx, cy, len, gold) {
  const n = 10;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.2);
  for (let i = 0; i < n; i++) {
    const a = i * TAU / n + (i % 2 ? 0.12 : -0.05);
    const wid = i % 3 === 0 ? 0.09 : 0.045;
    const g = ctx.createLinearGradient(0, 0, Math.cos(a) * len * 0.55, Math.sin(a) * len * 0.55);
    g.addColorStop(0, rgba(gold, 0.55));
    g.addColorStop(1, rgba(gold, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a - wid) * len, Math.sin(a - wid) * len);
    ctx.lineTo(Math.cos(a + wid) * len, Math.sin(a + wid) * len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Comic-style halftone dots fading in from two corners.
function halftone(ctx, r, s, gold) {
  const step = 16 * s;
  ctx.save();
  ctx.fillStyle = rgba(gold, 0.35);
  for (const [ox, oy] of [[r.x, r.y], [r.x + r.w, r.y + r.h]]) {
    const reach = Math.min(r.w, r.h) * 0.55;
    for (let y = r.y; y <= r.y + r.h; y += step) {
      for (let x = r.x + ((y / step) % 2 ? step / 2 : 0); x <= r.x + r.w; x += step) {
        const f = 1 - Math.hypot(x - ox, y - oy) / reach;
        if (f <= 0) continue;
        ctx.beginPath();
        ctx.arc(x, y, f * step * 0.42, 0, TAU);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

// Bold parallelogram slashes cutting across the frame.
function slashes(ctx, r, s, gold, green) {
  const defs = [
    [0.02, 0.24, 34, gold, 0.85], [0.55, 0.66, 18, green, 1], [0.70, 0.12, 12, gold, 0.6],
    [-0.05, 0.80, 24, green, 0.9], [0.62, 0.92, 8, gold, 0.7],
  ];
  ctx.save();
  for (const [xx, yy, th, col, a] of defs) {
    const x = r.x + xx * r.w, y = r.y + yy * r.h;
    const len = r.w * 0.45, rise = len * 0.38, w = th * s;
    ctx.fillStyle = rgba(col, a);
    ctx.beginPath();
    ctx.moveTo(x, y + rise);
    ctx.lineTo(x + len, y);
    ctx.lineTo(x + len + w * 1.6, y);
    ctx.lineTo(x + w * 1.6, y + rise);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// A few big dark shards flying past the camera, partly out of frame and softly blurred.
function foregroundShards(ctx, r, s, gold) {
  const defs = [
    [0.04, 0.12, 0.13, 0.6], [0.95, 0.2, 0.11, 2.4], [0.9, 0.9, 0.15, 4.0], [0.08, 0.92, 0.1, 5.2],
  ];
  ctx.save();
  if ('filter' in ctx) ctx.filter = `blur(${Math.round(3 * s)}px)`;
  for (const [fx, fy, size, rot] of defs) {
    const x = r.x + fx * r.w, y = r.y + fy * r.h, z = size * Math.min(r.w, r.h) * 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(z * 0.6, 0);
    ctx.lineTo(-z * 0.35, z * 0.42);
    ctx.lineTo(-z * 0.5, -z * 0.1);
    ctx.lineTo(-z * 0.1, -z * 0.45);
    ctx.closePath();
    const g = ctx.createLinearGradient(-z * 0.5, -z * 0.5, z * 0.5, z * 0.5);
    g.addColorStop(0, '#1E3A22');
    g.addColorStop(1, '#070D08');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 4 * s;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// Gold diamond sparks scattered outward.
function sparks(ctx, r, cx, cy, s, gold) {
  const rand = mulberry32(5);
  ctx.save();
  for (let i = 0; i < 46; i++) {
    const x = r.x + rand() * r.w, y = r.y + rand() * r.h;
    const size = (3 + rand() * 7) * s;
    const a = Math.atan2(y - cy, x - cx) + Math.PI / 2;   // point away from the impact
    ctx.fillStyle = rgba(gold, 0.45 + rand() * 0.55);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, -size * 2);
    ctx.lineTo(size * 0.45, 0);
    ctx.lineTo(0, size * 0.6);
    ctx.lineTo(-size * 0.45, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// Fine speckle texture for a gritty poster finish.
function grit(ctx, r) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const rand = mulberry32(3);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.35)';
    g.fillRect(rand() * 256, rand() * 256, 1 + rand() * 1.5, 1 + rand() * 1.5);
  }
  ctx.save();
  ctx.fillStyle = ctx.createPattern(c, 'repeat');
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexRGB(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgba(hex, a) {
  const [r, g, b] = hexRGB(hex);
  return `rgba(${r},${g},${b},${a})`;
}
