'use strict';
// Map generation: coastlines from noise, reefs, terrain grid, distance fields and per-dock flow fields.

const CELL = 5;
const GW = Math.ceil(WORLD_W / CELL), GH = Math.ceil(WORLD_H / CELL);
const T_WATER = 0, T_LAND = 1, T_REEF = 2;
const BASE_RANGE = 520;

function coastPolys(region) {
  const noise = new Noise2(region.seed);
  const polys = [];
  region.land.forEach((s, k) => {
    const pts = [];
    if (s.type === 'edge') {
      const horiz = s.side === 's' || s.side === 'n';
      const len = horiz ? WORLD_W : WORLD_H;
      const outside = s.side === 's' ? WORLD_H + 60 : s.side === 'e' ? WORLD_W + 60 : -60;
      const from = s.from != null ? s.from : -999, to = s.to != null ? s.to : 99999;
      for (let u = -80; u <= len + 80; u += 8) {
        let off = s.amp * (2 * noise.fbm(u * s.freq + k * 31.7, k * 7.3, 4) - 1);
        let bay = 0;
        for (const b of s.bays || []) {
          const c = horiz ? b.x : b.y;
          const dd = Math.abs(u - c);
          if (dd < b.w / 2) bay += b.d * 0.5 * (1 + Math.cos(Math.PI * dd / (b.w / 2)));
        }
        const inward = (s.side === 's' || s.side === 'e') ? 1 : -1; // + moves coast inland
        let pos = s.base + off + inward * bay;
        const f = smooth(from, from + 140, u) * (1 - smooth(to - 140, to, u));
        const edgeLine = s.side === 's' ? WORLD_H + 40 : s.side === 'e' ? WORLD_W + 40 : -40;
        pos = edgeLine + f * (pos - edgeLine);
        pts.push(horiz ? [u, pos] : [pos, u]);
      }
      if (horiz) { pts.push([len + 80, outside]); pts.push([-80, outside]); }
      else { pts.push([outside, len + 80]); pts.push([outside, -80]); }
    } else {
      const N = 72;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU;
        const n = noise.fbm(Math.cos(a) * 1.6 + k * 13.1, Math.sin(a) * 1.6 + k * 5.7, 4);
        const r = s.r * (1 + s.amp * (2 * n - 1));
        pts.push([s.x + Math.cos(a) * r, s.y + Math.sin(a) * r]);
      }
    }
    polys.push({ pts, shape: s });
  });
  return polys;
}

// Scanline fill a polygon into the grid (cell centers)
function fillPoly(grid, pts, val) {
  for (let gy = 0; gy < GH; gy++) {
    const y = (gy + 0.5) * CELL;
    const xs = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const yi = pts[i][1], yj = pts[j][1];
      if ((yi > y) !== (yj > y)) xs.push(pts[i][0] + ((y - yi) / (yj - yi)) * (pts[j][0] - pts[i][0]));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] / CELL - 0.5)), x1 = Math.min(GW - 1, Math.floor(xs[k + 1] / CELL - 0.5));
      for (let gx = x0; gx <= x1; gx++) grid[gy * GW + gx] = val;
    }
  }
}

function chamfer(grid, isSource) {
  const N = GW * GH;
  const d = new Float32Array(N);
  const INF = 1e9;
  for (let i = 0; i < N; i++) d[i] = isSource(grid[i]) ? 0 : INF;
  const D2 = 1.4142;
  for (let y = 0; y < GH; y++) {
    const row = y * GW;
    for (let x = 0; x < GW; x++) {
      const i = row + x; let v = d[i], w;
      if (v === 0) continue;
      if (x > 0 && (w = d[i - 1] + 1) < v) v = w;
      if (y > 0) {
        if ((w = d[i - GW] + 1) < v) v = w;
        if (x > 0 && (w = d[i - GW - 1] + D2) < v) v = w;
        if (x < GW - 1 && (w = d[i - GW + 1] + D2) < v) v = w;
      }
      d[i] = v;
    }
  }
  for (let y = GH - 1; y >= 0; y--) {
    const row = y * GW;
    for (let x = GW - 1; x >= 0; x--) {
      const i = row + x; let v = d[i], w;
      if (v === 0) continue;
      if (x < GW - 1 && (w = d[i + 1] + 1) < v) v = w;
      if (y < GH - 1) {
        if ((w = d[i + GW] + 1) < v) v = w;
        if (x < GW - 1 && (w = d[i + GW + 1] + D2) < v) v = w;
        if (x > 0 && (w = d[i + GW - 1] + D2) < v) v = w;
      }
      d[i] = v;
    }
  }
  for (let i = 0; i < N; i++) { const v = d[i] * CELL; d[i] = v < 9999 ? v : 9999; }
  return d;
}

class Heap {
  constructor(cap) { this.k = new Int32Array(cap); this.v = new Float32Array(cap); this.n = 0; }
  push(key, val) {
    const k = this.k, v = this.v;
    if (this.n >= k.length) { const nk = new Int32Array(k.length * 2), nv = new Float32Array(k.length * 2); nk.set(k); nv.set(v); this.k = nk; this.v = nv; return this.push(key, val); }
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] <= val) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = k[0];
    const n = --this.n;
    if (n > 0) {
      const lk = k[n], lv = v[n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && v[r] < v[l] ? r : l;
        if (v[m] >= lv) break;
        k[i] = k[m]; v[i] = v[m]; i = m;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
  get size() { return this.n; }
}

const NB_X = [1, -1, 0, 0, 1, 1, -1, -1], NB_Y = [0, 0, 1, -1, 1, -1, 1, -1], NB_W = [1, 1, 1, 1, 1.4142, 1.4142, 1.4142, 1.4142];

const cellOf = (x, y) => {
  const gx = clamp(Math.floor(x / CELL), 0, GW - 1), gy = clamp(Math.floor(y / CELL), 0, GH - 1);
  return gy * GW + gx;
};

class GameMap {
  constructor(regionIdx, night, opts = {}) {
    this.regionIdx = regionIdx;
    this.region = REGIONS[regionIdx];
    this.night = night;
    const R = this.region;
    this.polys = coastPolys(R);
    this.lighthouse = { x: R.lighthouse.x, y: R.lighthouse.y };
    this.land = new Uint8Array(GW * GH);
    for (const p of this.polys) fillPoly(this.land, p.pts, T_LAND);
    this.distLand = chamfer(this.land, v => v === T_LAND);
    this.activeDocks = night && night.docks ? night.docks.slice() : R.docks.map((_, i) => i);
    this.docks = R.docks.map((d, i) => this.placeDock(d, i));
    this.spawns = R.spawns.map(s => ({ x: s.x, y: s.y }));
    this.reefs = []; this.clusters = [];
    this.currents = [];
    const seed = opts.seed != null ? opts.seed : hashStr((night ? night.id : 'free') + ':' + R.id);
    this.rng = new RNG(seed);
    this.build(true);
    const reefCount = opts.reefs != null ? opts.reefs : night ? night.reefs : 6;
    this.genReefs(reefCount);
    this.genCurrents(opts.currents != null ? opts.currents : (night && night.currents) || 0);
  }

  placeDock(d, i) {
    const dx = Math.cos(d.ang), dy = Math.sin(d.ang);
    const isLand = (x, y) => this.land[cellOf(x, y)] === T_LAND && x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H;
    let x = d.x, y = d.y;
    if (isLand(x, y)) { for (let s = 0; s < 300 && isLand(x, y); s += 2) { x += dx * 2; y += dy * 2; } }
    else { for (let s = 0; s < 300 && !isLand(x - dx * 2, y - dy * 2); s += 2) { x -= dx * 2; y -= dy * 2; } }
    const shore = { x, y };
    const berth = { x: x + dx * 30, y: y + dy * 30 };
    return { i, shore, berth, ang: d.ang, style: DOCK_STYLES[i % DOCK_STYLES.length] };
  }

  build(skipFlows) {
    this.grid = new Uint8Array(this.land);
    for (const r of this.reefs) {
      const x0 = Math.floor((r.x - r.r) / CELL), x1 = Math.ceil((r.x + r.r) / CELL);
      const y0 = Math.floor((r.y - r.r) / CELL), y1 = Math.ceil((r.y + r.r) / CELL);
      for (let gy = Math.max(0, y0); gy <= Math.min(GH - 1, y1); gy++) for (let gx = Math.max(0, x0); gx <= Math.min(GW - 1, x1); gx++) {
        const cx = (gx + 0.5) * CELL, cy = (gy + 0.5) * CELL;
        if (dist2(cx, cy, r.x, r.y) <= r.r * r.r && this.grid[gy * GW + gx] === T_WATER) this.grid[gy * GW + gx] = T_REEF;
      }
    }
    this.dist = chamfer(this.grid, v => v !== T_WATER);
    if (!skipFlows) this.flows = this.docks.map(d => (this.activeDocks.includes(d.i) ? this.flowField(d) : null));
  }

  passableFn(dock) {
    const bx = dock.berth.x, by = dock.berth.y, grid = this.grid, dd = this.dist;
    return i => {
      if (grid[i] !== T_WATER) return false;
      if (dd[i] >= 11) return true;
      const gx = i % GW, gy = (i / GW) | 0;
      return dist2((gx + 0.5) * CELL, (gy + 0.5) * CELL, bx, by) < 46 * 46; // berth approach may hug the shore
    };
  }

  // Cheap BFS reachability used while placing reefs
  reachMask(dock) {
    const N = GW * GH, seen = new Uint8Array(N), q = new Int32Array(N);
    const passable = this.passableFn(dock);
    const start = cellOf(dock.berth.x, dock.berth.y);
    let h = 0, t = 0; q[t++] = start; seen[start] = 1;
    while (h < t) {
      const i = q[h++], gx = i % GW, gy = (i / GW) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = gx + NB_X[k], ny = gy + NB_Y[k];
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const j = ny * GW + nx;
        if (seen[j] || !passable(j)) continue;
        seen[j] = 1; q[t++] = j;
      }
    }
    return seen;
  }

  flowField(dock) {
    const N = GW * GH;
    const cost = new Float32Array(N).fill(Infinity);
    const CLEAR = 46;
    const start = cellOf(dock.berth.x, dock.berth.y);
    const bx = dock.berth.x, by = dock.berth.y;
    const passable = this.passableFn(dock);
    const pass = new Uint8Array(N);
    for (let i = 0; i < N; i++) pass[i] = passable(i) ? 1 : 0;
    const pen = new Float32Array(N);
    for (let i = 0; i < N; i++) { const dd = this.dist[i]; pen[i] = dd < CLEAR ? 1 + 2.6 * (1 - dd / CLEAR) : 1; }
    const h = new Heap(N);
    const done = new Uint8Array(N);
    cost[start] = 0; h.push(start, 0);
    while (h.size) {
      const i = h.pop();
      if (done[i]) continue;
      done[i] = 1;
      const c = cost[i];
      const gx = i % GW, gy = (i / GW) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = gx + NB_X[k], ny = gy + NB_Y[k];
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const j = ny * GW + nx;
        if (!pass[j] || done[j]) continue;
        const nc = c + NB_W[k] * pen[j];
        if (nc < cost[j]) { cost[j] = nc; h.push(j, nc); }
      }
    }
    // Direction field: toward the cheapest neighbour
    const dx = new Float32Array(N), dy = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const gx = i % GW, gy = (i / GW) | 0;
      let best = cost[i], bxo = 0, byo = 0;
      for (let k = 0; k < 8; k++) {
        const nx = gx + NB_X[k], ny = gy + NB_Y[k];
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const c = cost[ny * GW + nx];
        if (c < best) { best = c; bxo = NB_X[k] / NB_W[k]; byo = NB_Y[k] / NB_W[k]; }
      }
      if (bxo === 0 && byo === 0) { // unreachable or the berth: point at the dock
        const cx = (gx + 0.5) * CELL, cy = (gy + 0.5) * CELL;
        const l = Math.hypot(bx - cx, by - cy) || 1;
        bxo = (bx - cx) / l; byo = (by - cy) / l;
      }
      dx[i] = bxo; dy[i] = byo;
    }
    return { cost, dx, dy };
  }

  // Smoothed flow direction toward dock k at a point
  flowDir(k, x, y) {
    const f = this.flows[k];
    const fx = clamp(x / CELL - 0.5, 0, GW - 1.001), fy = clamp(y / CELL - 0.5, 0, GH - 1.001);
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const i = y0 * GW + x0;
    const w = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
    const ids = [i, i + 1, i + GW, i + GW + 1];
    let vx = 0, vy = 0;
    for (let k2 = 0; k2 < 4; k2++) {
      const c = f.cost[ids[k2]];
      if (c === Infinity) continue;
      vx += f.dx[ids[k2]] * w[k2]; vy += f.dy[ids[k2]] * w[k2];
    }
    if (vx === 0 && vy === 0) { vx = f.dx[i]; vy = f.dy[i]; }
    const l = Math.hypot(vx, vy) || 1;
    return [vx / l, vy / l];
  }

  costAt(k, x, y) { return this.flows[k].cost[cellOf(x, y)]; }

  terrainAt(x, y) {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return T_WATER;
    return this.grid[cellOf(x, y)];
  }
  distAt(x, y) {
    if (x < -CELL || y < -CELL || x >= WORLD_W + CELL || y >= WORLD_H + CELL) return 200;
    return this.dist[cellOf(x, y)];
  }
  // Gradient of the obstacle distance field (points away from obstacles)
  distGrad(x, y) {
    const e = CELL * 1.5;
    const gx = this.distAt(x + e, y) - this.distAt(x - e, y);
    const gy = this.distAt(x, y + e) - this.distAt(x, y - e);
    const l = Math.hypot(gx, gy) || 1;
    return [gx / l, gy / l];
  }

  // Precise obstacle hit: reef rocks by circle, land by grid
  hitAt(x, y) {
    for (const r of this.reefs) if (dist2(x, y, r.x, r.y) < r.r * r.r) return T_REEF;
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return T_WATER;
    return this.land[cellOf(x, y)] === T_LAND ? T_LAND : T_WATER;
  }

  spawnEntry(s) { // first point inside the world on the way in
    return { x: clamp(s.x, 12, WORLD_W - 12), y: clamp(s.y, 12, WORLD_H - 12) };
  }

  reachable() {
    for (const k of this.activeDocks) {
      const m = this.reachMask(this.docks[k]);
      for (const s of this.spawns) { const e = this.spawnEntry(s); if (!m[cellOf(e.x, e.y)]) return false; }
    }
    return true;
  }

  genReefs(count) {
    const rng = this.rng, L = this.lighthouse;
    const maxR = BASE_RANGE * 0.86;
    let tries = 0;
    while (this.clusters.length < count && tries < 400) {
      tries++;
      const s = this.spawnEntry(rng.pick(this.spawns));
      const d = this.docks[rng.pick(this.activeDocks)].berth;
      const t = rng.range(0.3, 0.82);
      let px = lerp(s.x, d.x, t), py = lerp(s.y, d.y, t);
      const nx = -(d.y - s.y), ny = d.x - s.x, nl = Math.hypot(nx, ny) || 1;
      const off = rng.gauss() * 34;
      px += nx / nl * off; py += ny / nl * off;
      const dl = dist(px, py, L.x, L.y);
      if (dl < 95 || dl > maxR) continue;
      if (px < 70 || py < 70 || px > WORLD_W - 70 || py > WORLD_H - 70) continue;
      if (this.docks.some(dk => dist(px, py, dk.berth.x, dk.berth.y) < 120)) continue;
      if (this.distLand[cellOf(px, py)] < 44) continue;
      if (this.clusters.some(c => dist(px, py, c.x, c.y) < 90)) continue;
      const rocks = [];
      const n = rng.int(2, 4);
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, TAU), rr = i === 0 ? 0 : rng.range(10, 24);
        rocks.push({ x: px + Math.cos(a) * rr, y: py + Math.sin(a) * rr, r: rng.range(8, 15), seed: rng.int(1, 1e6) });
      }
      const cl = { x: px, y: py, rocks };
      const gridBak = this.grid.slice(), distBak = this.dist.slice();
      for (const r of rocks) this.stampRock(r);
      if (this.reachable()) { this.clusters.push(cl); this.reefs.push(...rocks); }
      else { this.grid = gridBak; this.dist = distBak; }
    }
    this.build();
  }

  // Add one rock to the grid and update the distance field around it
  stampRock(r) {
    const reach = r.r + 60;
    const x0 = Math.max(0, Math.floor((r.x - reach) / CELL)), x1 = Math.min(GW - 1, Math.ceil((r.x + reach) / CELL));
    const y0 = Math.max(0, Math.floor((r.y - reach) / CELL)), y1 = Math.min(GH - 1, Math.ceil((r.y + reach) / CELL));
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
      const i = gy * GW + gx;
      const dd = Math.hypot((gx + 0.5) * CELL - r.x, (gy + 0.5) * CELL - r.y) - r.r;
      if (dd <= 0) { if (this.grid[i] === T_WATER) this.grid[i] = T_REEF; this.dist[i] = 0; }
      else if (dd < this.dist[i]) this.dist[i] = dd;
    }
  }

  genCurrents(n) {
    const rng = this.rng, L = this.lighthouse;
    let tries = 0;
    while (this.currents.length < n && tries < 200) {
      tries++;
      const a = rng.range(0, TAU), r = rng.range(120, 340);
      const cx = L.x + Math.cos(a) * r, cy = L.y + Math.sin(a) * r;
      const dir = rng.range(0, TAU);
      const len = rng.range(520, 760);
      const ax = cx - Math.cos(dir) * len / 2, ay = cy - Math.sin(dir) * len / 2;
      const bx = cx + Math.cos(dir) * len / 2, by = cy + Math.sin(dir) * len / 2;
      const width = rng.range(60, 90);
      if (this.docks.some(dk => segPointDist(dk.berth.x, dk.berth.y, ax, ay, bx, by) < width + 60)) continue;
      if (segPointDist(L.x, L.y, ax, ay, bx, by) < 70) continue;
      if (this.currents.some(c => segPointDist(cx, cy, c.ax, c.ay, c.bx, c.by) < 160)) continue;
      this.currents.push({ ax, ay, bx, by, dx: Math.cos(dir), dy: Math.sin(dir), width, strength: rng.range(13, 19), len });
    }
  }

  currentAt(x, y) {
    let vx = 0, vy = 0;
    for (const c of this.currents) {
      const d = segPointDist(x, y, c.ax, c.ay, c.bx, c.by);
      if (d < c.width) {
        // fade near the ends of the band too
        const t = ((x - c.ax) * c.dx + (y - c.ay) * c.dy) / c.len;
        const endF = smooth(0, 0.15, t) * (1 - smooth(0.85, 1, t));
        const f = (1 - (d / c.width) ** 2) * c.strength * endF;
        vx += c.dx * f; vy += c.dy * f;
      }
    }
    return [vx, vy];
  }
}

if (typeof module !== 'undefined') module.exports = {};
