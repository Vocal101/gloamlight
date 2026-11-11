'use strict';
// App shell: main loop, input routing, screen flow, progress and achievements.

const GAME_VERSION = '1.0.1';

function fmtDur(s) {
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

const App = {
  init() {
    Save.load();
    this.cv = document.getElementById('cv');
    this.renderer = new Renderer(this.cv);
    this.audio = new GameAudio();
    this.ui = UI;
    UI.init(this);
    this.applySettings();
    this.mode = 'menu';
    this.match = null;
    this.paused = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindInput();
    this.startAttract();
    UI.title();
    this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
    const ld = document.getElementById('loading');
    if (ld) { ld.classList.add('gone'); setTimeout(() => ld.remove(), 700); }
    // unlock audio on the first gesture anywhere
    const unlock = () => { this.audio.init(); this.audio.setMusic(this.mode === 'play' ? 'night' : 'title', this.match ? this.match.n.map.regionIdx : 0); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (this.mode === 'play' && this.match && this.match.state === 'run' && !this.paused) this.pause(); this.audio.suspend(true); }
      else this.audio.suspend(false);
    });
  },

  applySettings() {
    const s = Save.data.settings;
    this.audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx, amb: s.amb });
  },

  resize() {
    this.renderer.resize(window.innerWidth, window.innerHeight);
  },

  bindInput() {
    const cv = this.cv;
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointermove', e => {
      if (this.mode !== 'play' || !this.match) return;
      const [x, y] = pos(e);
      if (e.pointerType !== 'mouse' && !(e.buttons & 1) && e.pointerType !== 'pen') return;
      this.match.pointerMove(x, y, e.pointerType);
      if (e.pointerType === 'mouse' && !this.paused) {
        // a second button pressed while one is held arrives as a move, not a down
        if (e.button === 2 && (e.buttons & 2)) this.match.pointerDown(x, y, 2, 'mouse');
        if (this.match.state === 'run') this.match.input.mouseFocus = (e.buttons & 1) !== 0;
      }
    });
    cv.addEventListener('pointerdown', e => {
      this.audio.init();
      if (this.mode !== 'play' || !this.match || this.paused) return;
      const [x, y] = pos(e);
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      this.match.pointerDown(x, y, e.button, e.pointerType);
      if (UI.screen === 'brief' && this.match.state === 'prep' && e.pointerType !== 'mouse' && window.innerWidth <= 760) UI.showPrepBar();
    });
    const up = e => {
      if (!this.match) return;
      if (e.pointerType === 'mouse') this.match.input.mouseFocus = (e.buttons & 1) !== 0;
      else this.match.pointerUp(e.button, e.pointerType);
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT')) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.mode === 'play' && this.match && this.match.state === 'run') { e.preventDefault(); this.paused ? this.resume() : this.pause(); }
        return;
      }
      if (this.mode !== 'play' || !this.match || this.paused) return;
      // Enter lights the lamp only from the briefing or the buoy bar (not from the Workshop)
      if (e.code === 'Enter' && this.match.state === 'prep' && (UI.screen === 'brief' || UI.prepBarShown())) { e.preventDefault(); this.beginNight(); return; }
      if (this.match.state !== 'run') return;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) this.match.key(e.code, true);
    });
    window.addEventListener('keyup', e => { if (this.match && this.mode === 'play') this.match.key(e.code, false); });
    window.addEventListener('blur', () => { if (this.match) { this.match.input.keyFocus = false; this.match.input.mouseFocus = false; this.match.input.keyL = this.match.input.keyR = false; } });
  },

  frame(t) {
    const dt = Math.min(0.05, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    try {
      const m = this.match;
      if (m) {
        m.update(dt);
        m.draw(dt);
        if (this.mode === 'play') {
          UI.updateHud(m);
          if (m.state === 'run' && !this.paused) Save.data.stats.playTime += dt;
        } else if (m.attract && (m.n.state !== 'run' || m.n.t > 170)) this.startAttract(6);
      }
    } catch (err) {
      console.error(err);
      (window.__errs = window.__errs || []).push(String(err && err.stack || err));
    }
    requestAnimationFrame(tt => this.frame(tt));
  },

  // ---------- flow
  setMenuMode() {
    if (this.mode === 'play') {
      this.mode = 'menu';
      this.paused = false;
      this.startAttract();
    }
    document.body.classList.remove('playing');
    document.body.classList.add('menu');
    UI.showHud(false);
    this.audio.setMusic('title');
    this.audio.setTension(0);
    this.audio.setWeather(0);
  },

  startAttract(warm = 25) {
    const opts = [0, 1, 2, 3].filter(r => r === 0 || Save.unlocked(NIGHTS.findIndex(n => n.region === r)));
    const region = opts[Math.floor(Math.random() * opts.length)];
    this.match = new Match(this, { attract: true, endless: true, region, seed: (Math.random() * 1e9) | 0 });
    // let the demo run a little so the title opens on a busy sea
    for (let i = 0; i < 60 * warm; i++) { this.match.bot.update(DT); this.match.n.step(DT); }
    this.match.n.events.length = 0;
    this.renderer.fx.clear();
  },

  startNight(i) {
    if (!Save.unlocked(i)) return;
    this.mode = 'play';
    this.paused = false;
    this.current = { night: i };
    document.body.classList.add('playing'); document.body.classList.remove('menu');
    this.match = new Match(this, { night: i });
    UI.showHud(true);
    UI.briefing(i, this.match);
    this.audio.setMusic('night', NIGHTS[i].region);
    Save.data.lastNight = i; Save.write();
  },

  startEndless(region) {
    this.mode = 'play';
    this.paused = false;
    this.current = { endless: true, region };
    document.body.classList.add('playing'); document.body.classList.remove('menu');
    this.match = new Match(this, { endless: true, region, seed: (Math.random() * 1e9) | 0 });
    UI.showHud(true);
    UI.endlessBrief(this.match);
    this.audio.setMusic('night', region);
  },

  beginNight() {
    if (!this.match || this.match.state !== 'prep') return;
    this.audio.init();
    UI.clear();
    UI.showHud(true);
    UI.hidePrepBar();
    this.match.begin();
  },

  pause() {
    if (!this.match || this.mode !== 'play' || this.match.state !== 'run') return;
    this.paused = true; this.match.paused = true;
    this.match.input.mouseFocus = this.match.input.keyFocus = this.match.input.btnFocus = false;
    UI.pause();
  },
  resume() {
    if (!this.match) return;
    this.paused = false; this.match.paused = false;
    UI.clear();
  },
  restart() {
    if (!this.current) return;
    if (this.current.endless) this.startEndless(this.current.region);
    else this.startNight(this.current.night);
  },
  quitToMenu() {
    const endless = this.current && this.current.endless;
    if (endless && this.match && this.match.state === 'run' && !this.match.attract) {
      // ending a Long Night early still counts what was saved
      this.match.n.endEndless();
      this.paused = false; this.match.paused = false;
      this.onMatchEnd(this.match);
      return;
    }
    this.mode = 'play'; // so setMenuMode swaps to the attract demo
    if (endless) UI.endless(); else UI.chart();
  },

  toggleFullscreen() {
    const d = document;
    try {
      if (!d.fullscreenElement) (d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen).call(d.documentElement);
      else (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    } catch (e) { /* not supported */ }
  },

  // ---------- results and progress
  onMatchEnd(match) {
    const n = match.n, r = n.result;
    if (!r || match.reported) return; // a night pays out exactly once
    match.reported = true; match.finished = true;
    const d = Save.data, st = d.stats;
    st.saved += r.saved; st.wrecked += r.wrecked;
    st.glooms += r.stats.glooms; st.wisps += r.stats.wisps; st.krakens += r.stats.krakens; st.freed += r.stats.freed; st.wraiths += r.stats.wraiths;
    st.flares += r.stats.flaresUsed; st.horns += r.stats.horns;
    const res = { r, nightIdx: n.nightIdx, endless: n.endless };
    if (n.endless) {
      d.coins += r.coins;
      res.newBest = r.saved > d.endless.best;
      if (res.newBest) { d.endless.best = r.saved; d.endless.bestRegion = n.map.regionIdx; }
      this.unlock(r.saved >= 20, 'long_20'); this.unlock(r.saved >= 50, 'long_50');
    } else {
      const id = n.def.id;
      const prev = d.nights[id] || { stars: 0, best: 0 };
      d.coins += r.coins;
      if (r.won) {
        st.nights++;
        if (r.wrecked === 0) st.clean++;
        if (!prev.stars) { res.firstClear = 40 + n.nightIdx * 6; d.coins += res.firstClear; }
        d.nights[id] = { stars: Math.max(prev.stars, r.stars), best: Math.max(prev.best || 0, r.saved) };
        this.unlock(true, 'first_light');
        this.unlock(r.wrecked === 0, 'clean_watch');
        this.unlock(r.oilFrac >= 0.6, 'frugal');
        if (n.def.boss) this.unlock(true, 'boss');
      }
    }
    Save.write();
    this.checkAchievements();
    UI.showHud(false);
    UI.results(res);
    this.audio.setTension(0);
    if (r.won) this.audio.play('win');
  },

  unlock(cond, id) {
    const d = Save.data;
    if (!cond || d.ach[id]) return false;
    d.ach[id] = Date.now();
    const a = ACHIEVEMENTS.find(x => x.id === id);
    if (a) { UI.toast(a.name, a.desc); this.audio.play('achieve'); }
    Save.write();
    return true;
  },

  checkAchievements() {
    const d = Save.data, s = d.stats;
    this.unlock(s.clean >= 10, 'ten_clean');
    this.unlock(s.saved >= 100, 'hulls_100');
    this.unlock(s.saved >= 500, 'hulls_500');
    this.unlock(s.glooms >= 50, 'shades_50');
    this.unlock(s.glooms >= 300, 'shades_300');
    this.unlock(s.wisps >= 25, 'wisps_25');
    this.unlock(s.freed >= 1, 'kraken_free');
    this.unlock(s.wraiths >= 1, 'wraith');
    for (let r = 0; r < 3; r++) this.unlock(Save.regionDone(r), 'region_' + r);
    this.unlock(NIGHTS.every(n => (d.nights[n.id] || {}).stars === 3), 'all_stars');
    this.unlock(UPGRADES.some(u => Save.upLevel(u.id) >= u.vals.length - 1), 'maxed');
  },
};

window.addEventListener('DOMContentLoaded', () => {
  App.init();
  if (/[?&]dev\b/.test(location.search)) DevHarness.install(App);
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !/[?&]dev\b/.test(location.search)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
