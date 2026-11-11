'use strict';
// The night simulation. Pure logic, no DOM, so node tests can run it at full speed.

const DT = 1 / 60;
const GLOAM_R = 640; // ships further than this from the lamp are out of the Gloam and steer safely
const NIGHT_INDEX = id => NIGHTS.findIndex(n => n.id === id);

function upgradeVal(levels, id) {
  const u = UPGRADES.find(x => x.id === id);
  const lv = clamp((levels && levels[id]) || 0, 0, u.vals.length - 1);
  return u.vals[lv];
}

function keeperStats(levels) {
  const L = id => upgradeVal(levels, id);
  return {
    range: BASE_RANGE * L('lens'),
    half: 0.2 * L('reflector'),
    turn: 1.75 * L('gears'),
    oilMax: L('cistern'),
    drain: 0.66 * L('burner'),
    focusDrain: 2.2 * L('burner'),
    burn: 1.0 * L('wick'),
    flares: L('flares'),
    hornCd: L('horn'),
    buoys: L('buoys'),
    harborR: L('harbor'),
    drift: L('charts'),
    twin: L('twin') > 0,
  };
}

class Night {
  constructor(opts) {
    this.opts = opts;
    this.endless = !!opts.endless;
    this.def = this.endless ? null : NIGHTS[opts.night];
    this.nightIdx = this.endless ? -1 : opts.night;
    const regionIdx = this.endless ? opts.region : this.def.region;
    const seed = opts.seed != null ? opts.seed : hashStr((this.def ? this.def.id : 'endless' + regionIdx) + ':run');
    this.rng = new RNG(seed);
    this.fxRng = new RNG(seed ^ 0x5bd1e995);
    const mapNight = this.endless ? { id: 'endless-' + regionIdx, docks: REGIONS[regionIdx].docks.map((_, i) => i), reefs: 8 } : this.def;
    this.map = new GameMap(regionIdx, mapNight, this.endless ? { reefs: 8, currents: regionIdx === 2 ? 2 : 0, seed: opts.mapSeed } : {});
    this.region = REGIONS[regionIdx];
    // creatures grow tougher further down the coast
    this.tough = 1 + 0.2 * (this.endless ? 1 : regionIdx);
    this.k = keeperStats(opts.upgrades || {});
    this.L = this.map.lighthouse;
    this.t = 0;
    this.state = 'prep';
    this.ships = []; this.monsters = []; this.flares = []; this.buoys = []; this.fogs = [];
    this.events = [];
    this.flags = {};
    this.nextId = 1;
    this.beam = { ang: -Math.PI / 2, target: -Math.PI / 2, focus: 0, focusOn: false, moved: 0 };
    this.oil = this.k.oilMax;
    this.flaresLeft = this.k.flares;
    this.hornT = 0; // cooldown remaining
    this.hornFx = 0;
    const idx = this.nightIdx;
    this.canFlare = this.endless || idx >= NIGHT_INDEX('s4');
    this.canHorn = this.endless || idx >= NIGHT_INDEX('s5');
    if (!this.canFlare) this.flaresLeft = 0;
    this.maxWrecks = this.endless ? ENDLESS.maxWrecks : this.def.maxWrecks;
    this.moon = this.endless ? 0.09 : this.def.moon;
    this.storm = this.endless ? 0 : this.def.storm || 0;
    this.stats = { saved: 0, wrecked: 0, coins: 0, value: 0, glooms: 0, wisps: 0, krakens: 0, freed: 0, wraiths: 0, flaresUsed: 0, horns: 0, oilUsed: 0, hits: 0 };
    this.wind = { x: 0, y: 0, a: this.rng.range(0, TAU), gust: 0 };
    this.flash = 0; this.nextLightning = 8 + this.rng.range(0, 8);
    this.boss = null;
    this.result = null;
    this.buildSchedule();
    const fogN = this.endless ? 0 : this.def.fog || 0;
    for (let i = 0; i < fogN; i++) this.addFog(true);
  }

  // ----- schedule
  buildSchedule() {
    const rng = this.rng;
    this.schedule = [];
    if (this.endless) { this.endlessT = 3; this.endlessMonT = 25; return; }
    const d = this.def;
    const list = [];
    for (const [type, n] of d.ships) for (let i = 0; i < n; i++) list.push(type);
    rng.shuffle(list);
    // the royal barque sails last, the first ship is always a cog
    const ri = list.indexOf('royal');
    if (ri >= 0) { list.splice(ri, 1); list.push('royal'); }
    const ci = list.indexOf('cog');
    if (ci > 0) { list.splice(ci, 1); list.unshift('cog'); }
    let t = 2.5;
    const docks = this.map.activeDocks;
    let lastSpawn = -1;
    list.forEach((type, i) => {
      let sp = rng.int(0, this.map.spawns.length - 1);
      if (sp === lastSpawn) sp = (sp + 1) % this.map.spawns.length;
      lastSpawn = sp;
      this.schedule.push({ t, kind: 'ship', type, spawn: sp, dock: docks[rng.int(0, docks.length - 1)] });
      t += rng.range(d.gap[0], d.gap[1]) * (i === 0 ? 1.3 : 1);
    });
    this.lastShipT = t;
    const span = Math.max(30, t - 20);
    for (const [kind, n] of d.monsters || []) {
      for (let i = 0; i < n; i++) {
        const mt = 16 + (span * (i + rng.range(0.1, 0.9))) / n;
        this.schedule.push({ t: mt, kind: 'monster', type: kind });
      }
    }
    if (d.boss) this.schedule.push({ t: 20, kind: 'boss', type: d.boss });
    this.schedule.sort((a, b) => a.t - b.t);
    this.schedIdx = 0;
    this.totalShips = list.length;
  }

  // ----- player input
  setAim(a) { this.beam.target = a; }
  setFocus(on) { this.beam.focusOn = !!on; }
  throwFlare(x, y) {
    if (this.state !== 'run' || !this.canFlare || this.flaresLeft <= 0) return false;
    this.flaresLeft--; this.stats.flaresUsed++;
    x = clamp(x, 10, WORLD_W - 10); y = clamp(y, 10, WORLD_H - 10);
    this.flares.push({ x, y, t: 0, life: 9, r: 125, fly: 0.55, sx: this.L.x, sy: this.L.y - 30 });
    this.flags.flared = true;
    this.events.push({ type: 'flare', x, y });
    return true;
  }
  horn() {
    if (this.state !== 'run' || !this.canHorn || this.hornT > 0) return false;
    this.hornT = this.k.hornCd; this.hornFx = 1; this.stats.horns++;
    this.flags.horned = true;
    this.events.push({ type: 'horn', x: this.L.x, y: this.L.y });
    for (const s of this.ships) if (s.state === 'sail') { s.err = 0; s.fix = 3; s.darkT = 0; }
    for (const m of this.monsters) {
      if (m.kind !== 'gloom' || m.dead) continue;
      const d = dist(m.x, m.y, this.L.x, this.L.y);
      if (d < 520) {
        if (m.state === 'latched') this.detachGloom(m);
        m.state = 'flee'; m.fleeT = 3.5;
        m.hp -= 0.5;
      }
    }
    return true;
  }
  buoyLimit() { return this.k.buoys; }
  placeBuoy(x, y) {
    if (this.state !== 'prep') return false;
    // tapping an existing buoy removes it
    const hit = this.buoys.findIndex(b => dist(b.x, b.y, x, y) < 22);
    if (hit >= 0) { this.buoys.splice(hit, 1); this.events.push({ type: 'buoyOff', x, y }); return true; }
    if (this.buoys.length >= this.k.buoys) return false;
    if (this.map.hitAt(x, y) !== T_WATER || this.map.distAt(x, y) < 6) return false;
    if (x < 10 || y < 10 || x > WORLD_W - 10 || y > WORLD_H - 10) return false;
    this.buoys.push({ x, y, ph: this.fxRng.range(0, TAU) });
    this.events.push({ type: 'buoy', x, y });
    return true;
  }
  begin() {
    if (this.state !== 'prep') return;
    this.state = 'run';
    this.events.push({ type: 'begin' });
  }

  // ----- lighting
  beamParams() {
    const f = this.beam.focus, k = this.k;
    const dry = this.oil <= 0;
    return {
      range: k.range * lerp(1, 1.42, f) * (dry ? 0.55 : 1),
      half: k.half * lerp(1, 0.42, f),
      power: lerp(1, 1.85, f) * (dry ? 0.42 : 1),
    };
  }
  beams() {
    const p = this.beamParams();
    const out = [{ ang: this.beam.ang, range: p.range, half: p.half, power: p.power }];
    if (this.k.twin) out.push({ ang: this.beam.ang + Math.PI, range: p.range * 0.72, half: this.k.half * 0.9, power: 0.62 * (this.oil <= 0 ? 0.42 : 1) });
    return out;
  }
  fogAt(x, y) {
    let f = 1;
    for (const g of this.fogs) {
      const d = dist(x, y, g.x, g.y);
      if (d < g.r) f *= 1 - g.dens * (1 - smooth(g.r * 0.45, g.r, d));
    }
    return f;
  }
  beamLight(x, y, beams) {
    const L = this.L;
    const dx = x - L.x, dy = y - L.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return 1.5;
    const a = Math.atan2(dy, dx);
    let I = 0;
    for (const b of beams) {
      if (d > b.range) continue;
      const da = angDiff(b.ang, a);
      if (Math.abs(da) > Math.PI / 2) continue;
      const lat = Math.abs(Math.sin(da)) * d;
      const w = 10 + d * Math.tan(b.half);
      if (lat > w) continue;
      const e = 1 - smooth(w * 0.55, w, lat);
      const fall = 1 - 0.5 * (d / b.range) ** 2;
      const tip = 1 - smooth(b.range * 0.86, b.range, d);
      I += b.power * e * fall * tip;
    }
    return I;
  }
  // Total light at a point. opts: {lightning, ignoreAura}
  lightAt(x, y, opts) {
    const beams = this._beams || this.beams();
    let I = this.beamLight(x, y, beams) * (this.fogs.length ? this.fogAt(x, y) : 1);
    const dL = dist(x, y, this.L.x, this.L.y);
    if (dL < 70) I += 0.9 * (1 - dL / 70);
    for (const f of this.flares) {
      if (f.t < f.fly) continue;
      const d = dist(x, y, f.x, f.y);
      if (d < f.r) I += 1.1 * (1 - smooth(f.r * 0.5, f.r, d)) * Math.min(1, (f.life - f.t) / 1.5);
    }
    for (const b of this.buoys) {
      const d = dist(x, y, b.x, b.y);
      if (d < 50) I += 0.7 * (1 - smooth(22, 50, d));
    }
    if (this.k.harborR) for (const k of this.map.activeDocks) {
      const dk = this.map.docks[k].berth;
      const d = dist(x, y, dk.x, dk.y);
      if (d < this.k.harborR) I += 0.75 * (1 - smooth(this.k.harborR * 0.5, this.k.harborR, d));
    }
    if (!(opts && opts.ignoreAura)) {
      for (const m of this.monsters) if (m.kind === 'wraith' && !m.dead && dist(x, y, m.x, m.y) < 95) I *= 0.18;
    }
    if (opts && opts.lightning) I += this.flash;
    return I;
  }

  // ----- spawning
  spawnShip(type, spawnIdx, dockIdx) {
    const T = SHIP_TYPES[type];
    const sp = this.map.spawns[spawnIdx];
    const dk = this.map.docks[dockIdx].berth;
    const s = {
      id: this.nextId++, kind: 'ship', type, T, x: sp.x, y: sp.y,
      ang: Math.atan2(dk.y - sp.y, dk.x - sp.x), v: T.speed * 0.8,
      hull: T.hull, maxHull: T.hull, dock: dockIdx, state: 'sail', lit: false, light: 0,
      litT: 0, darkT: 0, err: this.rng.gauss() * 0.12, bias: this.rng.gauss() * 0.05, bump: 0, fix: 0, latched: 0,
      t: 0, sinkT: 0, dockT: 0, grabbedBy: null, seed: this.rng.int(1, 1e6), wasLit: false, lostT: 0,
    };
    this.ships.push(s);
    this.events.push({ type: 'shipEnter', x: s.x, y: s.y, ship: s });
    return s;
  }

  darkSpot(minD, maxD) {
    for (let i = 0; i < 60; i++) {
      const a = this.rng.range(0, TAU), r = this.rng.range(minD, maxD);
      const x = this.L.x + Math.cos(a) * r, y = this.L.y + Math.sin(a) * r;
      if (x < 30 || y < 30 || x > WORLD_W - 30 || y > WORLD_H - 30) continue;
      if (this.map.distAt(x, y) < 30) continue;
      if (this.lightAt(x, y) > 0.08) continue;
      return { x, y };
    }
    return { x: this.rng.chance(0.5) ? 40 : WORLD_W - 40, y: this.rng.range(80, WORLD_H - 80) };
  }

  spawnMonster(kind) {
    const rng = this.rng;
    let m;
    if (kind === 'gloom') {
      const p = this.darkSpot(300, 620);
      m = { kind, x: p.x, y: p.y, ang: rng.range(0, TAU), v: 0, hp: MONSTER_TYPES.gloom.hp * this.tough, maxHp: MONSTER_TYPES.gloom.hp * this.tough, state: 'rise', t: 0, target: null, fleeT: 0, burnT: 0 };
    } else if (kind === 'wisp') {
      const cl = this.map.clusters.length ? rng.pick(this.map.clusters) : { x: this.L.x + 250, y: this.L.y };
      const used = this.monsters.filter(o => o.kind === 'wisp' && !o.dead);
      let best = cl;
      // prefer reef clusters that don't already have a wisp
      for (let i = 0; i < 6; i++) {
        const c = rng.pick(this.map.clusters.length ? this.map.clusters : [cl]);
        if (!used.some(w => dist(w.ax, w.ay, c.x, c.y) < 80)) { best = c; break; }
      }
      const a = rng.range(0, TAU);
      const ax = best.x + Math.cos(a) * 30, ay = best.y + Math.sin(a) * 30;
      m = { kind, x: ax, y: ay, ax, ay, hp: MONSTER_TYPES.wisp.hp, maxHp: MONSTER_TYPES.wisp.hp, t: 0, ph: rng.range(0, TAU), state: 'rise' };
    } else if (kind === 'kraken') {
      const p = this.krakenSpot();
      m = { kind, x: p.x, y: p.y, hp: MONSTER_TYPES.kraken.hp * this.tough, maxHp: MONSTER_TYPES.kraken.hp * this.tough, state: 'warn', t: 0, upT: 0, grab: null, ph: rng.range(0, TAU), hurtT: 0 };
    } else if (kind === 'wraith') {
      const a = rng.range(0, TAU);
      let x = this.L.x + Math.cos(a) * 1100, y = this.L.y + Math.sin(a) * 1100;
      x = clamp(x, -30, WORLD_W + 30); y = clamp(y, -30, WORLD_H + 30);
      m = { kind, x, y, ang: Math.atan2(this.L.y - y, this.L.x - x), hp: MONSTER_TYPES.wraith.hp * this.tough, maxHp: MONSTER_TYPES.wraith.hp * this.tough, state: 'sail', t: 0, burnT: 0, vis: 0 };
    } else return null;
    m.id = this.nextId++;
    this.monsters.push(m);
    this.events.push({ type: 'monster', kind, x: m.x, y: m.y, m });
    return m;
  }

  krakenSpot() {
    const rng = this.rng, map = this.map;
    for (let i = 0; i < 80; i++) {
      const s = map.spawnEntry(rng.pick(map.spawns));
      const d = map.docks[rng.pick(map.activeDocks)].berth;
      const t = rng.range(0.4, 0.75);
      const x = lerp(s.x, d.x, t) + rng.gauss() * 30, y = lerp(s.y, d.y, t) + rng.gauss() * 30;
      const dl = dist(x, y, this.L.x, this.L.y);
      if (dl < 140 || dl > this.k.range * 0.9) continue;
      if (map.distAt(x, y) < 50) continue;
      if (this.monsters.some(m => m.kind === 'kraken' && !m.dead && dist(m.x, m.y, x, y) < 200)) continue;
      return { x, y };
    }
    return { x: this.L.x + 260, y: this.L.y - 120 };
  }

  addFog(initial) {
    const rng = this.rng;
    const g = { x: rng.range(150, WORLD_W - 150), y: rng.range(120, WORLD_H - 120), r: rng.range(150, 210), dens: rng.range(0.55, 0.68), seed: rng.int(1, 1e6) };
    if (!initial) { g.x = -g.r; }
    // keep fog off the lighthouse at the start
    if (initial && dist(g.x, g.y, this.L.x, this.L.y) < 220) g.x = (g.x + 600) % WORLD_W;
    this.fogs.push(g);
  }

  // ----- main step
  step(dt = DT) {
    if (this.state !== 'run') return;
    this.t += dt;
    this._beams = null;
    this.stepBeam(dt);
    this._beams = this.beams();
    this.stepSchedule();
    this.stepWeather(dt);
    for (const f of this.flares) f.t += dt;
    this.flares = this.flares.filter(f => f.t < f.life);
    if (this.hornT > 0) this.hornT = Math.max(0, this.hornT - dt);
    if (this.hornFx > 0) this.hornFx = Math.max(0, this.hornFx - dt / 2.5);
    for (const s of this.ships) this.stepShip(s, dt);
    this.separateShips();
    for (const m of this.monsters) {
      if (m.dead) { m.deadT = (m.deadT || 0) + dt; continue; }
      if (m.kind === 'gloom') this.stepGloom(m, dt);
      else if (m.kind === 'wisp') this.stepWisp(m, dt);
      else if (m.kind === 'kraken') this.stepKraken(m, dt);
      else if (m.kind === 'wraith') this.stepWraith(m, dt);
    }
    if (this.boss) this.stepBoss(this.boss, dt);
    this.monsters = this.monsters.filter(m => !m.dead || m.deadT < 2);
    this.ships = this.ships.filter(s => !((s.state === 'docked' && s.dockT > 3) || (s.state === 'wrecked' && s.sinkT > 6)));
    if (this.endless) this.stepEndless(dt);
    this.checkEnd();
  }

  stepBeam(dt) {
    const b = this.beam;
    const prev = b.ang;
    b.ang = approachAng(b.ang, b.target, this.k.turn * dt);
    b.moved += Math.abs(angDiff(prev, b.ang));
    if (b.moved > 0.6) this.flags.aimed = true;
    const want = b.focusOn && this.oil > 0 ? 1 : 0;
    b.focus = approach(b.focus, want, dt * 3.2);
    if (b.focus > 0.8) { b.focusHeld = (b.focusHeld || 0) + dt; if (b.focusHeld > 0.6) this.flags.focused = true; }
    const use = (this.k.drain + this.k.focusDrain * b.focus + (this.k.twin ? 0.18 : 0)) * dt;
    if (this.oil > 0) {
      this.oil = Math.max(0, this.oil - use); this.stats.oilUsed += use;
      if (this.oil === 0) this.events.push({ type: 'dry' });
    }
  }

  stepSchedule() {
    while (this.schedIdx < this.schedule.length && this.schedule[this.schedIdx].t <= this.t + 4) {
      const e = this.schedule[this.schedIdx];
      if (e.kind === 'ship' && !e.warned) {
        e.warned = true;
        const sp = this.map.spawns[e.spawn];
        this.events.push({ type: 'incoming', x: sp.x, y: sp.y, shipType: e.type, dock: e.dock, at: e.t });
      }
      if (e.t > this.t) break;
      if (e.kind === 'ship') this.spawnShip(e.type, e.spawn, e.dock);
      else if (e.kind === 'monster') this.spawnMonster(e.type);
      else if (e.kind === 'boss') this.spawnBoss();
      this.schedIdx++;
    }
  }

  stepWeather(dt) {
    const w = this.wind, rng = this.rng;
    w.a += rng.gauss() * 0.05 * Math.sqrt(dt * 60) * dt * 4;
    const mag = this.storm * (7 + 9 * Math.max(0, Math.sin(this.t * 0.37) * Math.sin(this.t * 0.11 + 1)));
    w.x = Math.cos(w.a) * mag; w.y = Math.sin(w.a) * mag;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.6);
    if (this.storm > 0) {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0) {
        this.flash = 1;
        this.nextLightning = rng.range(13, 24) / (0.5 + this.storm * 0.6);
        for (const s of this.ships) if (s.state === 'sail') { s.fix = Math.max(s.fix, 0.6); s.err *= 0.3; }
        this.events.push({ type: 'lightning', x: rng.range(100, WORLD_W - 100), y: rng.range(60, WORLD_H - 200), seed: rng.int(1, 1e6) });
      }
    }
    for (const g of this.fogs) {
      g.x += (6 + w.x * 0.6) * dt; g.y += (Math.sin(this.t * 0.05 + g.seed) * 2 + w.y * 0.6) * dt;
      if (g.x - g.r > WORLD_W) { g.x = -g.r; g.y = rng.range(120, WORLD_H - 120); }
      if (g.y < -g.r) g.y = WORLD_H + g.r; else if (g.y > WORLD_H + g.r) g.y = -g.r;
    }
  }

  shipLight(s) {
    return this.lightAt(s.x, s.y, { lightning: true });
  }

  stepShip(s, dt) {
    s.t += dt;
    if (s.hurtT > 0) s.hurtT -= dt;
    if (s.state === 'docked') { s.dockT += dt; return; }
    if (s.state === 'wrecked') { s.sinkT += dt; return; }
    const map = this.map, T = s.T;
    const dk = map.docks[s.dock].berth;
    s.light = this.shipLight(s);
    if (s.fix > 0) s.fix -= dt;
    s.lit = s.light >= LIT_T || s.fix > 0;
    // out on the open sea, beyond the Gloam, captains can see well enough
    s.clear = dist(s.x, s.y, this.L.x, this.L.y) > GLOAM_R;
    if (s.lit && !s.wasLit && s.light >= LIT_T) this.flags.shipLit = true;
    if (s.state === 'grabbed') {
      const k = s.grabbedBy;
      if (!k || k.dead || k.grab !== s) { s.state = 'sail'; s.grabbedBy = null; }
      else {
        const a = Math.atan2(s.y - k.y, s.x - k.x);
        const d = dist(s.x, s.y, k.x, k.y);
        const tgt = 26;
        s.x = k.x + Math.cos(a) * approach(d, tgt, 30 * dt);
        s.y = k.y + Math.sin(a) * approach(d, tgt, 30 * dt);
        s.ang += Math.sin(this.t * 3 + s.seed) * dt * 0.8;
        s.v = 0;
        this.damageShip(s, 6.5 * dt, 'kraken');
        return;
      }
    }
    const dD = dist(s.x, s.y, dk.x, dk.y);
    let desired;
    if (s.lit || s.clear) {
      if (s.lit) s.litT += dt;
      s.darkT = 0; s.lostT = 0;
      s.err = approach(s.err, 0, 1.6 * dt);
      const [fx, fy] = map.flowDir(s.dock, s.x + Math.cos(s.ang) * 8, s.y + Math.sin(s.ang) * 8);
      let vx = fx, vy = fy;
      // seen dangers: steer around active krakens and the boss
      for (const m of this.monsters) {
        if (m.kind !== 'kraken' || m.dead || m.state === 'down') continue;
        const d = dist(s.x, s.y, m.x, m.y);
        if (d < 130 && d > 1) { const f = (130 - d) / 130 * 1.4; vx += (s.x - m.x) / d * f; vy += (s.y - m.y) / d * f; }
      }
      desired = Math.atan2(vy, vx);
    } else {
      s.darkT += dt; s.litT = 0;
      const drift = this.k.drift * (1 + Math.min(s.darkT, 24) / 10);
      s.err += (this.rng.gauss() * Math.sqrt(dt) * 0.3 + s.bias * dt) * drift;
      s.err = clamp(s.err, -1.15, 1.15);
      desired = Math.atan2(dk.y - s.y, dk.x - s.x) + s.err;
      // false lights lure lost ships
      let lure = null, ld = 280;
      for (const m of this.monsters) {
        if (m.kind !== 'wisp' || m.dead || m.state === 'rise') continue;
        const d = dist(s.x, s.y, m.x, m.y);
        if (d < ld) { ld = d; lure = m; }
      }
      if (lure) {
        const la = Math.atan2(lure.y - s.y, lure.x - s.x);
        desired += angDiff(desired, la) * 0.9 * (1 - ld / 280 * 0.6);
      }
      if (Math.abs(s.err) > 0.45 || lure) s.lostT += dt; else s.lostT = Math.max(0, s.lostT - dt);
    }
    // final approach: the pier lights are close enough to steer by
    if (dD < 70) desired = Math.atan2(dk.y - s.y, dk.x - s.x);
    // ships that wander off the chart turn back
    if (s.t > 6 && (s.x < -20 || s.y < -20 || s.x > WORLD_W + 20 || s.y > WORLD_H + 20)) { desired = Math.atan2(dk.y - s.y, dk.x - s.x); s.err *= 0.9; }
    s.wasLit = s.lit;
    if (s.bump > 0) s.bump -= dt;
    else s.ang = approachAng(s.ang, desired, T.turn * dt * (s.lit || s.clear ? 1 : 0.8));
    let target = T.speed * (s.lit || s.clear ? 1 : 0.78) * (1 - 0.16 * Math.min(3, s.latched));
    if (dD < 60) target = Math.min(target, 14 + dD * 0.4);
    s.v = approach(s.v, target, 18 * dt);
    const [cx, cy] = map.currentAt(s.x, s.y);
    const nx = s.x + (Math.cos(s.ang) * s.v + cx + this.wind.x * 0.5) * dt;
    const ny = s.y + (Math.sin(s.ang) * s.v + cy + this.wind.y * 0.5) * dt;
    s.x = nx; s.y = ny;
    // collisions with reefs and shore: test the bow and both shoulders
    const ca = Math.cos(s.ang), sa = Math.sin(s.ang);
    const hl = T.len * 0.46, hb = T.beam * 0.42;
    const pts = [[s.x + ca * hl, s.y + sa * hl], [s.x + ca * hl * 0.3 - sa * hb, s.y + sa * hl * 0.3 + ca * hb], [s.x + ca * hl * 0.3 + sa * hb, s.y + sa * hl * 0.3 - ca * hb], [s.x - ca * hl * 0.8, s.y - sa * hl * 0.8]];
    let hit = 0, hp = null;
    for (const p of pts) { const h = map.hitAt(p[0], p[1]); if (h) { hit = h; hp = p; break; } }
    if (hit && dD > 16) {
      const [gx, gy] = this.obstacleNormal(hp[0], hp[1], s);
      // push out
      for (let i = 0; i < 12 && pts.some(p => map.hitAt(p[0] + gx * i * 1.5, p[1] + gy * i * 1.5)); i++) { s.x += gx * 1.5; s.y += gy * 1.5; pts.forEach(p => { p[0] += gx * 1.5; p[1] += gy * 1.5; }); }
      if (s.bump <= 0) {
        const dot = Math.max(0.25, -(ca * gx + sa * gy));
        const dmg = (hit === T_REEF ? 1 : 0.75) * (9 + s.v * 0.95) * (0.5 + dot * 0.7);
        this.damageShip(s, dmg, 'reef');
        this.stats.hits++;
        this.events.push({ type: 'hit', x: hp[0], y: hp[1], ship: s, reef: hit === T_REEF, dmg });
        // reflect off the obstacle
        const rx = ca - 2 * (ca * gx + sa * gy) * gx, ry = sa - 2 * (ca * gx + sa * gy) * gy;
        s.ang = Math.atan2(ry * 0.6 + gy * 0.4, rx * 0.6 + gx * 0.4);
        s.v *= 0.25; s.bump = 0.9;
        s.err = this.rng.gauss() * 0.5; // shaken crew
      }
    }
    if (s.state === 'sail' && dD < 20) this.dockShip(s);
  }

  obstacleNormal(x, y, s) {
    // nearest reef rock gives an exact normal, otherwise use the distance field
    let best = null, bd = 1e9;
    for (const r of this.map.reefs) { const d = dist(x, y, r.x, r.y) - r.r; if (d < bd) { bd = d; best = r; } }
    if (best && bd < 3) { const l = dist(x, y, best.x, best.y) || 1; return [(x - best.x) / l, (y - best.y) / l]; }
    let [gx, gy] = this.map.distGrad(x, y);
    if (!isFinite(gx) || (gx === 0 && gy === 0)) { gx = s.x - x; gy = s.y - y; const l = Math.hypot(gx, gy) || 1; gx /= l; gy /= l; }
    return [gx, gy];
  }

  separateShips() {
    const sh = this.ships;
    for (let i = 0; i < sh.length; i++) {
      const a = sh[i]; if (a.state !== 'sail') continue;
      for (let j = i + 1; j < sh.length; j++) {
        const b = sh[j]; if (b.state !== 'sail') continue;
        const min = (a.T.len + b.T.len) * 0.36;
        const d = dist(a.x, a.y, b.x, b.y);
        if (d < min && d > 0.01) {
          const push = (min - d) * 0.5, ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
          a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
        }
      }
    }
  }

  damageShip(s, dmg, src) {
    if (s.state === 'wrecked' || s.state === 'docked') return;
    s.hull -= dmg;
    s.hurtT = 0.35;
    if (s.hull <= 0) this.wreckShip(s, src);
  }

  wreckShip(s, src) {
    s.hull = 0; s.state = 'wrecked'; s.sinkT = 0;
    this.stats.wrecked++;
    if (s.grabbedBy) { s.grabbedBy.grab = null; s.grabbedBy = null; }
    for (const m of this.monsters) if (m.kind === 'gloom' && m.state === 'latched' && m.target === s) { m.state = 'hunt'; m.target = null; }
    s.latched = 0;
    this.events.push({ type: 'wreck', x: s.x, y: s.y, ship: s, src });
    if (s.T.vip) this.lose('vip');
    else if (this.endless ? this.stats.wrecked >= this.maxWrecks : this.stats.wrecked > this.maxWrecks) this.lose(this.endless ? 'endless' : 'wrecks');
  }

  dockShip(s) {
    s.state = 'docked'; s.dockT = 0;
    let value = s.T.value;
    let rush = 0;
    if (s.T.rush) rush = Math.round(s.T.value * 0.9 * clamp(1 - s.t / s.T.rush, 0, 1));
    const hullBonus = s.hull >= s.maxHull ? Math.round(value * 0.15) : 0;
    value += rush + hullBonus;
    this.stats.saved++;
    this.stats.value += value;
    this.oil = Math.min(this.k.oilMax, this.oil + s.T.oil);
    for (const m of this.monsters) if (m.kind === 'gloom' && m.state === 'latched' && m.target === s) this.detachGloom(m);
    s.latched = 0;
    this.flags.docked = true;
    this.events.push({ type: 'dock', x: s.x, y: s.y, ship: s, value, rush, hullBonus, oil: s.T.oil });
  }

  // ----- monsters
  detachGloom(m) {
    if (m.target) m.target.latched = Math.max(0, m.target.latched - 1);
    m.state = 'hunt'; m.target = null;
  }

  burn(m, I, dt, mult = 1) {
    const dmg = this.k.burn * I * dt * mult;
    if (dmg <= 0) return false;
    m.hp -= dmg; m.burnT = 0.15;
    return true;
  }

  stepGloom(m, dt) {
    m.t += dt;
    if (m.burnT > 0) m.burnT -= dt;
    if (m.state === 'rise') { if (m.t > 1.4) m.state = 'hunt'; return; }
    const I = this.lightAt(m.x, m.y);
    if (I > 0.1) this.burn(m, I, dt, I > 0.25 ? 1 : 0.4);
    if (m.hp <= 0) {
      m.dead = true; m.deadT = 0;
      if (m.state === 'latched') this.detachGloom(m);
      this.stats.glooms++; this.stats.coins += 2;
      this.flags.gloomKilled = true;
      this.events.push({ type: 'gloomDie', x: m.x, y: m.y });
      return;
    }
    if (m.state === 'latched') {
      const s = m.target;
      if (!s || s.state !== 'sail' && s.state !== 'grabbed') { this.detachGloom(m); return; }
      const ca = Math.cos(s.ang + m.side), sa = Math.sin(s.ang + m.side);
      m.x = s.x + ca * s.T.beam * 0.6 + Math.cos(s.ang) * m.along;
      m.y = s.y + sa * s.T.beam * 0.6 + Math.sin(s.ang) * m.along;
      m.ang = s.ang + m.side + Math.PI + Math.sin(m.t * 6) * 0.3;
      this.damageShip(s, (4 + this.tough * 1.2) * dt, 'gloom');
      return;
    }
    let tx, ty, speed = MONSTER_TYPES.gloom.speed * (0.94 + this.tough * 0.06);
    if (m.state === 'flee') {
      m.fleeT -= dt;
      const a = Math.atan2(m.y - this.L.y, m.x - this.L.x);
      tx = m.x + Math.cos(a) * 100; ty = m.y + Math.sin(a) * 100; speed *= 1.5;
      if (m.fleeT <= 0) m.state = 'hunt';
    } else {
      // hunt the nearest ship, preferring ones in the dark
      if (!m.target || m.target.state !== 'sail' || this.rng.chance(dt * 0.5)) {
        let best = null, bs = 1e9;
        for (const s of this.ships) {
          if (s.state !== 'sail' || s.latched >= 2) continue;
          const sc = dist(m.x, m.y, s.x, s.y) * (s.lit ? 1.6 : 1);
          if (sc < bs) { bs = sc; best = s; }
        }
        m.target = best;
      }
      if (m.target) { tx = m.target.x; ty = m.target.y; }
      else { tx = this.L.x + Math.cos(m.t * 0.2 + m.id) * 380; ty = this.L.y + Math.sin(m.t * 0.2 + m.id) * 300; speed *= 0.5; }
    }
    let want = Math.atan2(ty - m.y, tx - m.x);
    // shy away from light ahead
    const ahead = this.lightAt(m.x + Math.cos(want) * 34, m.y + Math.sin(want) * 34);
    if (ahead > 0.28 && m.state !== 'flee') {
      const l = this.lightAt(m.x + Math.cos(want - 1.2) * 34, m.y + Math.sin(want - 1.2) * 34);
      const r = this.lightAt(m.x + Math.cos(want + 1.2) * 34, m.y + Math.sin(want + 1.2) * 34);
      want += l < r ? -1.2 : 1.2;
      speed *= 1.2;
    }
    if (I > 0.25) speed *= 1.25;
    // eels keep to the water: slide along the shore instead of crossing land
    const lx = m.x + Math.cos(want) * 16, ly = m.y + Math.sin(want) * 16;
    if (this.isLand(lx, ly)) {
      const l = this.isLand(m.x + Math.cos(want - 1.3) * 16, m.y + Math.sin(want - 1.3) * 16);
      want += l ? 1.3 : -1.3;
    }
    m.ang = approachAng(m.ang, want, 3.2 * dt);
    m.v = approach(m.v, speed, 60 * dt);
    const [cx, cy] = this.map.currentAt(m.x, m.y);
    m.x += (Math.cos(m.ang) * m.v + cx * 0.5) * dt; m.y += (Math.sin(m.ang) * m.v + cy * 0.5) * dt;
    m.x = clamp(m.x, -40, WORLD_W + 40); m.y = clamp(m.y, -40, WORLD_H + 40);
    if (this.isLand(m.x, m.y)) { const [gx, gy] = this.map.distGrad(m.x, m.y); m.x += gx * 2; m.y += gy * 2; }
    if (m.state === 'hunt' && m.target) {
      const s = m.target;
      if (dist(m.x, m.y, s.x, s.y) < s.T.len * 0.5 + 6 && s.latched < 2) {
        m.state = 'latched'; s.latched++;
        m.side = this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
        m.along = this.rng.range(-s.T.len * 0.25, s.T.len * 0.25);
        this.events.push({ type: 'latch', x: m.x, y: m.y, ship: s });
      }
    }
  }

  stepWisp(m, dt) {
    m.t += dt;
    if (m.state === 'rise') { if (m.t > 1.5) m.state = 'lure'; }
    m.x = m.ax + Math.sin(m.t * 0.7 + m.ph) * 12; m.y = m.ay + Math.cos(m.t * 0.5 + m.ph) * 9;
    const I = this.beamLight(m.x, m.y, this._beams) * (this.fogs.length ? this.fogAt(m.x, m.y) : 1) + this.flareLight(m.x, m.y);
    if (I > 0.2) this.burn(m, I, dt);
    else m.hp = Math.min(m.maxHp, m.hp + dt * 0.25);
    if (m.hp <= 0) {
      m.dead = true; m.deadT = 0;
      this.stats.wisps++; this.stats.coins += 3;
      this.flags.wispKilled = true;
      this.events.push({ type: 'wispDie', x: m.x, y: m.y });
    }
  }

  isLand(x, y) {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return false;
    return this.map.land[cellOf(x, y)] === T_LAND;
  }

  flareLight(x, y) {
    let I = 0;
    for (const f of this.flares) {
      if (f.t < f.fly) continue;
      const d = dist(x, y, f.x, f.y);
      if (d < f.r) I += 1.1 * (1 - smooth(f.r * 0.5, f.r, d)) * Math.min(1, (f.life - f.t) / 1.5);
    }
    return I;
  }

  stepKraken(m, dt) {
    m.t += dt;
    if (m.hurtT > 0) m.hurtT -= dt;
    if (m.state === 'warn') {
      if (m.t > 3.2) { m.state = 'up'; m.upT = 0; this.events.push({ type: 'krakenUp', x: m.x, y: m.y }); }
      return;
    }
    if (m.state === 'down') {
      if (m.t - m.downAt > 2) { m.dead = true; m.deadT = 0; }
      return;
    }
    m.upT += dt;
    const I = this.lightAt(m.x, m.y);
    const eff = Math.max(0, I - 0.5) * 2;
    if (eff > 0) {
      this.burn(m, eff, dt);
      m.hurtT = 0.2;
      this.flags.krakenHurt = true;
    } else m.hp = Math.min(m.maxHp, m.hp + 0.35 * dt);
    if (!m.grab) {
      for (const s of this.ships) {
        if (s.state !== 'sail') continue;
        if (dist(s.x, s.y, m.x, m.y) < 78) {
          m.grab = s; s.state = 'grabbed'; s.grabbedBy = m;
          this.events.push({ type: 'grab', x: s.x, y: s.y, ship: s });
          break;
        }
      }
    }
    const beaten = m.hp <= 0;
    if (beaten || m.upT > 42) {
      if (m.grab) {
        const s = m.grab;
        s.state = s.hull > 0 ? 'sail' : s.state; s.grabbedBy = null; s.bump = 0.4; s.err = 0; s.fix = 1.5;
        m.grab = null;
        if (beaten) { this.stats.freed++; this.events.push({ type: 'freed', x: s.x, y: s.y }); }
      }
      if (beaten) { this.stats.krakens++; this.stats.coins += 10; }
      m.state = 'down'; m.downAt = m.t;
      this.events.push({ type: beaten ? 'krakenBeaten' : 'krakenDown', x: m.x, y: m.y });
    }
  }

  stepWraith(m, dt) {
    m.t += dt;
    if (m.burnT > 0) m.burnT -= dt;
    const I = this.lightAt(m.x, m.y, { ignoreAura: true });
    m.vis = approach(m.vis, clamp(I * 1.4 + this.flash, 0.12, 1), dt * 3);
    const eff = Math.max(0, I - 0.35) * 1.6;
    if (eff > 0) { this.burn(m, eff, dt); this.flags.wraithHurt = true; }
    if (m.hp <= 0) {
      m.dead = true; m.deadT = 0; this.stats.wraiths++; this.stats.coins += 15;
      this.events.push({ type: 'wraithDie', x: m.x, y: m.y });
      return;
    }
    const want = Math.atan2(this.L.y - m.y, this.L.x - m.x) + Math.sin(m.t * 0.3) * 0.35;
    m.ang = approachAng(m.ang, want, 0.6 * dt);
    const sp = MONSTER_TYPES.wraith.speed * (eff > 0 ? 0.55 : 1);
    m.x += Math.cos(m.ang) * sp * dt; m.y += Math.sin(m.ang) * sp * dt;
    if (dist(m.x, m.y, this.L.x, this.L.y) < 80) {
      const drain = Math.min(this.oil, 35);
      this.oil -= drain;
      m.dead = true; m.deadT = 0; m.drained = true;
      this.events.push({ type: 'wraithDrain', x: m.x, y: m.y, drain });
      if (this.oil <= 0) this.events.push({ type: 'dry' });
    }
  }

  spawnBoss() {
    const B = MONSTER_TYPES.leviathan;
    this.boss = { kind: 'leviathan', id: this.nextId++, x: this.L.x, y: this.L.y - 400, ang: 0, hp: B.hp, maxHp: B.hp, stage: 0, chunk: B.hp / 3, state: 'deep', t: 0, stateT: 6, target: null, seg: [], hurtT: 0, roarT: 0 };
    this.events.push({ type: 'bossWake' });
  }

  stepBoss(b, dt) {
    b.t += dt; b.stateT -= dt;
    if (b.hurtT > 0) b.hurtT -= dt;
    if (b.dead) return;
    const pickTarget = () => {
      let best = null, bs = -1e9;
      for (const s of this.ships) {
        if (s.state !== 'sail') continue;
        const d = dist(s.x, s.y, this.L.x, this.L.y);
        if (d > this.k.range * 1.1) continue;
        const sc = -Math.abs(d - 300) + (s.T.vip ? 60 : 0) + this.rng.range(0, 80);
        if (sc > bs) { bs = sc; best = s; }
      }
      return best;
    };
    if (b.state === 'deep') {
      if (b.stateT <= 0) {
        const s = pickTarget();
        b.target = s;
        let x, y;
        if (s) {
          const a = s.ang + this.rng.range(-0.6, 0.6);
          x = s.x + Math.cos(a) * 170; y = s.y + Math.sin(a) * 170;
        } else {
          const a = this.rng.range(0, TAU); x = this.L.x + Math.cos(a) * 330; y = this.L.y + Math.sin(a) * 280;
        }
        x = clamp(x, 60, WORLD_W - 60); y = clamp(y, 60, WORLD_H - 60);
        for (let i = 0; i < 30 && this.map.distAt(x, y) < 45; i++) { const a = this.rng.range(0, TAU); x = clamp(x + Math.cos(a) * 40, 60, WORLD_W - 60); y = clamp(y + Math.sin(a) * 40, 60, WORLD_H - 60); }
        b.x = x; b.y = y; b.state = 'warn'; b.stateT = 2.6;
        this.events.push({ type: 'bossWarn', x, y });
      }
    } else if (b.state === 'warn') {
      if (b.stateT <= 0) {
        b.state = 'up'; b.stateT = 15; b.chunkLeft = b.hp - (b.maxHp - b.chunk * (b.stage + 1));
        const tx = b.target ? b.target.x : this.L.x, ty = b.target ? b.target.y : this.L.y;
        b.ang = Math.atan2(ty - b.y, tx - b.x);
        b.seg = []; for (let i = 0; i < 26; i++) b.seg.push({ x: b.x - Math.cos(b.ang) * i * 3, y: b.y - Math.sin(b.ang) * i * 3 });
        b.bit = false;
        this.events.push({ type: 'bossUp', x: b.x, y: b.y });
      }
    } else if (b.state === 'up') {
      const I = this.lightAt(b.x, b.y);
      const eff = Math.max(0, I - 0.55) * 2.2;
      if (eff > 0) { b.hp -= this.k.burn * eff * dt; b.hurtT = 0.2; this.flags.bossHurt = true; }
      const stageFloor = b.maxHp - b.chunk * (b.stage + 1);
      if (b.target && b.target.state !== 'sail') b.target = b.bit ? null : pickTarget();
      let tx, ty;
      if (b.target && !b.bit) { tx = b.target.x; ty = b.target.y; }
      else { tx = b.x + Math.cos(b.ang) * 100; ty = b.y + Math.sin(b.ang) * 100; if (!b.target && !b.bit) { tx = this.L.x; ty = this.L.y; } }
      const want = Math.atan2(ty - b.y, tx - b.x);
      b.ang = approachAng(b.ang, want, 1.5 * dt);
      const sp = MONSTER_TYPES.leviathan.speed * (eff > 0 ? 0.45 : 1) * (b.bit ? 1.3 : 1);
      // the serpent will not cross land: it turns aside, and dives if it runs aground
      const ax = b.x + Math.cos(b.ang) * 40, ay = b.y + Math.sin(b.ang) * 40;
      if (this.isLand(ax, ay)) { const [gx, gy] = this.map.distGrad(ax, ay); b.ang = approachAng(b.ang, Math.atan2(gy, gx), 2.5 * dt); }
      b.x += Math.cos(b.ang) * sp * dt; b.y += Math.sin(b.ang) * sp * dt;
      if (this.isLand(b.x, b.y)) { b.state = 'dive'; b.stateT = 1.4; return; }
      // body follows the head
      let px = b.x, py = b.y;
      for (const sg of b.seg) {
        const d = dist(px, py, sg.x, sg.y);
        if (d > 9) { sg.x = px + (sg.x - px) / d * 9; sg.y = py + (sg.y - py) / d * 9; }
        px = sg.x; py = sg.y;
      }
      if (!b.bit && b.target && dist(b.x, b.y, b.target.x, b.target.y) < 28) {
        const s = b.target;
        this.damageShip(s, 48, 'boss');
        if (s.state === 'sail') { s.bump = 1; s.v = 0; s.ang += 1.2; }
        b.bit = true; b.stateT = Math.min(b.stateT, 1.6);
        this.events.push({ type: 'bossBite', x: s.x, y: s.y });
      }
      if (!b.target && dist(b.x, b.y, this.L.x, this.L.y) < 90 && !b.bit) {
        const drain = Math.min(this.oil, 30); this.oil -= drain; b.bit = true; b.stateT = Math.min(b.stateT, 1.2);
        this.events.push({ type: 'wraithDrain', x: b.x, y: b.y, drain });
      }
      if (b.hp <= stageFloor) {
        b.hp = stageFloor; b.stage++;
        this.events.push({ type: 'bossHurt', x: b.x, y: b.y, stage: b.stage });
        if (b.stage >= 3) {
          b.dead = true; b.state = 'dying'; b.stateT = 3;
          this.stats.coins += 120;
          this.events.push({ type: 'bossDie', x: b.x, y: b.y });
          for (const m of this.monsters) if (m.kind === 'gloom' && !m.dead) { m.hp = 0; }
          return;
        }
        for (let i = 0; i < 2; i++) this.spawnMonster('gloom');
        b.state = 'dive'; b.stateT = 1.4;
      } else if (b.stateT <= 0) { b.state = 'dive'; b.stateT = 1.4; }
    } else if (b.state === 'dive') {
      b.x += Math.cos(b.ang) * 40 * dt; b.y += Math.sin(b.ang) * 40 * dt;
      if (b.stateT <= 0) { b.state = 'deep'; b.stateT = 5 + this.rng.range(0, 3); b.seg = []; }
    }
  }

  // ----- endless mode
  stepEndless(dt) {
    const m = this.t / 60; // minutes
    this.endlessT -= dt;
    if (this.endlessT <= 0) {
      const pool = ['cog', 'cog', 'cog', 'skiff', 'trawler'];
      if (m > 1.5) pool.push('packet', 'skiff');
      if (m > 3) pool.push('galleon', 'trawler');
      if (m > 6) pool.push('galleon', 'packet');
      const type = this.rng.pick(pool);
      const sp = this.rng.int(0, this.map.spawns.length - 1);
      const dock = this.rng.pick(this.map.activeDocks);
      this.spawnShip(type, sp, dock);
      this.totalShips = (this.totalShips || 0) + 1;
      this.endlessT = Math.max(4.2, 12 - m * 0.75) * this.rng.range(0.8, 1.2);
    }
    this.endlessMonT -= dt;
    if (this.endlessMonT <= 0) {
      const pool = ['gloom', 'gloom', 'gloom'];
      if (m > 2) pool.push('wisp');
      if (m > 4) pool.push('kraken');
      if (m > 6) pool.push('wraith');
      const kind = this.rng.pick(pool);
      const alive = this.monsters.filter(o => o.kind === kind && !o.dead).length;
      if (!(kind === 'kraken' && alive >= 2) && !(kind === 'wraith' && alive >= 2) && !(kind === 'wisp' && alive >= 4)) this.spawnMonster(kind);
      this.endlessMonT = Math.max(3, 11 - m * 0.8) * this.rng.range(0.7, 1.3);
    }
    if (m > 3 && this.fogs.length < Math.min(3, Math.floor((m - 3) / 2) + 1)) this.addFog(false);
    if (m > 5) this.storm = Math.min(1, (m - 5) / 4);
  }

  // ----- end conditions
  lose(reason) {
    if (this.state !== 'run') return;
    this.state = 'lost';
    this.result = this.makeResult(false, reason);
    this.events.push({ type: 'lost', reason });
  }

  checkEnd() {
    if (this.state !== 'run' || this.endless) return;
    if (this.schedIdx < this.schedule.length) return;
    if (this.ships.some(s => s.state === 'sail' || s.state === 'grabbed')) return;
    if (this.boss && !this.boss.dead) return;
    if (this.boss && this.boss.dead && this.boss.stateT > 0) { this.boss.stateT -= DT; return; }
    this.state = 'won';
    this.result = this.makeResult(true);
    this.events.push({ type: 'won' });
  }

  endEndless() {
    if (this.state !== 'run') return;
    this.state = 'lost';
    this.result = this.makeResult(false, 'endless');
  }

  makeResult(won, reason) {
    const st = this.stats;
    const total = this.endless ? st.saved + st.wrecked : this.totalShips;
    let stars = 0;
    if (won) stars = st.wrecked === 0 ? 3 : st.wrecked <= 1 ? 2 : 1;
    const base = st.value + st.coins;
    const coins = won ? base + 15 : Math.round(base * (this.endless ? 0.6 : 0.4));
    return { won, reason, stars, saved: st.saved, wrecked: st.wrecked, total, coins, oilFrac: this.oil / this.k.oilMax, time: this.t, stats: Object.assign({}, st) };
  }

  // ----- helpers for UI and bot
  liveShips() { return this.ships.filter(s => s.state === 'sail' || s.state === 'grabbed'); }
  remaining() {
    if (this.endless) return null;
    const spawned = this.schedule.slice(0, this.schedIdx).filter(e => e.kind === 'ship').length;
    return this.totalShips - spawned + this.liveShips().length;
  }
}

if (typeof module !== 'undefined') module.exports = {};
