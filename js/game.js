'use strict';
// A running night: steps the simulation, turns its events into sound and effects, and handles input.

class Tutorial {
  constructor(steps) { this.steps = steps || []; this.i = 0; this.t = 0; this.done = !this.steps.length; }
  update(dt, n) {
    if (this.done || n.state !== 'run') return null;
    const st = this.steps[this.i];
    this.t += dt;
    if (st.delay && this.t < st.delay) return null;
    let ok = false;
    if (st.until.startsWith('time:')) ok = this.t >= (st.delay || 0) + parseFloat(st.until.slice(5));
    else ok = !!n.flags[st.until] && this.t > (st.delay || 0) + 2.2;
    if (ok) { this.i++; this.t = 0; if (this.i >= this.steps.length) { this.done = true; return null; } }
    const cur = this.steps[this.i];
    if (cur.delay && this.t < cur.delay) return null;
    return cur.text;
  }
}

class Match {
  constructor(app, opts) {
    this.app = app;
    this.opts = opts;
    this.attract = !!opts.attract;
    const upgrades = this.attract ? { lens: 2, reflector: 2, gears: 2, wick: 2, harbor: 1 } : Save.data.upgrades;
    this.n = new Night({ night: opts.night, endless: opts.endless, region: opts.region, upgrades, seed: opts.seed });
    this.r = app.renderer;
    this.r.setNight(this.n);
    this.view = { darkness: 0, duskAlpha: 0.42, incoming: [], reticle: null, ghostBuoy: null, badges: Save.data.settings.badges, shake: Save.data.settings.shake };
    this.paused = false;
    this.acc = 0;
    this.input = { aimX: null, aimY: null, mouseFocus: false, keyFocus: false, btnFocus: false, keyRot: 0, flareArmed: false, pointerWorld: null, usingKeys: false };
    this.endT = 0;
    this.finished = false;
    this.burnSfxT = 0;
    if (this.attract) {
      this.bot = new KeeperBot(this.n, 0.9);
      this.n.begin();
      this.view.darkness = 1;
    }
    const def = this.n.def;
    this.tut = new Tutorial(!this.attract && def && def.tutorial && Save.data.settings.hints ? TUTORIALS[def.tutorial] : []);
    this.hint = null;
    this.realT = 0;
  }

  get state() { return this.n.state; }

  begin() {
    if (this.n.state !== 'prep') return;
    this.n.begin();
    this.app.audio.play('begin');
  }

  // ---------- input from the app
  pointerMove(px, py, type) {
    const [x, y] = this.r.toWorld(px, py);
    this.input.pointerWorld = { x, y };
    if (type === 'mouse') this.input.usingKeys = false;
    this.input.aimX = x; this.input.aimY = y;
  }
  pointerDown(px, py, button, type) {
    const [x, y] = this.r.toWorld(px, py);
    const n = this.n;
    this.input.pointerWorld = { x, y };
    if (n.state === 'prep') {
      if (n.buoyLimit() > 0) {
        if (n.placeBuoy(x, y)) this.app.audio.play('buoy');
        else if (n.buoys.length >= n.buoyLimit()) { this.app.audio.play('deny'); this.app.ui.flashBuoyCount(); }
        this.app.ui.refreshPrep();
      }
      return;
    }
    if (n.state !== 'run' || this.paused) return;
    if (this.input.flareArmed || button === 2) {
      if (n.throwFlare(x, y)) this.app.audio.play('flare');
      else if (button === 2) this.app.audio.play('deny');
      this.input.flareArmed = false;
      return;
    }
    if (type === 'mouse' && button === 0) this.input.mouseFocus = true;
    this.input.aimX = x; this.input.aimY = y;
  }
  pointerUp(button, type) { if (type === 'mouse' && button === 0) this.input.mouseFocus = false; }
  key(code, down) {
    const inp = this.input, n = this.n;
    if (code === 'ShiftLeft' || code === 'ShiftRight') inp.keyFocus = down;
    else if (code === 'KeyA' || code === 'ArrowLeft') { inp.keyL = down; if (down) inp.usingKeys = true; }
    else if (code === 'KeyD' || code === 'ArrowRight') { inp.keyR = down; if (down) inp.usingKeys = true; }
    else if (code === 'KeyW' || code === 'ArrowUp') { if (down) inp.keyFocus = true; else inp.keyFocus = false; }
    if (!down) return;
    if (code === 'Space') {
      if (n.state === 'prep') return;
      if (n.horn()) this.app.audio.play('horn'); else this.app.audio.play('deny');
    } else if (code === 'KeyF' || code === 'KeyE') {
      const p = inp.pointerWorld;
      if (p && !inp.usingKeys) { if (n.throwFlare(p.x, p.y)) this.app.audio.play('flare'); else this.app.audio.play('deny'); }
      else { // keyboard players throw along the beam
        const a = n.beam.ang, d = n.k.range * 0.75;
        if (n.throwFlare(n.L.x + Math.cos(a) * d, n.L.y + Math.sin(a) * d)) this.app.audio.play('flare'); else this.app.audio.play('deny');
      }
    }
  }
  armFlare() {
    const n = this.n;
    if (n.state !== 'run' || !n.canFlare || n.flaresLeft <= 0) { this.app.audio.play('deny'); return false; }
    this.input.flareArmed = !this.input.flareArmed;
    this.app.audio.play('click');
    return this.input.flareArmed;
  }
  hornBtn() { if (this.n.horn()) this.app.audio.play('horn'); else this.app.audio.play('deny'); }
  setBtnFocus(on) { this.input.btnFocus = on; }

  // ---------- frame
  update(dt) {
    const n = this.n;
    this.realT += dt;
    if (n.state === 'prep') {
      this.view.darkness = Math.max(0, this.view.darkness - dt);
      const p = this.input.pointerWorld;
      this.view.ghostBuoy = p && n.buoys.length < n.buoyLimit() && n.map.hitAt(p.x, p.y) === T_WATER && this.app.ui.isPrepActive() ? { x: p.x, y: p.y, ph: 0 } : null;
    } else if (n.state === 'won') {
      // dawn comes up over the water
      this.view.ghostBuoy = null;
      this.view.dawn = true;
      if (this.endT > 0.6) this.view.darkness = Math.max(0, this.view.darkness - dt / 3.5);
    } else {
      this.view.ghostBuoy = null;
      this.view.darkness = Math.min(1, this.view.darkness + dt / 2.2);
    }
    if (this.paused) return;
    if (n.state === 'run') {
      this.applyInput(dt);
      if (this.bot) this.bot.update(dt);
      this.acc += Math.min(dt, 0.1);
      let steps = 0;
      while (this.acc >= DT && steps < 8) { n.step(DT); this.acc -= DT; steps++; }
    }
    this.handleEvents();
    this.hint = this.tut.update(dt, n);
    this.ambientFx(dt);
    if (!this.attract) {
      // music tension follows the threats on the water
      let threat = 0;
      for (const m of n.monsters) if (!m.dead) threat += m.kind === 'gloom' ? 0.12 : m.kind === 'wisp' ? 0.06 : 0.3;
      if (n.boss && !n.boss.dead) threat += 0.6;
      threat += n.ships.filter(s => s.state === 'grabbed' || s.latched).length * 0.2;
      this.app.audio.setTension(n.state === 'run' ? threat : 0);
      this.app.audio.setWeather(n.storm);
    }
    if ((n.state === 'won' || n.state === 'lost') && !this.finished) {
      this.endT += dt;
      if (this.endT > (n.state === 'won' ? 2.2 : 2.8)) { this.finished = true; if (!this.attract) this.app.onMatchEnd(this); }
    }
    this.view.incoming = this.view.incoming.filter(w => w.at - n.t > -2);
    this.view.reticle = this.input.flareArmed && this.input.pointerWorld ? this.input.pointerWorld : null;
  }

  applyInput(dt) {
    const n = this.n, inp = this.input;
    if (this.attract) return;
    if (inp.usingKeys) {
      const dir = (inp.keyR ? 1 : 0) - (inp.keyL ? 1 : 0);
      if (dir) n.setAim(n.beam.ang + dir * 0.6);
      else n.setAim(n.beam.ang);
    } else if (inp.aimX != null) {
      n.setAim(Math.atan2(inp.aimY - n.L.y, inp.aimX - n.L.x));
    }
    n.setFocus(inp.mouseFocus || inp.keyFocus || inp.btnFocus);
  }

  ambientFx(dt) {
    const n = this.n, fx = this.r.fx;
    if (n.state !== 'run') return;
    this.burnSfxT -= dt;
    for (const m of n.monsters) {
      if (m.dead || !(m.burnT > 0)) continue;
      if (Math.random() < dt * 22) fx.add({ x: m.x + (Math.random() - 0.5) * 8, y: m.y + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 20, vy: -15 - Math.random() * 20, life: 0.6, size: 1.3, color: m.kind === 'wisp' ? '#c8ffc0' : m.kind === 'wraith' ? '#a8fff0' : '#ffae6a', glow: true, drag: 1, rise: 10, kind: 'dot', rot: 0, vr: 0, grow: 0 });
      if (this.burnSfxT <= 0 && !this.attract) { this.app.audio.play('burn'); this.burnSfxT = 0.25; }
    }
    if (n.boss && n.boss.hurtT > 0 && Math.random() < dt * 30) fx.add({ x: n.boss.x + (Math.random() - 0.5) * 20, y: n.boss.y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, life: 0.8, size: 2, color: '#ffb070', glow: true, drag: 1, rise: 10, kind: 'dot', rot: 0, vr: 0, grow: 0 });
  }

  handleEvents() {
    const n = this.n, fx = this.r.fx, au = this.attract ? null : this.app.audio, ui = this.app.ui;
    const play = (s, o) => au && au.play(s, o);
    for (const e of n.events) {
      switch (e.type) {
        case 'dock': {
          const st = n.map.docks[e.ship.dock].style;
          fx.ring(e.x, e.y, st.color, { r1: 46, life: 1.1, w: 2.5 });
          fx.text(e.x, e.y - 14, '+' + e.value, '#f6d68a', { size: 16 });
          if (e.rush) fx.text(e.x, e.y - 32, 'Swift delivery', '#cfe6ff', { size: 11, life: 1.8 });
          if (e.oil >= 20) fx.text(e.x + 26, e.y + 4, '+' + e.oil + ' oil', '#ffd27a', { size: 11 });
          play('dock', { dock: e.ship.dock }); play('coins');
          ui && ui.pulse('saved');
          break;
        }
        case 'hit':
          fx.burst(e.x, e.y, 10, { speed: [20, 70], life: [0.3, 0.7], size: [1, 2.2], color: 'rgba(230,242,248,0.9)', drag: 3 });
          fx.burst(e.x, e.y, 5, { speed: [15, 45], life: [0.6, 1.4], size: [1.2, 2.4], color: '#7a5234', kind: 'chip', drag: 2 });
          fx.shake = Math.max(fx.shake, 0.22);
          play('hit');
          break;
        case 'wreck':
          fx.burst(e.x, e.y, 22, { speed: [20, 90], life: [0.5, 1.2], size: [1, 2.6], color: 'rgba(230,242,248,0.9)', drag: 2.5 });
          fx.burst(e.x, e.y, 14, { speed: [10, 50], life: [2, 4], size: [1.5, 3.5], color: '#5e3d22', kind: 'chip', drag: 1.2 });
          fx.ring(e.x, e.y, 'rgba(255,120,100,0.9)', { r1: 60, life: 1.4, w: 2 });
          fx.text(e.x, e.y - 18, e.ship.T.vip ? 'The envoy is lost' : 'Wrecked', '#ff8a7a', { size: 15, life: 2 });
          fx.shake = Math.max(fx.shake, 0.7);
          play('wreck');
          ui && ui.pulse('wrecks');
          break;
        case 'incoming':
          this.view.incoming.push({ x: e.x, y: e.y, dock: e.dock, at: e.at, type: e.shipType });
          play('incoming');
          break;
        case 'horn':
          for (let i = 0; i < 3; i++) setTimeout(() => fx.ring(n.L.x, n.L.y, 'rgba(220,235,255,0.6)', { r0: 30, r1: 520, life: 1.6, w: 3 - i }), i * 220);
          fx.shake = Math.max(fx.shake, 0.25);
          break;
        case 'gloomDie':
          fx.burst(e.x, e.y, 16, { speed: [10, 60], life: [0.5, 1.2], size: [1, 2.4], color: '#b07cff', glow: true, rise: 10, drag: 2 });
          fx.burst(e.x, e.y, 10, { speed: [5, 30], life: [0.8, 1.6], size: [2, 4], color: 'rgba(20,10,30,0.8)', drag: 2, grow: 3 });
          play('gloomDie');
          break;
        case 'latch': play('latch'); break;
        case 'wispDie':
          fx.burst(e.x, e.y, 20, { speed: [20, 80], life: [0.4, 1], size: [1, 2.2], color: '#cfffb8', glow: true, drag: 2.5 });
          fx.ring(e.x, e.y, 'rgba(180,255,170,0.8)', { r1: 50, life: 0.8 });
          play('wispDie');
          break;
        case 'monster':
          if (e.kind === 'wisp') play('wisp');
          else if (e.kind === 'kraken') play('rumble');
          else if (e.kind === 'wraith') { play('ghost'); ui && ui.banner('A drowned galleon approaches', 'ghost'); }
          break;
        case 'krakenUp':
          fx.burst(e.x, e.y, 26, { speed: [30, 110], life: [0.4, 1], size: [1, 2.6], color: 'rgba(230,242,248,0.9)', drag: 2.5 });
          play('splash'); play('rumble');
          break;
        case 'grab': fx.shake = Math.max(fx.shake, 0.35); play('grab'); break;
        case 'freed': fx.text(e.x, e.y - 18, 'Freed!', '#bfe9ff', { size: 14 }); play('freed'); break;
        case 'krakenBeaten': case 'krakenDown':
          fx.burst(e.x, e.y, 18, { speed: [20, 80], life: [0.4, 1], size: [1, 2.4], color: 'rgba(230,242,248,0.8)', drag: 2.5 });
          play('splash');
          break;
        case 'wraithDie':
          fx.burst(e.x, e.y, 30, { speed: [10, 70], life: [0.6, 1.6], size: [1, 2.6], color: '#9ffff0', glow: true, rise: 14, drag: 1.5 });
          fx.text(e.x, e.y - 20, 'Banished', '#aef5ea', { size: 14 });
          play('wraithDie');
          break;
        case 'wraithDrain':
          fx.text(e.x, e.y - 20, '-' + Math.round(e.drain) + ' oil', '#ff9a7a', { size: 15 });
          fx.ring(n.L.x, n.L.y, 'rgba(120,255,230,0.7)', { r1: 90, life: 1 });
          fx.shake = Math.max(fx.shake, 0.4);
          play('drain');
          ui && ui.pulse('oil');
          break;
        case 'dry': play('dry'); ui && ui.banner('The lamp is dry', 'warn'); break;
        case 'lightning':
          this.r.lightning(e.x, e.y, e.seed);
          play('thunder', { delay: 0.3 + Math.random() * 0.9 });
          break;
        case 'flare': break;
        case 'bossWake': play('boss'); ui && ui.banner('The Hollow Mouth wakes', 'boss'); fx.shake = 0.6; break;
        case 'bossWarn': play('rumble'); break;
        case 'bossUp':
          fx.burst(e.x, e.y, 40, { speed: [30, 140], life: [0.5, 1.2], size: [1, 3], color: 'rgba(230,242,248,0.9)', drag: 2.5 });
          play('splash'); play('roar'); fx.shake = 0.5;
          break;
        case 'bossBite': fx.shake = 0.9; play('hit'); play('roar', { high: true }); break;
        case 'bossHurt':
          fx.text(e.x, e.y - 30, e.stage >= 3 ? '' : 'It dives!', '#ffc08a', { size: 16 });
          play('roar', { high: true }); fx.shake = 0.5;
          break;
        case 'bossDie':
          fx.burst(e.x, e.y, 60, { speed: [20, 160], life: [1, 2.5], size: [1, 3], color: '#ffd8a0', glow: true, rise: 10, drag: 1.2 });
          play('roar', { long: true }); fx.shake = 1;
          ui && ui.banner('The Hollow Mouth sinks', 'boss');
          break;
        case 'begin': break;
        case 'buoy': case 'buoyOff': break;
        case 'won': if (!this.attract) { this.app.audio.setTension(0); } break;
        case 'lost': if (!this.attract) play('lose'); break;
      }
    }
    n.events.length = 0;
  }

  draw(dt) {
    this.view.badges = Save.data.settings.badges;
    this.view.shake = Save.data.settings.shake;
    this.r.reduceFlash = Save.data.settings.reduceFlash;
    this.r.draw(this.n, this.paused ? 0 : dt, this.view);
  }
}
