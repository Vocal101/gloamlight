'use strict';
// Canvas renderer: cached sea and land layers, a darkness layer with light cut out of it, glow on top.

const LQ = 0.5; // darkness layer resolution relative to the screen

function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mixRgb(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function rgba(c, a) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
function mkCanvas(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' && false ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.light = mkCanvas(4, 4);
    this.lctx = this.light.getContext('2d');
    this.fx = new FX();
    this.beamCache = new Map();
    this.trails = new Map();
    this.mtrails = new Map();
    this.time = 0;
    this.quality = 1;
    this.w = 1; this.h = 1; this.dpr = 1; this.s = 1; this.ox = 0; this.oy = 0;
    this.rain = [];
    this.glints = [];
    this.streaks = [];
    this.bolts = [];
    this.soft = this.makeSoft();
    this.fogSprite = this.makeFogSprite();
    this.wavePat = null;
    this.reduceFlash = false;
    const r = new RNG(7);
    for (let i = 0; i < 220; i++) this.glints.push({ x: r.range(0, WORLD_W), y: r.range(0, WORLD_H), ph: r.range(0, TAU), sp: r.range(0.6, 1.6), len: r.range(2, 5) });
    for (let i = 0; i < 260; i++) this.rain.push({ x: r.range(0, 1), y: r.range(0, 1), sp: r.range(0.8, 1.2), len: r.range(0.6, 1.2) });
  }

  resize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = Math.max(1, w); this.h = Math.max(1, h); this.dpr = dpr;
    this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.h * dpr);
    this.cv.style.width = this.w + 'px'; this.cv.style.height = this.h + 'px';
    this.s = Math.min(this.w / WORLD_W, this.h / WORLD_H);
    this.ox = (this.w - WORLD_W * this.s) / 2; this.oy = (this.h - WORLD_H * this.s) / 2;
    this.light.width = Math.max(1, Math.ceil(this.cv.width * LQ)); this.light.height = Math.max(1, Math.ceil(this.cv.height * LQ));
    this.beamCache.clear();
    this.stat = null;
    this.vignette = null;
  }

  toWorld(px, py) { return [(px - this.ox) / this.s, (py - this.oy) / this.s]; }
  toScreen(x, y) { return [x * this.s + this.ox, y * this.s + this.oy]; }

  setNight(n) {
    this.n = n; this.stat = null; this.trails.clear(); this.mtrails.clear(); this.fx.clear(); this.bolts = [];
    this.fade = 1;
    this.streaks = [];
    const r = new RNG(3);
    if (n && n.map.currents.length) for (let i = 0; i < 70 * n.map.currents.length; i++) this.streaks.push({ c: i % n.map.currents.length, t: r.next(), off: r.range(-1, 1), sp: r.range(0.7, 1.3), life: r.next() });
  }

  // ---------- cached sprites
  makeSoft() {
    const c = mkCanvas(64, 64), x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return c;
  }
  makeFogSprite() {
    const S = 128, c = mkCanvas(S, S), x = c.getContext('2d');
    const img = x.createImageData(S, S), nz = new Noise2(42);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const dx = (i - S / 2) / (S / 2), dy = (j - S / 2) / (S / 2);
      const d = Math.sqrt(dx * dx + dy * dy);
      const n = nz.fbm(i * 0.05, j * 0.05, 4);
      const a = clamp((1 - d) * 1.4, 0, 1) * clamp(n * 1.6 - 0.25, 0, 1);
      const k = (j * S + i) * 4;
      img.data[k] = 205; img.data[k + 1] = 215; img.data[k + 2] = 225; img.data[k + 3] = a * 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  makeWavePattern(ctx) {
    const S = 192, c = mkCanvas(S, S), x = c.getContext('2d');
    const img = x.createImageData(S, S);
    const comps = [[1, 3, 0.3], [2, 5, 1.7], [-1, 4, 4.1], [1, 6, 2.2], [0, 7, 5.3], [3, 4, 0.9]];
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      let v = 0;
      for (const [a, b, p] of comps) v += Math.sin((TAU * (i * a + j * b)) / S + p);
      v /= comps.length;
      const crest = smooth(0.42, 0.62, v) * (1 - smooth(0.62, 0.9, v) * 0.6);
      const k = (j * S + i) * 4;
      img.data[k] = 190; img.data[k + 1] = 225; img.data[k + 2] = 235; img.data[k + 3] = crest * 255;
    }
    x.putImageData(img, 0, 0);
    return ctx.createPattern(c, 'repeat');
  }

  beamSprite(range, half, q) {
    const key = Math.round(range) + '|' + half.toFixed(3) + '|' + q.toFixed(3);
    let e = this.beamCache.get(key);
    if (e) return e;
    if (this.beamCache.size > 60) this.beamCache.clear();
    const hw = 10 + range * Math.tan(half) + 2;
    const make = color => {
      const c = mkCanvas((range + 2) * q, hw * 2 * q);
      const x = c.getContext('2d');
      x.scale(q, q); x.translate(0, hw);
      const N = 7;
      for (let i = 0; i < N; i++) {
        const wf = lerp(0.5, 1, i / (N - 1));
        const g = x.createRadialGradient(0, 0, 0, 0, 0, range);
        g.addColorStop(0, `rgba(${color},${1 / N})`);
        g.addColorStop(0.5, `rgba(${color},${0.875 / N})`);
        g.addColorStop(0.8, `rgba(${color},${0.62 / N})`);
        g.addColorStop(0.92, `rgba(${color},${0.25 / N})`);
        g.addColorStop(1, `rgba(${color},0)`);
        x.fillStyle = g;
        const wR = (10 + range * Math.tan(half)) * wf;
        x.beginPath(); x.moveTo(0, -10 * wf); x.lineTo(range * 1.02, -wR * 1.02); x.lineTo(range * 1.02, wR * 1.02); x.lineTo(0, 10 * wf); x.closePath(); x.fill();
      }
      return c;
    };
    e = { mask: make('255,255,255'), glow: make('255,214,150'), hw };
    this.beamCache.set(key, e);
    return e;
  }

  // ---------- static layers (sea depth + land), rebuilt per night and on resize
  buildStatic() {
    const n = this.n, map = n.map, P = map.region.palette;
    const pw = WORLD_W * this.s * this.dpr, ph = WORLD_H * this.s * this.dpr;
    const q = this.s * this.dpr;
    const sea = mkCanvas(pw, ph), land = mkCanvas(pw, ph);
    // --- sea depth at grid resolution, upscaled
    const g = mkCanvas(GW, GH), gx = g.getContext('2d');
    const img = gx.createImageData(GW, GH);
    const deep = hexRgb(P.deep), mid = hexRgb(P.sea), shal = hexRgb(P.shallow), sand = hexRgb(P.sand);
    const nz = new Noise2(map.region.seed + 5);
    for (let i = 0; i < GW * GH; i++) {
      const x = i % GW, y = (i / GW) | 0;
      const dl = map.distLand[i], dr = map.dist[i];
      let c;
      if (map.land[i]) c = sand;
      else {
        const t1 = smooth(0, 70, dl), t2 = smooth(70, 260, dl);
        c = mixRgb(mixRgb(shal, mid, t1), deep, t2);
        const reefT = 1 - smooth(0, 34, dr);
        if (map.grid[i] === T_REEF || (reefT > 0 && dl > dr)) c = mixRgb(c, shal, reefT * 0.8);
        if (dl < 9) c = mixRgb(c, sand, (1 - dl / 9) * 0.45);
      }
      const nv = (nz.fbm(x * 0.05, y * 0.05, 3) - 0.5) * 0.18;
      const k = i * 4;
      img.data[k] = clamp(c[0] * (1 + nv), 0, 255); img.data[k + 1] = clamp(c[1] * (1 + nv), 0, 255); img.data[k + 2] = clamp(c[2] * (1 + nv), 0, 255); img.data[k + 3] = 255;
    }
    gx.putImageData(img, 0, 0);
    const sx = sea.getContext('2d');
    sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = 'high';
    sx.drawImage(g, 0, 0, pw, ph);
    // --- land
    const lx = land.getContext('2d');
    lx.setTransform(q, 0, 0, q, 0, 0);
    const polyPath = () => { lx.beginPath(); for (const p of map.polys) { p.pts.forEach((pt, i) => (i ? lx.lineTo(pt[0], pt[1]) : lx.moveTo(pt[0], pt[1]))); lx.closePath(); } };
    // wet sand fringe
    polyPath(); lx.strokeStyle = rgba(mixRgb(sand, shal, 0.5), 0.55); lx.lineWidth = 9; lx.lineJoin = 'round'; lx.stroke();
    polyPath(); lx.strokeStyle = rgba(sand, 0.9); lx.lineWidth = 3; lx.stroke();
    // inland texture at grid resolution
    const water = new Uint8Array(GW * GH);
    for (let i = 0; i < water.length; i++) water[i] = map.land[i] ? 0 : 1;
    const inland = chamfer(water, v => v === 1);
    const t = mkCanvas(GW, GH), tx = t.getContext('2d'), timg = tx.createImageData(GW, GH);
    const grass = hexRgb(P.grass), grass2 = hexRgb(P.grass2), rock = hexRgb(P.rock);
    for (let i = 0; i < GW * GH; i++) {
      const x = i % GW, y = (i / GW) | 0;
      const d = inland[i];
      const nv = nz.fbm(x * 0.09 + 30, y * 0.09, 4);
      let c = mixRgb(grass, grass2, smooth(0.35, 0.7, nv));
      c = mixRgb(sand, c, smooth(5, 13, d));
      const rk = nz.fbm(x * 0.14 + 90, y * 0.14 + 40, 3);
      if (rk > 0.62 && d > 3 && d < 40) c = mixRgb(c, rock, smooth(0.62, 0.72, rk) * 0.85);
      const shade = 1 + (nz.fbm(x * 0.2 + 7, y * 0.2 + 3, 2) - 0.5) * 0.25;
      const k = i * 4;
      timg.data[k] = clamp(c[0] * shade, 0, 255); timg.data[k + 1] = clamp(c[1] * shade, 0, 255); timg.data[k + 2] = clamp(c[2] * shade, 0, 255); timg.data[k + 3] = 255;
    }
    tx.putImageData(timg, 0, 0);
    lx.save(); polyPath(); lx.clip();
    lx.imageSmoothingEnabled = true; lx.imageSmoothingQuality = 'high';
    lx.drawImage(t, 0, 0, WORLD_W, WORLD_H);
    // cliff shadow along the shore
    polyPath(); lx.strokeStyle = 'rgba(20,16,10,0.28)'; lx.lineWidth = 5; lx.stroke();
    lx.restore();
    // decorations
    const rng = new RNG(map.region.seed * 3 + 11);
    const docks = map.activeDocks.map(k => map.docks[k]);
    this.houses = [];
    for (const d of docks) {
      const ia = d.ang + Math.PI; // inland direction
      for (let i = 0; i < (map.region.id === 'crown' ? 4 : 9); i++) {
        const along = rng.range(-70, 70), depth = rng.range(14, 70);
        const hx = d.shore.x + Math.cos(ia) * depth + Math.cos(ia + Math.PI / 2) * along, hy = d.shore.y + Math.sin(ia) * depth + Math.sin(ia + Math.PI / 2) * along;
        const ci = cellOf(hx, hy);
        if (!map.land[ci] || inland[ci] < 9) continue;
        if (this.houses.some(h => dist(h.x, h.y, hx, hy) < 13)) continue;
        this.houses.push({ x: hx, y: hy, a: ia + rng.range(-0.3, 0.3), w: rng.range(8, 12), h: rng.range(6, 8), win: rng.chance(0.7), ph: rng.range(0, TAU) });
      }
    }
    const L = map.lighthouse;
    // trees
    for (let i = 0; i < 900; i++) {
      const x = rng.range(0, WORLD_W), y = rng.range(0, WORLD_H);
      const ci = cellOf(x, y);
      if (!map.land[ci] || inland[ci] < 16) continue;
      if (dist(x, y, L.x, L.y) < 70) continue;
      if (this.houses.some(h => dist(h.x, h.y, x, y) < 16)) continue;
      if (nz.fbm(x * 0.012, y * 0.012, 3) < 0.45) continue;
      const r = rng.range(3.2, 6);
      lx.fillStyle = 'rgba(8,14,8,0.22)'; lx.beginPath(); lx.arc(x + 1.5, y + 2, r, 0, TAU); lx.fill();
      lx.fillStyle = rgba(mixRgb(grass, [22, 44, 22], 0.4), 1); lx.beginPath(); lx.arc(x, y, r, 0, TAU); lx.fill();
      lx.fillStyle = rgba(mixRgb(grass2, [200, 220, 160], 0.22), 0.85); lx.beginPath(); lx.arc(x - r * 0.3, y - r * 0.35, r * 0.5, 0, TAU); lx.fill();
    }
    // houses
    const roof = hexRgb(P.roof);
    for (const hs of this.houses) {
      lx.save(); lx.translate(hs.x, hs.y); lx.rotate(hs.a);
      lx.fillStyle = 'rgba(0,0,0,0.3)'; lx.fillRect(-hs.w / 2 + 1.5, -hs.h / 2 + 2, hs.w, hs.h);
      lx.fillStyle = rgba(roof, 1); lx.fillRect(-hs.w / 2, -hs.h / 2, hs.w, hs.h);
      lx.fillStyle = rgba(mixRgb(roof, [0, 0, 0], 0.35), 1); lx.fillRect(-hs.w / 2, 0, hs.w, hs.h / 2);
      lx.strokeStyle = 'rgba(0,0,0,0.35)'; lx.lineWidth = 0.6; lx.strokeRect(-hs.w / 2, -hs.h / 2, hs.w, hs.h);
      lx.restore();
    }
    // reefs
    for (const r of map.reefs) this.drawRock(lx, r, rock);
    // crown ruins
    if (map.region.id === 'crown') {
      for (const c of map.clusters.slice(0, 5)) {
        lx.fillStyle = '#55596a'; lx.strokeStyle = '#2a2c36'; lx.lineWidth = 1.2;
        lx.beginPath(); lx.arc(c.x + 6, c.y - 4, 7, 0, TAU); lx.fill(); lx.stroke();
        lx.fillStyle = '#2a2c36'; lx.beginPath(); lx.arc(c.x + 6, c.y - 4, 3.5, 0, TAU); lx.fill();
      }
    }
    // piers
    for (const d of map.docks) {
      const active = map.activeDocks.includes(d.i);
      const ca = Math.cos(d.ang), sa = Math.sin(d.ang);
      const len = 26;
      lx.save(); lx.translate(d.shore.x - ca * 6, d.shore.y - sa * 6); lx.rotate(d.ang);
      lx.fillStyle = 'rgba(0,0,0,0.35)'; lx.fillRect(2, -3, len + 2, 9);
      lx.fillStyle = active ? '#8a6640' : '#5e4a36'; lx.fillRect(0, -4.5, len, 9);
      lx.strokeStyle = 'rgba(40,25,12,0.7)'; lx.lineWidth = 0.6;
      for (let k = 3; k < len; k += 3) { lx.beginPath(); lx.moveTo(k, -4.5); lx.lineTo(k, 4.5); lx.stroke(); }
      lx.fillStyle = '#3d2a18';
      for (const k of [2, len - 2]) { lx.beginPath(); lx.arc(k, -5, 1.4, 0, TAU); lx.arc(k, 5, 1.4, 0, TAU); lx.fill(); }
      lx.restore();
    }
    this.stat = { sea, land };
  }

  drawRock(lx, r, rock) {
    const rr = new RNG(r.seed);
    const N = 9, pts = [];
    for (let i = 0; i < N; i++) { const a = (i / N) * TAU + rr.range(-0.2, 0.2); const k = r.r * rr.range(0.75, 1.1); pts.push([r.x + Math.cos(a) * k, r.y + Math.sin(a) * k]); }
    const path = () => { lx.beginPath(); pts.forEach((p, i) => (i ? lx.lineTo(p[0], p[1]) : lx.moveTo(p[0], p[1]))); lx.closePath(); };
    lx.fillStyle = 'rgba(0,0,0,0.35)'; lx.save(); lx.translate(2, 2.5); path(); lx.fill(); lx.restore();
    const g = lx.createLinearGradient(r.x - r.r, r.y - r.r, r.x + r.r, r.y + r.r);
    g.addColorStop(0, rgba(mixRgb(rock, [230, 230, 220], 0.35), 1)); g.addColorStop(1, rgba(mixRgb(rock, [0, 0, 0], 0.5), 1));
    lx.fillStyle = g; path(); lx.fill();
    lx.strokeStyle = 'rgba(15,15,18,0.7)'; lx.lineWidth = 1; lx.stroke();
    lx.fillStyle = 'rgba(230,225,200,0.35)';
    for (let i = 0; i < 4; i++) { lx.beginPath(); lx.arc(r.x + rr.range(-r.r, r.r) * 0.5, r.y + rr.range(-r.r, r.r) * 0.5, rr.range(0.6, 1.4), 0, TAU); lx.fill(); }
  }

  // ---------- main draw
  draw(n, dt, view) {
    const ctx = this.ctx;
    this.time += dt;
    const time = this.time;
    this.fx.update(dt);
    if (!n) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#050b12'; ctx.fillRect(0, 0, this.cv.width, this.cv.height); return; }
    if (n !== this.n) this.setNight(n);
    if (!this.stat) this.buildStatic();
    if (!this.wavePat) this.wavePat = this.makeWavePattern(ctx);
    const map = n.map, P = map.region.palette, dpr = this.dpr;
    const shake = view.shake === false ? 0 : this.fx.shake;
    const shx = shake ? (Math.random() - 0.5) * shake * 9 : 0, shy = shake ? (Math.random() - 0.5) * shake * 9 : 0;
    const q = this.s * dpr;
    const worldT = () => ctx.setTransform(q, 0, 0, q, (this.ox + shx) * dpr, (this.oy + shy) * dpr);
    // background beyond the chart
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = P.deep; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    worldT();
    ctx.drawImage(this.stat.sea, 0, 0, WORLD_W, WORLD_H);
    // waves
    ctx.save();
    ctx.beginPath(); ctx.rect(-200, -200, WORLD_W + 400, WORLD_H + 400); ctx.clip();
    ctx.fillStyle = this.wavePat;
    const wo = (time * 5) % 576, wo2 = (time * 3.2) % 384;
    ctx.save(); ctx.scale(3, 1); ctx.translate(wo / 3, 0); ctx.globalAlpha = 0.09;
    ctx.fillRect(-wo / 3 - 100, -200, WORLD_W / 3 + 200, WORLD_H + 400); ctx.restore();
    ctx.save(); ctx.scale(2, 1.3); ctx.translate(-wo2 / 2, wo2 / 4); ctx.globalAlpha = 0.06;
    ctx.fillRect(wo2 / 2 - 100, -wo2 / 4 - 200, WORLD_W / 2 + 200, WORLD_H + 400); ctx.restore();
    ctx.restore();
    worldT();
    // glints
    ctx.strokeStyle = 'rgba(220,240,255,0.55)'; ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (const g of this.glints) {
      const k = Math.sin(time * g.sp + g.ph);
      if (k < 0.6) continue;
      const l = g.len * (k - 0.6) * 2.5;
      ctx.moveTo(g.x - l, g.y); ctx.lineTo(g.x + l, g.y);
    }
    ctx.stroke();
    // shore foam
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.setLineDash(pass ? [3, 9] : [7, 6]); ctx.lineDashOffset = pass ? -time * 5 : time * 3;
      ctx.strokeStyle = `rgba(235,245,250,${pass ? 0.22 : 0.3 + 0.1 * Math.sin(time * 1.3)})`;
      ctx.lineWidth = pass ? 1.2 : 2.2 + Math.sin(time * 1.1) * 0.6;
      ctx.beginPath();
      for (const p of map.polys) { p.pts.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]))); ctx.closePath(); }
      if (pass) { ctx.save(); ctx.translate(0, 0); ctx.scale(1, 1); }
      ctx.stroke();
      if (pass) ctx.restore();
    }
    ctx.setLineDash([]);
    // reef foam rings
    for (const r of map.reefs) {
      const k = ((time * 0.5 + r.seed * 0.001) % 1);
      ctx.strokeStyle = `rgba(235,245,250,${0.35 * (1 - k)})`; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r + 2 + k * 9, 0, TAU); ctx.stroke();
    }
    // currents
    if (map.currents.length) {
      ctx.lineWidth = 1.1;
      for (const st of this.streaks) {
        const c = map.currents[st.c];
        st.t += dt * c.strength / c.len * st.sp * 1.6;
        if (st.t > 1) { st.t = 0; st.off = Math.random() * 2 - 1; }
        const x = c.ax + c.dx * c.len * st.t - c.dy * st.off * c.width * 0.8, y = c.ay + c.dy * c.len * st.t + c.dx * st.off * c.width * 0.8;
        if (map.hitAt(x, y)) continue;
        const a = Math.sin(st.t * Math.PI) * 0.28;
        ctx.strokeStyle = `rgba(200,235,245,${a})`;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - c.dx * 9, y - c.dy * 9); ctx.stroke();
      }
    }
    // land, reefs, piers
    ctx.drawImage(this.stat.land, 0, 0, WORLD_W, WORLD_H);
    // buoys
    for (const b of n.buoys) this.drawBuoy(ctx, b, time);
    if (view.ghostBuoy) { ctx.globalAlpha = 0.5; this.drawBuoy(ctx, view.ghostBuoy, time); ctx.globalAlpha = 1; }
    // wakes and ships
    this.updateTrails(n);
    for (const s of n.ships) this.drawWake(ctx, s);
    for (const s of n.ships) this.drawShip(ctx, s, time);
    // creatures that hide in the dark
    for (const m of n.monsters) {
      if (m.kind === 'gloom') this.drawGloom(ctx, m, time);
      else if (m.kind === 'kraken') ART.kraken(ctx, m, time);
    }
    if (n.boss) ART.leviathan(ctx, n.boss, time);
    ART.lighthouse(ctx, n.L.x, n.L.y, time, n.state !== 'prep' || view.dusk < 1);
    this.fx.draw(ctx, false);
    // ---------- darkness
    this.drawDarkness(n, view, shx, shy);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.light, 0, 0, this.cv.width, this.cv.height);
    // ---------- glow
    worldT();
    ctx.globalCompositeOperation = 'lighter';
    this.drawBeamGlow(ctx, n, time, view);
    for (const hs of this.houses || []) {
      if (!hs.win) continue;
      const f = 0.55 + 0.25 * Math.sin(time * 0.7 + hs.ph) + (Math.sin(time * 13 + hs.ph * 5) > 0.97 ? -0.3 : 0);
      ctx.globalAlpha = f * view.darkness * 0.8;
      ctx.fillStyle = '#ffc56e';
      ctx.fillRect(hs.x - 1, hs.y - 1, 2.2, 2.2);
      ctx.globalAlpha = f * view.darkness * 0.25;
      ctx.drawImage(this.soft, hs.x - 6, hs.y - 6, 12, 12);
    }
    ctx.globalAlpha = 1;
    for (const f of n.flares) this.drawFlare(ctx, f, time);
    for (const b of n.buoys) { ctx.globalAlpha = 0.5 + 0.2 * Math.sin(time * 2 + b.ph); ctx.drawImage(this.soft, b.x - 9, b.y - 9, 18, 18); }
    ctx.globalAlpha = 1;
    for (const m of n.monsters) if (m.kind === 'wisp' && !m.dead) ART.wisp(ctx, m, time);
    this.drawDockMarkers(ctx, n, time, view);
    for (const s of n.ships) this.drawLantern(ctx, s, time);
    ctx.globalCompositeOperation = 'source-over';
    for (const m of n.monsters) {
      if (m.kind === 'gloom' && !m.dead && m.state !== 'rise') ART.gloomEyes(ctx, m, this.mtrails.get(m.id), time);
      else if (m.kind === 'wraith' && !m.dead) ART.wraith(ctx, m, time);
      else if (m.kind === 'kraken') this.drawKrakenWarn(ctx, m, time);
    }
    if (n.boss) { this.drawBossWarn(ctx, n.boss, time); ART.leviathanEyes(ctx, n.boss, time); }
    ctx.globalCompositeOperation = 'lighter';
    this.fx.draw(ctx, true);
    ctx.globalCompositeOperation = 'source-over';
    // fog
    for (const g of n.fogs) {
      const rr = new RNG(g.seed);
      for (let i = 0; i < 5; i++) {
        const ox = rr.range(-0.45, 0.45) * g.r, oy = rr.range(-0.35, 0.35) * g.r, sz = g.r * rr.range(1.1, 1.6);
        ctx.globalAlpha = 0.32 * g.dens;
        ctx.save(); ctx.translate(g.x + ox, g.y + oy); ctx.rotate(time * 0.02 * (i % 2 ? 1 : -1) + i);
        ctx.drawImage(this.fogSprite, -sz / 2, -sz / 2, sz, sz);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    // rain and lightning
    if (n.storm > 0) this.drawRain(ctx, n, dt);
    this.drawBolts(ctx, dt);
    // ---------- world UI
    this.drawShipUI(ctx, n, time, view);
    this.drawIncoming(ctx, n, time, view);
    this.drawSpawnHints(ctx, n, time, view);
    if (view.reticle) this.drawReticle(ctx, view.reticle, time);
    this.fx.drawTexts(ctx);
    // vignette and flash
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.vignette) this.vignette = this.makeVignette();
    ctx.drawImage(this.vignette, 0, 0);
    if (n.flash > 0.5 && !this.reduceFlash) { ctx.fillStyle = `rgba(220,230,255,${(n.flash - 0.5) * 0.35})`; ctx.fillRect(0, 0, this.cv.width, this.cv.height); }
    if (this.fade > 0) { // fade in from black when the scene changes
      ctx.fillStyle = `rgba(6,13,22,${easeInOut(clamp(this.fade, 0, 1))})`;
      ctx.fillRect(0, 0, this.cv.width, this.cv.height);
      this.fade -= Math.min(dt, 0.05) * 1.6;
    }
  }

  makeVignette() {
    const c = mkCanvas(this.cv.width, this.cv.height), x = c.getContext('2d');
    const g = x.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.35, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  drawDarkness(n, view, shx, shy) {
    const l = this.lctx, P = n.map.region.palette;
    const lq = this.dpr * LQ, q = this.s * lq;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, this.light.width, this.light.height);
    const night = 0.84 - n.moon * 0.6;
    let A = lerp(view.dawn ? 0.18 : view.duskAlpha != null ? view.duskAlpha : 0.4, night, view.darkness);
    if (n.flash > 0) A *= 1 - n.flash * (this.reduceFlash ? 0.25 : 0.75);
    // dusk tint fades to night blue
    const dc = P.dark;
    const tint = view.darkness < 1 ? mixRgb(view.dawn ? [120, 80, 70] : [58, 30, 52], dc, view.darkness) : dc;
    l.fillStyle = rgba(tint, A);
    l.fillRect(0, 0, this.light.width, this.light.height);
    l.setTransform(q, 0, 0, q, (this.ox + shx) * lq, (this.oy + shy) * lq);
    l.globalCompositeOperation = 'destination-out';
    const L = n.L;
    const beams = n.beams();
    const fogK = n.fogs.length ? 0.85 : 1;
    if (n.state !== 'prep') {
      for (const b of beams) {
        const sp = this.beamSprite(b.range, b.half, q);
        l.save(); l.translate(L.x, L.y); l.rotate(b.ang);
        l.globalAlpha = clamp(b.power * 0.95 * fogK, 0, 1);
        l.drawImage(sp.mask, 0, -sp.hw, b.range + 2, sp.hw * 2);
        l.restore();
      }
      // fog banks eat some of the cut
      l.globalAlpha = 1;
    }
    const cut = (x, y, r, a) => { l.globalAlpha = clamp(a, 0, 1); l.drawImage(this.soft, x - r, y - r, r * 2, r * 2); };
    cut(L.x, L.y + 10, 80, 0.9);
    for (const f of n.flares) {
      if (f.t < f.fly) { const k = f.t / f.fly; cut(lerp(f.sx, f.x, k), lerp(f.sy, f.y, k) - Math.sin(k * Math.PI) * 60, 26, 0.7); continue; }
      const fl = Math.min(1, (f.life - f.t) / 1.5) * (0.9 + 0.1 * Math.sin(this.time * 30));
      cut(f.x, f.y, f.r * 1.15, fl);
    }
    for (const b of n.buoys) cut(b.x, b.y, 58, 0.75);
    if (n.k.harborR) for (const k of n.map.activeDocks) { const d = n.map.docks[k].berth; cut(d.x, d.y, n.k.harborR * 1.1, 0.7); }
    for (const m of n.monsters) {
      if (m.kind === 'wisp' && !m.dead) cut(m.x, m.y, 60, 0.45 * (m.state === 'rise' ? clamp(m.t / 1.5, 0, 1) : 1));
    }
    // ship lanterns light a little water around them
    for (const s of n.ships) if (s.state === 'sail' || s.state === 'grabbed') cut(s.x, s.y, 20, 0.35);
    for (const hs of this.houses || []) if (hs.win) cut(hs.x, hs.y, 14, 0.25);
    // put darkness back over the wraiths' auras
    l.globalCompositeOperation = 'source-over';
    for (const m of n.monsters) {
      if (m.kind !== 'wraith' || m.dead) continue;
      const g = l.createRadialGradient(m.x, m.y, 10, m.x, m.y, 100);
      g.addColorStop(0, rgba(dc, A * 0.8)); g.addColorStop(1, rgba(dc, 0));
      l.globalAlpha = 1; l.fillStyle = g; l.beginPath(); l.arc(m.x, m.y, 100, 0, TAU); l.fill();
    }
    l.globalAlpha = 1;
  }

  drawBeamGlow(ctx, n, time, view) {
    if (n.state === 'prep') return;
    const L = n.L;
    const q = this.s * this.dpr * LQ;
    for (const b of n.beams()) {
      const sp = this.beamSprite(b.range, b.half, q);
      ctx.save(); ctx.translate(L.x, L.y); ctx.rotate(b.ang);
      ctx.globalAlpha = clamp(0.16 * b.power * (n.fogs.length ? 1.3 : 1), 0, 0.45);
      ctx.drawImage(sp.glow, 0, -sp.hw, b.range + 2, sp.hw * 2);
      // shafts of light
      ctx.globalAlpha = 1;
      for (let i = 0; i < 4; i++) {
        const a = Math.sin(time * 0.6 + i * 2.1) * b.half * 0.7;
        const al = 0.018 + 0.014 * Math.sin(time * 1.7 + i);
        ctx.strokeStyle = `rgba(255,230,180,${al})`;
        ctx.lineWidth = 6 + i * 3;
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(Math.cos(a) * b.range * 0.85, Math.sin(a) * b.range * 0.85); ctx.stroke();
      }
      ctx.restore();
    }
    // lamp core
    const pulse = 0.85 + 0.15 * Math.sin(time * 6);
    const dry = n.oil <= 0;
    ctx.globalAlpha = (dry ? 0.35 : 0.9) * pulse;
    ctx.drawImage(this.soft, L.x - 16, L.y - 16, 32, 32);
    ctx.globalAlpha = (dry ? 0.15 : 0.35);
    ctx.drawImage(this.soft, L.x - 44, L.y - 44, 88, 88);
    ctx.globalAlpha = 1;
  }

  drawFlare(ctx, f, time) {
    let x = f.x, y = f.y;
    if (f.t < f.fly) {
      const k = f.t / f.fly;
      x = lerp(f.sx, f.x, k); y = lerp(f.sy, f.y, k) - Math.sin(k * Math.PI) * 60;
      ctx.globalAlpha = 1; ctx.drawImage(this.soft, x - 8, y - 8, 16, 16);
      return;
    }
    const fl = Math.min(1, (f.life - f.t) / 1.5) * (0.85 + 0.15 * Math.sin(time * 37));
    ctx.globalAlpha = 0.35 * fl;
    ctx.fillStyle = '#ff7a3c';
    const g = ctx.createRadialGradient(x, y, 0, x, y, f.r);
    g.addColorStop(0, 'rgba(255,140,70,0.55)'); g.addColorStop(1, 'rgba(255,80,30,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, f.r, 0, TAU); ctx.fill();
    ctx.globalAlpha = fl;
    ctx.drawImage(this.soft, x - 7, y - 7, 14, 14);
    if (Math.random() < 0.5) this.fx.add({ x, y, vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 20, life: 0.8, size: 1.4, color: '#ffb46a', glow: true, drag: 1, rise: 8, kind: 'dot', rot: 0, vr: 0, grow: 0 });
    ctx.globalAlpha = 1;
  }

  drawBuoy(ctx, b, time) {
    const bob = Math.sin(time * 1.8 + b.ph) * 0.8;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(b.x + 1.5, b.y + 2 + bob, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c04a3a'; ctx.beginPath(); ctx.arc(b.x, b.y + bob, 4.6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8e0cc'; ctx.beginPath(); ctx.arc(b.x, b.y + bob, 2.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(235,245,250,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(b.x, b.y + bob, 6.5 + (time * 3 % 3), 0, TAU); ctx.stroke();
  }

  updateTrails(n) {
    const seen = new Set();
    for (const s of n.ships) {
      seen.add(s.id);
      let tr = this.trails.get(s.id);
      if (!tr) { tr = []; this.trails.set(s.id, tr); }
      const sx = s.x - Math.cos(s.ang) * s.T.len * 0.48, sy = s.y - Math.sin(s.ang) * s.T.len * 0.48;
      if (s.state === 'sail' && (!tr.length || dist(tr[0].x, tr[0].y, sx, sy) > 3.5)) { tr.unshift({ x: sx, y: sy, a: s.ang, t: this.time }); if (tr.length > 26) tr.pop(); }
    }
    for (const k of this.trails.keys()) if (!seen.has(k)) this.trails.delete(k);
    const mseen = new Set();
    for (const m of n.monsters) {
      if (m.kind !== 'gloom') continue;
      mseen.add(m.id);
      let tr = this.mtrails.get(m.id);
      if (!tr) { tr = []; for (let i = 0; i < 14; i++) tr.push({ x: m.x - Math.cos(m.ang) * i * 2, y: m.y - Math.sin(m.ang) * i * 2 }); this.mtrails.set(m.id, tr); }
      // tr[0] follows the head; a new joint is laid down every 2px of travel
      if (dist(tr[0].x, tr[0].y, m.x, m.y) > 14) { tr.length = 0; for (let i = 0; i < 14; i++) tr.push({ x: m.x - Math.cos(m.ang) * i * 2, y: m.y - Math.sin(m.ang) * i * 2 }); }
      else if (dist(tr[1].x, tr[1].y, m.x, m.y) > 2.2) { tr.unshift({ x: m.x, y: m.y }); if (tr.length > 14) tr.pop(); }
      else { tr[0].x = m.x; tr[0].y = m.y; }
    }
    for (const k of this.mtrails.keys()) if (!mseen.has(k)) this.mtrails.delete(k);
  }

  drawWake(ctx, s) {
    const tr = this.trails.get(s.id);
    if (!tr || tr.length < 2) return;
    ctx.lineWidth = 1.1;
    const n = tr.length;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 1; i < n; i++) {
        const p0 = tr[i - 1], p1 = tr[i];
        const a = 0.42 * (1 - i / n);
        const sp0 = s.T.beam * 0.35 + (i - 1) * 0.75, sp1 = s.T.beam * 0.35 + i * 0.75;
        ctx.strokeStyle = `rgba(230,242,248,${a})`;
        ctx.beginPath();
        ctx.moveTo(p0.x + Math.cos(p0.a + Math.PI / 2) * sp0 * side, p0.y + Math.sin(p0.a + Math.PI / 2) * sp0 * side);
        ctx.lineTo(p1.x + Math.cos(p1.a + Math.PI / 2) * sp1 * side, p1.y + Math.sin(p1.a + Math.PI / 2) * sp1 * side);
        ctx.stroke();
      }
    }
    // churn right behind the stern
    ctx.fillStyle = 'rgba(230,242,248,0.18)';
    ctx.beginPath(); ctx.arc(tr[0].x, tr[0].y, s.T.beam * 0.3, 0, TAU); ctx.fill();
  }

  drawShip(ctx, s, time) {
    const pen = this.n.map.docks[s.dock].style.color;
    if (s.state === 'wrecked') {
      const k = clamp(s.sinkT / 5, 0, 1);
      if (k >= 1) return;
      ctx.save();
      const tilted = { ...s, ang: s.ang + k * 0.6 };
      ctx.globalAlpha = 1 - k;
      ctx.translate(s.x, s.y); ctx.scale(1 - k * 0.35, 1 - k * 0.35); ctx.translate(-s.x, -s.y);
      ART.ship(ctx, tilted, { time, alpha: 1 - k });
      ctx.restore();
      ctx.globalAlpha = 1;
      if (Math.random() < 0.3) this.fx.add({ x: s.x + (Math.random() - 0.5) * s.T.len * 0.6, y: s.y + (Math.random() - 0.5) * 8, vx: 0, vy: 0, life: 1.2, size: 1 + Math.random() * 1.5, color: 'rgba(220,240,250,0.6)', glow: false, drag: 1, rise: 0, kind: 'dot', rot: 0, vr: 0, grow: 2 });
      return;
    }
    if (s.state === 'docked') {
      const k = clamp(s.dockT / 3, 0, 1);
      ART.ship(ctx, s, { time, alpha: 1 - k * k, pennant: pen });
      return;
    }
    const wob = s.hurtT > 0 ? Math.sin(time * 60) * 0.06 : 0;
    ART.ship(ctx, wob ? { ...s, ang: s.ang + wob } : s, { time, pennant: pen });
  }

  drawGloom(ctx, m, time) {
    const tr = this.mtrails.get(m.id);
    if (m.state === 'rise') {
      const k = clamp(m.t / 1.4, 0, 1);
      ctx.fillStyle = `rgba(20,8,30,${0.7 * k})`;
      ctx.beginPath(); ctx.arc(m.x, m.y, 10 * k, 0, TAU); ctx.fill();
      return;
    }
    if (m.dead) return;
    ART.gloom(ctx, m, tr, time);
  }

  drawLantern(ctx, s, time) {
    if (s.state !== 'sail' && s.state !== 'grabbed') return;
    const c = this.n.map.docks[s.dock].style.color;
    const lx = s.x + Math.cos(s.ang) * s.T.len * 0.32, ly = s.y + Math.sin(s.ang) * s.T.len * 0.32;
    const sway = 0.85 + 0.15 * Math.sin(time * 4 + s.seed);
    const [r, g, b] = hexRgb(c);
    const gr = ctx.createRadialGradient(lx, ly, 0, lx, ly, 11);
    gr.addColorStop(0, `rgba(${r},${g},${b},${0.8 * sway})`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(lx, ly, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,250,235,0.95)'; ctx.beginPath(); ctx.arc(lx, ly, 1.5, 0, TAU); ctx.fill();
  }

  drawDockMarkers(ctx, n, time, view) {
    for (const k of n.map.activeDocks) {
      const d = n.map.docks[k];
      const x = d.shore.x + Math.cos(d.ang) * 18, y = d.shore.y + Math.sin(d.ang) * 18;
      const [r, g, b] = hexRgb(d.style.color);
      const pulse = 0.75 + 0.25 * Math.sin(time * 2 + k);
      const gr = ctx.createRadialGradient(x, y, 0, x, y, 30);
      gr.addColorStop(0, `rgba(${r},${g},${b},${0.55 * pulse})`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 30, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(8,14,22,0.85)'; ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill();
      ctx.strokeStyle = d.style.color; ctx.lineWidth = 1.4; ctx.stroke();
      ART.symbol(ctx, d.style.sym, x, y, 6.5, d.style.color);
      ctx.globalCompositeOperation = 'lighter';
    }
  }

  drawKrakenWarn(ctx, m, time) {
    if (m.state !== 'warn' && m.state !== 'up') return;
    const k = m.state === 'warn' ? m.t / 3.2 : 1;
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const p = ((time * 0.6 + i / 3) % 1);
      ctx.strokeStyle = `rgba(150,210,220,${(1 - p) * (m.state === 'warn' ? 0.55 : 0.22)})`;
      ctx.beginPath(); ctx.arc(m.x, m.y, 14 + p * 62 * (0.4 + 0.6 * k), 0, TAU); ctx.stroke();
    }
    if (m.state === 'up' && m.hp < m.maxHp) this.bar(ctx, m.x, m.y - 46, 40, m.hp / m.maxHp, '#e0a35c');
  }

  drawBossWarn(ctx, b, time) {
    if (b.state !== 'warn') return;
    const k = 1 - b.stateT / 2.6;
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const p = ((time * 0.8 + i / 4) % 1);
      ctx.strokeStyle = `rgba(255,140,90,${(1 - p) * 0.5})`;
      ctx.beginPath(); ctx.arc(b.x, b.y, 18 + p * 90 * (0.5 + 0.5 * k), 0, TAU); ctx.stroke();
    }
  }

  bar(ctx, x, y, w, f, color) {
    ctx.fillStyle = 'rgba(5,10,16,0.8)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
    ctx.fillStyle = color; ctx.fillRect(x - w / 2, y, w * clamp(f, 0, 1), 3);
  }

  drawShipUI(ctx, n, time, view) {
    for (const s of n.ships) {
      if (s.state !== 'sail' && s.state !== 'grabbed') continue;
      const hf = s.hull / s.maxHull;
      if (hf < 1) {
        const col = hf > 0.6 ? '#9fd18a' : hf > 0.3 ? '#e8c35a' : '#e86a5a';
        ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(5,10,16,0.75)';
        const r = s.T.len * 0.5 + 6;
        ctx.beginPath(); ctx.arc(s.x, s.y, r, -Math.PI / 2, -Math.PI / 2 + TAU); ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(s.x, s.y, r, -Math.PI / 2, -Math.PI / 2 + TAU * hf); ctx.stroke();
      }
      if (s.state === 'grabbed' || s.latched) {
        const p = 0.5 + 0.5 * Math.sin(time * 9);
        ctx.strokeStyle = s.state === 'grabbed' ? `rgba(255,90,70,${0.5 + 0.4 * p})` : `rgba(190,120,255,${0.4 + 0.4 * p})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.T.len * 0.5 + 10 + p * 3, 0, TAU); ctx.stroke();
      }
      if (!s.lit && s.lostT > 1.2 && s.state === 'sail') {
        const a = 0.55 + 0.45 * Math.sin(time * 7 + s.seed);
        ctx.globalAlpha = a;
        ctx.font = '700 13px "Plex Sans", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(4,8,14,0.9)';
        ctx.strokeText('?', s.x, s.y - s.T.len * 0.5 - 10);
        ctx.fillStyle = '#fff1cf'; ctx.fillText('?', s.x, s.y - s.T.len * 0.5 - 10);
        ctx.globalAlpha = 1;
      }
      if (view.badges) {
        const st = n.map.docks[s.dock].style;
        ctx.fillStyle = 'rgba(8,14,22,0.85)'; ctx.beginPath(); ctx.arc(s.x + s.T.len * 0.45, s.y - 10, 5.5, 0, TAU); ctx.fill();
        ART.symbol(ctx, st.sym, s.x + s.T.len * 0.45, s.y - 10, 4.2, st.color);
      }
      if (s.T.vip) {
        ctx.fillStyle = '#f2d06b'; ctx.font = '600 9px "Plex Sans", system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('ENVOY', s.x, s.y + s.T.len * 0.5 + 10);
      }
    }
    for (const m of n.monsters) {
      if (m.kind === 'wraith' && !m.dead && m.hp < m.maxHp) this.bar(ctx, m.x, m.y - 34, 44, m.hp / m.maxHp, '#7ee0d0');
      if (m.kind === 'wisp' && !m.dead && m.hp < m.maxHp) this.bar(ctx, m.x, m.y - 22, 24, m.hp / m.maxHp, '#9ff09a');
    }
  }

  drawIncoming(ctx, n, time, view) {
    for (const w of view.incoming || []) {
      const left = w.at - n.t;
      if (left < -1.5) continue;
      const map = n.map, dk = map.docks[w.dock];
      const x = clamp(w.x, 22, WORLD_W - 22), y = clamp(w.y, 22, WORLD_H - 22);
      const a = Math.atan2(dk.berth.y - w.y, dk.berth.x - w.x);
      const alpha = left < 0 ? clamp(1 + left / 1.5, 0, 1) : 1;
      const pulse = 0.7 + 0.3 * Math.sin(time * 8);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(8,14,22,0.7)'; ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill();
      ctx.strokeStyle = dk.style.color; ctx.lineWidth = 2;
      const f = clamp(1 - left / 4, 0, 1);
      ctx.beginPath(); ctx.arc(0, 0, 13, -Math.PI / 2 - a, -Math.PI / 2 - a + TAU * f); ctx.stroke();
      ctx.fillStyle = dk.style.color; ctx.globalAlpha = alpha * pulse;
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-4, -6); ctx.lineTo(-1, 0); ctx.lineTo(-4, 6); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  drawSpawnHints(ctx, n, time, view) {
    if (n.state !== 'prep') return;
    for (const s of n.map.spawns) {
      const x = clamp(s.x, 18, WORLD_W - 18), y = clamp(s.y, 18, WORLD_H - 18);
      const a = Math.atan2(n.L.y - s.y, n.L.x - s.x);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(time * 3);
      ctx.strokeStyle = '#f2e6c8'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(4, 0); ctx.lineTo(-6, 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-14, -6); ctx.lineTo(-4, 0); ctx.lineTo(-14, 6); ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  drawReticle(ctx, r, time) {
    ctx.strokeStyle = 'rgba(255,170,100,0.85)'; ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 5]); ctx.lineDashOffset = -time * 12;
    ctx.beginPath(); ctx.arc(r.x, r.y, 125, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(r.x - 8, r.y); ctx.lineTo(r.x + 8, r.y); ctx.moveTo(r.x, r.y - 8); ctx.lineTo(r.x, r.y + 8); ctx.stroke();
  }

  drawRain(ctx, n, dt) {
    const s = n.storm;
    const wx = n.wind.x * 0.06;
    ctx.lineWidth = 0.8;
    const cnt = Math.floor(this.rain.length * s);
    const beams = n.beams();
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(190,210,230,0.18)';
    for (let i = 0; i < cnt; i++) {
      const r = this.rain[i];
      r.y += dt * 1.6 * r.sp; r.x += dt * (wx + 0.05) * r.sp;
      if (r.y > 1) { r.y -= 1; r.x = Math.random(); }
      if (r.x > 1) r.x -= 1; else if (r.x < 0) r.x += 1;
      const x = r.x * WORLD_W, y = r.y * WORLD_H, l = 9 * r.len;
      ctx.moveTo(x, y); ctx.lineTo(x - (wx + 0.05) * 160 * r.len, y - l);
    }
    ctx.stroke();
    // drops caught in the beam
    ctx.beginPath(); ctx.strokeStyle = 'rgba(255,235,200,0.5)';
    for (let i = 0; i < cnt; i += 2) {
      const r = this.rain[i];
      const x = r.x * WORLD_W, y = r.y * WORLD_H;
      if (n.beamLight(x, y, beams) < 0.4) continue;
      const l = 9 * r.len;
      ctx.moveTo(x, y); ctx.lineTo(x - (wx + 0.05) * 160 * r.len, y - l);
    }
    ctx.stroke();
  }

  lightning(x, y, seed) {
    const r = new RNG(seed);
    const pts = [[x + r.range(-80, 80), -20]];
    let cx = pts[0][0], cy = -20;
    while (cy < y) { cy += r.range(18, 40); cx += r.range(-28, 28); pts.push([cx, cy]); }
    this.bolts.push({ pts, t: 0, life: 0.35 });
  }
  drawBolts(ctx, dt) {
    for (const b of this.bolts) {
      b.t += dt;
      const a = (1 - b.t / b.life) * (this.reduceFlash ? 0.4 : 1);
      ctx.strokeStyle = `rgba(230,240,255,${a})`; ctx.lineWidth = 2.2;
      ctx.shadowColor = '#bcd4ff'; ctx.shadowBlur = 12;
      ctx.beginPath(); b.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    this.bolts = this.bolts.filter(b => b.t < b.life);
  }
}
