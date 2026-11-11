'use strict';
// Vector art for ships, creatures, the lighthouse and icons. All drawn in world units.

const ART = {};

ART.symbol = function (ctx, sym, x, y, r, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color; ctx.strokeStyle = color;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (sym === 'anchor') {
    ctx.lineWidth = r * 0.22;
    ctx.beginPath(); ctx.arc(0, -r * 0.62, r * 0.2, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -r * 0.42); ctx.lineTo(0, r * 0.75); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.18); ctx.lineTo(r * 0.4, -r * 0.18); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, r * 0.12, r * 0.66, 0.35, Math.PI - 0.35); ctx.stroke();
  } else if (sym === 'bell') {
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, r * 0.45);
    ctx.quadraticCurveTo(-r * 0.55, r * 0.3, -r * 0.5, -r * 0.1);
    ctx.quadraticCurveTo(-r * 0.45, -r * 0.75, 0, -r * 0.78);
    ctx.quadraticCurveTo(r * 0.45, -r * 0.75, r * 0.5, -r * 0.1);
    ctx.quadraticCurveTo(r * 0.55, r * 0.3, r * 0.7, r * 0.45);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(0, r * 0.6, r * 0.17, 0, TAU); ctx.fill();
  } else if (sym === 'star') {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.38 : r * 0.85;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
};

function hullPath(ctx, len, beam) {
  const L = len / 2, B = beam / 2;
  ctx.beginPath();
  ctx.moveTo(L, 0);
  ctx.bezierCurveTo(L * 0.7, -B * 0.95, L * 0.1, -B * 1.02, -L * 0.35, -B);
  ctx.quadraticCurveTo(-L * 0.95, -B * 0.95, -L, -B * 0.55);
  ctx.lineTo(-L, B * 0.55);
  ctx.quadraticCurveTo(-L * 0.95, B * 0.95, -L * 0.35, B);
  ctx.bezierCurveTo(L * 0.1, B * 1.02, L * 0.7, B * 0.95, L, 0);
  ctx.closePath();
}

const MASTS = {
  skiff: [0.05], cog: [0.02], trawler: [0.12], packet: [0.22, -0.18], galleon: [0.3, 0.0, -0.28], royal: [0.22, -0.2],
};

// Ship seen from above. pen: pennant color (destination dock).
ART.ship = function (ctx, s, opts = {}) {
  const T = s.T, len = T.len, beam = T.beam;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.ang);
  // shadow on the water
  ctx.globalAlpha = (opts.alpha != null ? opts.alpha : 1) * 0.35;
  ctx.fillStyle = '#01070c';
  ctx.save(); ctx.translate(2.5, 3.5); hullPath(ctx, len * 1.02, beam * 1.05); ctx.fill(); ctx.restore();
  ctx.globalAlpha = opts.alpha != null ? opts.alpha : 1;
  // hull
  const dmg = 1 - s.hull / s.maxHull;
  ctx.fillStyle = opts.ghost ? 'rgba(120,230,220,0.35)' : T.hullC;
  hullPath(ctx, len, beam); ctx.fill();
  ctx.lineWidth = 1.1; ctx.strokeStyle = opts.ghost ? 'rgba(170,255,240,0.7)' : 'rgba(20,10,4,0.85)'; ctx.stroke();
  // deck
  if (!opts.ghost) {
    ctx.fillStyle = '#a57c50';
    ctx.save(); ctx.scale(0.82, 0.7); hullPath(ctx, len, beam); ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(70,44,22,0.45)'; ctx.lineWidth = 0.6;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(-len * 0.38, k * beam * 0.12); ctx.lineTo(len * 0.32, k * beam * 0.12); ctx.stroke(); }
    if (dmg > 0.3) { // scorch and holes
      ctx.fillStyle = 'rgba(20,12,8,' + (dmg * 0.6) + ')';
      ctx.beginPath(); ctx.arc(-len * 0.1, beam * 0.1, beam * 0.28 * dmg + 1, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(len * 0.18, -beam * 0.15, beam * 0.2 * dmg, 0, TAU); ctx.fill();
    }
    if (s.type === 'trawler') { // barrels and a crane
      ctx.fillStyle = '#3d3326';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-len * 0.28 + i * 4.2, beam * 0.12 * (i % 2 ? 1 : -1), 2.1, 0, TAU); ctx.fill(); }
    }
    if (s.type === 'royal' || s.type === 'galleon') { // stern castle
      ctx.fillStyle = s.type === 'royal' ? '#7e2b38' : '#6e4428';
      ctx.fillRect(-len * 0.48, -beam * 0.33, len * 0.18, beam * 0.66);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.strokeRect(-len * 0.48, -beam * 0.33, len * 0.18, beam * 0.66);
    }
  }
  // sails: yards across the hull bellied forward by the wind
  const masts = MASTS[s.type] || [0];
  const sw = beam * (s.type === 'skiff' ? 1.25 : 1.45);
  const sway = Math.sin((opts.time || 0) * 1.3 + s.seed) * 0.06;
  for (let i = 0; i < masts.length; i++) {
    const mx = masts[i] * len;
    const belly = beam * 0.38;
    ctx.save(); ctx.translate(mx, 0); ctx.rotate(sway);
    ctx.fillStyle = opts.ghost ? 'rgba(150,240,230,0.25)' : T.sail;
    ctx.beginPath();
    ctx.moveTo(-1.5, -sw / 2);
    ctx.quadraticCurveTo(belly + 1, 0, -1.5, sw / 2);
    ctx.lineTo(-3.4, sw / 2 - 0.5);
    ctx.quadraticCurveTo(belly * 0.55, 0, -3.4, -sw / 2 + 0.5);
    ctx.closePath(); ctx.fill();
    if (opts.ghost) { // torn edges
      ctx.strokeStyle = 'rgba(180,255,245,0.5)'; ctx.lineWidth = 0.7; ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(60,40,20,0.55)'; ctx.lineWidth = 0.7; ctx.stroke();
      if (s.type === 'royal') { ctx.fillStyle = '#5b1f2a'; ctx.beginPath(); ctx.arc(belly * 0.35, 0, 2.2, 0, TAU); ctx.fill(); }
    }
    // yard and mast top
    ctx.strokeStyle = opts.ghost ? 'rgba(170,255,240,0.6)' : '#3b2614'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-2, -sw / 2 - 1); ctx.lineTo(-2, sw / 2 + 1); ctx.stroke();
    ctx.fillStyle = opts.ghost ? 'rgba(170,255,240,0.7)' : '#2a1a0d';
    ctx.beginPath(); ctx.arc(-2, 0, 1.5, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // pennant streaming aft from the main mast
  if (opts.pennant && !opts.ghost) {
    const mx = masts[0] * len - 2;
    const fl = Math.sin((opts.time || 0) * 9 + s.seed) * 1.6;
    ctx.fillStyle = opts.pennant;
    ctx.beginPath(); ctx.moveTo(mx, -1.2); ctx.quadraticCurveTo(mx - 6, fl - 1, mx - 11, fl); ctx.quadraticCurveTo(mx - 6, fl + 1, mx, 1.2); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
};

// Lighthouse seen from above at a slight tilt: base on the island, lamp at (x, y)
ART.lighthouse = function (ctx, x, y, time, lit) {
  const baseY = y + 34;
  ctx.save();
  // keeper's cottage
  ctx.fillStyle = '#6e5a49'; ctx.fillRect(x - 32, baseY - 6, 18, 14);
  ctx.fillStyle = '#4a2f26'; ctx.beginPath(); ctx.moveTo(x - 34, baseY - 5); ctx.lineTo(x - 23, baseY - 14); ctx.lineTo(x - 12, baseY - 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,200,120,0.85)'; ctx.fillRect(x - 26, baseY - 1, 3, 3);
  // shadow cast by the tower
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(x + 10, baseY + 4, 16, 7, 0.3, 0, TAU); ctx.fill();
  // base
  ctx.fillStyle = '#8a8478'; ctx.beginPath(); ctx.ellipse(x, baseY, 14, 7, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#3a3630'; ctx.lineWidth = 1; ctx.stroke();
  // tower: tapered, banded
  const h = baseY - y;
  const bands = 4;
  for (let i = 0; i < bands; i++) {
    const t0 = i / bands, t1 = (i + 1) / bands;
    const w0 = lerp(10.5, 6.5, t0), w1 = lerp(10.5, 6.5, t1);
    const y0 = baseY - h * t0, y1 = baseY - h * t1;
    ctx.fillStyle = i % 2 ? '#e9e4d8' : '#b5413a';
    ctx.beginPath(); ctx.moveTo(x - w0, y0); ctx.lineTo(x - w1, y1); ctx.lineTo(x + w1, y1); ctx.lineTo(x + w0, y0); ctx.closePath(); ctx.fill();
  }
  // shading on the right side
  const g = ctx.createLinearGradient(x - 10, 0, x + 10, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(x - 10.5, baseY); ctx.lineTo(x - 6.5, y + 2); ctx.lineTo(x + 6.5, y + 2); ctx.lineTo(x + 10.5, baseY); ctx.closePath(); ctx.fill();
  // gallery and lantern room
  ctx.fillStyle = '#2d2a28'; ctx.beginPath(); ctx.ellipse(x, y + 2, 9, 3.6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = lit ? '#fff0c4' : '#6a6455';
  ctx.fillRect(x - 5, y - 6, 10, 8);
  ctx.fillStyle = '#2d2a28';
  ctx.fillRect(x - 5, y - 6, 1.2, 8); ctx.fillRect(x + 3.8, y - 6, 1.2, 8); ctx.fillRect(x - 0.6, y - 6, 1.2, 8);
  ctx.beginPath(); ctx.moveTo(x - 6.5, y - 6); ctx.lineTo(x, y - 12); ctx.lineTo(x + 6.5, y - 6); ctx.closePath(); ctx.fill();
  ctx.restore();
};

// A shade: an eel of dark. trail: array of points from head back
ART.gloom = function (ctx, m, trail, time) {
  if (!trail || trail.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const n = trail.length;
  for (let i = n - 1; i > 0; i--) {
    const k = 1 - i / n;
    ctx.strokeStyle = m.burnT > 0 ? `rgba(${60 + 120 * k | 0},${20 + 30 * k | 0},50,0.95)` : `rgba(${18 + 20 * k | 0},${8 + 8 * k | 0},${30 + 30 * k | 0},0.95)`;
    ctx.lineWidth = 1.5 + k * 6.5;
    ctx.beginPath(); ctx.moveTo(trail[i].x, trail[i].y); ctx.lineTo(trail[i - 1].x, trail[i - 1].y); ctx.stroke();
  }
  // fins
  const h = trail[0], h2 = trail[Math.min(3, n - 1)];
  const a = Math.atan2(h.y - h2.y, h.x - h2.x);
  ctx.fillStyle = 'rgba(40,16,60,0.9)';
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(h.x - Math.cos(a) * 4, h.y - Math.sin(a) * 4);
    ctx.lineTo(h.x - Math.cos(a) * 10 + Math.cos(a + sgn * 1.57) * (6 + Math.sin(time * 8) * 1.5), h.y - Math.sin(a) * 10 + Math.sin(a + sgn * 1.57) * (6 + Math.sin(time * 8) * 1.5));
    ctx.lineTo(h.x - Math.cos(a) * 9, h.y - Math.sin(a) * 9);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
};

ART.gloomEyes = function (ctx, m, trail, time) {
  if (!trail || trail.length < 3) return;
  const h = trail[0], h2 = trail[2];
  const a = Math.atan2(h.y - h2.y, h.x - h2.x);
  const blink = (Math.sin(time * 1.7 + m.id * 3) > 0.97) ? 0.2 : 1;
  ctx.fillStyle = m.burnT > 0 ? '#ffb070' : '#c58bff';
  ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 6;
  for (const sgn of [-1, 1]) {
    const ex = h.x + Math.cos(a) * 1 + Math.cos(a + sgn * 1.57) * 2.4, ey = h.y + Math.sin(a) * 1 + Math.sin(a + sgn * 1.57) * 2.4;
    ctx.beginPath(); ctx.ellipse(ex, ey, 1.6, 1.6 * blink, a, 0, TAU); ctx.fill();
  }
  ctx.shadowBlur = 0;
};

ART.wisp = function (ctx, m, time) {
  const k = m.state === 'rise' ? clamp(m.t / 1.5, 0, 1) : 1;
  const flick = 0.85 + Math.sin(time * 11 + m.ph) * 0.08 + Math.sin(time * 23 + m.ph * 2) * 0.05;
  const hpk = m.hp / m.maxHp;
  const r = (9 + 3 * Math.sin(time * 2 + m.ph)) * k * (0.5 + 0.5 * hpk);
  const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, r * 4);
  g.addColorStop(0, `rgba(210,255,190,${0.9 * flick * k})`);
  g.addColorStop(0.18, `rgba(120,240,140,${0.55 * flick * k})`);
  g.addColorStop(1, 'rgba(40,140,80,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(m.x, m.y, r * 4, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgba(240,255,220,${0.95 * k})`;
  ctx.beginPath(); ctx.arc(m.x, m.y, r * 0.32, 0, TAU); ctx.fill();
};

ART.kraken = function (ctx, m, time) {
  const up = m.state === 'up' ? clamp(m.upT / 1.2, 0, 1) : m.state === 'down' ? clamp(1 - (m.t - m.downAt) / 1.6, 0, 1) : 0;
  if (up <= 0) return;
  ctx.save();
  // churning water
  ctx.fillStyle = 'rgba(10,20,26,0.55)';
  ctx.beginPath(); ctx.arc(m.x, m.y, 26 * up, 0, TAU); ctx.fill();
  ctx.lineCap = 'round';
  const N = 7;
  const recoil = m.hurtT > 0 ? 0.65 : 1;
  for (let i = 0; i < N; i++) {
    const base = m.ph + (i / N) * TAU;
    let len = (38 + 14 * Math.sin(i * 2.3 + m.ph)) * up * recoil;
    let tx, ty;
    const grabbing = m.grab && i < 3;
    if (grabbing) { tx = m.grab.x + Math.cos(base) * 6; ty = m.grab.y + Math.sin(base) * 6; len = dist(m.x, m.y, tx, ty); }
    const a = base + Math.sin(time * 1.6 + i) * 0.35;
    const sx = m.x + Math.cos(base) * 12, sy = m.y + Math.sin(base) * 12;
    const ex = grabbing ? tx : m.x + Math.cos(a) * len, ey = grabbing ? ty : m.y + Math.sin(a) * len;
    const cx = (sx + ex) / 2 + Math.cos(a + 1.6) * 14 * Math.sin(time * 2 + i), cy = (sy + ey) / 2 + Math.sin(a + 1.6) * 14 * Math.sin(time * 2 + i);
    // tapered: draw several strokes
    for (let w = 9; w >= 2; w -= 3.5) {
      ctx.strokeStyle = w > 6 ? '#3a1630' : w > 3 ? '#5c2140' : '#8a3b55';
      ctx.lineWidth = w * up;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx, cy, lerp(sx, ex, w > 6 ? 0.75 : 1), lerp(sy, ey, w > 6 ? 0.75 : 1)); ctx.stroke();
    }
    // suckers
    ctx.fillStyle = 'rgba(230,170,180,0.5)';
    for (let t = 0.25; t < 0.9; t += 0.18) {
      const px = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cx + t * t * ex, py = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cy + t * t * ey;
      ctx.beginPath(); ctx.arc(px, py, 1.1 * up, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
};

ART.wraith = function (ctx, m, time) {
  const s = { T: SHIP_TYPES.galleon, x: m.x, y: m.y, ang: m.ang, hull: 1, maxHull: 1, seed: m.id, type: 'galleon' };
  ctx.save();
  ctx.globalAlpha = 1;
  // spectral glow
  const g = ctx.createRadialGradient(m.x, m.y, 4, m.x, m.y, 70);
  g.addColorStop(0, `rgba(90,230,210,${0.22 * m.vis})`); g.addColorStop(1, 'rgba(40,160,150,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(m.x, m.y, 70, 0, TAU); ctx.fill();
  ART.ship(ctx, s, { ghost: true, alpha: clamp(m.vis, 0.15, 0.95), time });
  // lanterns
  ctx.fillStyle = `rgba(150,255,235,${0.6 + 0.3 * Math.sin(time * 5 + m.id)})`;
  const ca = Math.cos(m.ang), sa = Math.sin(m.ang);
  for (const o of [-18, 20]) { ctx.beginPath(); ctx.arc(m.x + ca * o, m.y + sa * o, 1.8, 0, TAU); ctx.fill(); }
  ctx.restore();
};

ART.leviathan = function (ctx, b, time) {
  if (!b.seg.length || (b.state !== 'up' && b.state !== 'dive' && b.state !== 'dying')) return;
  const sink = b.state === 'dive' ? clamp(b.stateT / 1.4, 0, 1) : b.state === 'dying' ? clamp(b.stateT / 3, 0, 1) : 1;
  ctx.save();
  ctx.globalAlpha = sink;
  const n = b.seg.length;
  for (let i = n - 1; i >= 0; i--) {
    const sg = b.seg[i];
    const k = 1 - i / n;
    const r = 5 + 17 * Math.sin(Math.PI * Math.min(1, 0.35 + k * 0.8));
    ctx.fillStyle = i % 2 ? '#1d2a33' : '#22323c';
    ctx.beginPath(); ctx.arc(sg.x, sg.y, r, 0, TAU); ctx.fill();
    if (i % 3 === 0) { // dorsal spine
      ctx.fillStyle = '#4c6470';
      ctx.beginPath(); ctx.arc(sg.x, sg.y, r * 0.3, 0, TAU); ctx.fill();
    }
  }
  // head
  const a = b.ang;
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a); ctx.scale(1.45, 1.45);
  ctx.fillStyle = b.hurtT > 0 ? '#5b3a3a' : '#26363f';
  ctx.beginPath(); ctx.moveTo(26, 0); ctx.quadraticCurveTo(18, -16, -6, -15); ctx.lineTo(-10, 0); ctx.lineTo(-6, 15); ctx.quadraticCurveTo(18, 16, 26, 0); ctx.fill();
  const jaw = 0.5 + 0.5 * Math.sin(time * 4);
  ctx.strokeStyle = '#0b1115'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(4, -2 - jaw * 3); ctx.moveTo(26, 0); ctx.lineTo(4, 2 + jaw * 3); ctx.stroke();
  ctx.fillStyle = '#e8e2d0';
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(22 - i * 5, -1.5 - jaw * 2); ctx.lineTo(20 - i * 5, 1); ctx.lineTo(18 - i * 5, -1.5 - jaw * 2); ctx.fill(); }
  ctx.restore();
  ctx.restore();
};

ART.leviathanEyes = function (ctx, b, time) {
  if (b.state !== 'up' && b.state !== 'dive') return;
  const sink = b.state === 'dive' ? clamp(b.stateT / 1.4, 0, 1) : 1;
  const a = b.ang;
  ctx.fillStyle = b.hurtT > 0 ? '#fff4c0' : '#ff7a3a';
  ctx.shadowColor = '#ff5a1a'; ctx.shadowBlur = 12;
  ctx.globalAlpha = sink;
  for (const sgn of [-1, 1]) {
    const ex = b.x + Math.cos(a) * 9 + Math.cos(a + sgn * 1.57) * 13, ey = b.y + Math.sin(a) * 9 + Math.sin(a + sgn * 1.57) * 13;
    ctx.beginPath(); ctx.ellipse(ex, ey, 3.4, 2.2, a, 0, TAU); ctx.fill();
  }
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
};

// Small inline SVG icons for the DOM UI
const ICONS = {
  lens: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  reflector: '<path d="M4 6c5 3 5 9 0 12"/><path d="M8 12h12M10 7l9-2M10 17l9 2"/>',
  gears: '<circle cx="9" cy="10" r="3.5"/><path d="M9 3v2.5M9 14.5V17M2 10h2.5M13.5 10H16M4 5l1.8 1.8M12.2 13.2 14 15M4 15l1.8-1.8M12.2 6.8 14 5"/><circle cx="17" cy="17" r="2.5"/>',
  cistern: '<path d="M6 7c0-2 12-2 12 0v10c0 2-12 2-12 0z"/><path d="M6 7c0 2 12 2 12 0M6 12c0 2 12 2 12 0"/>',
  burner: '<path d="M12 3c3 4 5 6 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
  wick: '<path d="M12 21v-6"/><path d="M12 15c-3-2-4-5-1-9 0 2 2 3 3 2 1 3 0 5-2 7z"/><path d="M8 21h8"/>',
  flare: '<path d="M6 18 15 9"/><path d="M15 9l3-3M17 11l3-1M13 7l1-3"/><circle cx="16" cy="8" r="1.5" fill="currentColor"/>',
  horn: '<path d="M4 10v4h3l9 5V5L7 10z"/><path d="M19 9c1 1.5 1 4.5 0 6"/>',
  buoy: '<path d="M8 17h8l-2-8h-4z"/><path d="M12 9V5"/><circle cx="12" cy="4" r="1.3" fill="currentColor"/><path d="M4 20c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 4 0"/>',
  harbor: '<path d="M4 20h16M7 20V10M17 20V10M5 10h14"/><circle cx="7" cy="7" r="1.6" fill="currentColor"/><circle cx="17" cy="7" r="1.6" fill="currentColor"/>',
  charts: '<path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2z"/><path d="M9 4v14M15 6v14"/>',
  twin: '<circle cx="12" cy="12" r="2.5"/><path d="M14 11l7-4v10l-7-4M10 11 3 7v10l7-4"/>',
  star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  lock: '<rect x="6" y="11" width="12" height="9" rx="1.5"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  focus: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="3"/>',
  ship: '<path d="M4 15h16l-3 4H7z"/><path d="M12 4v11M12 5l6 8h-6M11 7l-5 6h5"/>',
  wreck: '<path d="M4 17c3-2 6 2 9 0s6 2 7 0"/><path d="M8 14l6-8M11 6l5 4"/>',
  oil: '<path d="M12 3c3 5 6 8 6 11a6 6 0 0 1-12 0c0-3 3-6 6-11z"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5c0-1.5 5-1.5 5 0s-5 1.5-5 3 5 1.5 5 0"/>',
  book: '<path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z"/><path d="M12 6v14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  chart: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><circle cx="14" cy="11" r="2"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  restart: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4h4"/>',
  sound: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9c1 1.5 1 4.5 0 6M18.5 7c2 3 2 7 0 10"/>',
  moon: '<path d="M16 3a8 8 0 1 0 5 13A9 9 0 0 1 16 3z"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  trophy: '<path d="M8 4h8v6a4 4 0 0 1-8 0z"/><path d="M8 6H5c0 3 1 4 3 4M16 6h3c0 3-1 4-3 4M12 14v4M8 20h8"/>',
};
function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
