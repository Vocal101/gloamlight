'use strict';
// Save data in localStorage. Every access is guarded: private windows and blocked storage still play.

const SAVE_KEY = 'gloamlight_save_v1';

function defaultSave() {
  return {
    v: 1,
    coins: 0,
    upgrades: {},
    nights: {}, // id -> { stars, best }
    stats: { saved: 0, wrecked: 0, glooms: 0, wisps: 0, krakens: 0, freed: 0, wraiths: 0, nights: 0, clean: 0, playTime: 0, flares: 0, horns: 0 },
    ach: {},
    endless: { best: 0, bestRegion: 0 },
    seenTut: {},
    settings: { master: 0.8, music: 0.6, sfx: 0.8, amb: 0.7, shake: true, reduceFlash: false, hints: true, badges: false, quality: 'high' },
    lastNight: 0,
  };
}

const Save = {
  data: defaultSave(),
  ok: true,
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const base = defaultSave();
        this.data = Object.assign(base, d);
        this.data.stats = Object.assign(base.stats, d.stats || {});
        this.data.settings = Object.assign(defaultSave().settings, d.settings || {});
        this.data.endless = Object.assign(defaultSave().endless, d.endless || {});
      }
    } catch (e) { this.ok = false; this.data = defaultSave(); }
    return this.data;
  },
  write() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); this.ok = true; } catch (e) { this.ok = false; }
  },
  reset() {
    const s = this.data.settings;
    this.data = defaultSave();
    this.data.settings = s;
    this.write();
  },
  nightDone(id) { return !!(this.data.nights[id] && this.data.nights[id].stars > 0); },
  unlocked(i) {
    if (i === 0) return true;
    return this.nightDone(NIGHTS[i - 1].id);
  },
  totalStars() { return Object.values(this.data.nights).reduce((a, n) => a + (n.stars || 0), 0); },
  regionDone(r) { return NIGHTS.filter(n => n.region === r).every(n => this.nightDone(n.id)); },
  endlessUnlocked() { return this.nightDone(ENDLESS.unlockAfter); },
  upLevel(id) { return this.data.upgrades[id] || 0; },
};
