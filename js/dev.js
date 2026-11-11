'use strict';
// ?dev harness: window.T for driving the game from the console or automated checks.
const DevHarness = {
  install(app) {
    const T = {
      app,
      errs: window.__errs = window.__errs || [],
      get n() { return app.match && app.match.n; },
      start(i = 0, opts = {}) {
        if (opts.unlock !== false) T.unlockAll(false);
        if (opts.upgrades) Save.data.upgrades = opts.upgrades;
        app.startNight(i);
        if (opts.begin !== false) app.beginNight();
        if (opts.bot) T.bot(true);
        return T.n;
      },
      endless(region = 0, bot = true) { T.unlockAll(false); app.startEndless(region); app.beginNight(); if (bot) T.bot(true); return T.n; },
      bot(on = true) { const m = app.match; if (!m) return; m.bot = on ? new KeeperBot(m.n, 1) : null; m.attract = false; },
      run(sec) { const m = app.match; for (let i = 0; i < sec * 60 && m.n.state === 'run'; i++) { if (m.bot) m.bot.update(DT); m.n.step(DT); if (i % 6 === 0) m.handleEvents(); } m.handleEvents(); return T.state(); },
      frames(k = 1, dt = 1 / 60) { for (let i = 0; i < k; i++) { const m = app.match; m.update(dt); m.draw(dt); if (app.mode === 'play') UI.updateHud(m); } return k; },
      state() { const n = T.n; return n && { state: n.state, t: +n.t.toFixed(1), saved: n.stats.saved, wrecked: n.stats.wrecked, ships: n.ships.length, monsters: n.monsters.length, oil: Math.round(n.oil) }; },
      unlockAll(all = true) { if (!all) { for (const n of NIGHTS) Save.data.nights[n.id] = Save.data.nights[n.id] || { stars: 0, best: 0 }; return; } for (const n of NIGHTS) Save.data.nights[n.id] = { stars: 3, best: 1 }; Save.data.coins = 99999; Save.write(); },
      menu(name, arg) { UI[name](arg); },
      async snap(name = 'snap', q = 0.82) {
        const c = document.getElementById('cv');
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
        await fetch('/__snap/' + name, { method: 'POST', body: blob });
        return name;
      },
    };
    // unlocking in dev should not need real progress for start(); keep stars at 0 so the chart still reads true
    T.unlockAll = function (all = true) {
      if (all) { for (const n of NIGHTS) Save.data.nights[n.id] = { stars: 3, best: 1 }; Save.data.coins = 99999; }
      else { Save.unlocked = () => true; }
      Save.write();
    };
    window.T = T;
    console.log('[dev] T ready');
  },
};
