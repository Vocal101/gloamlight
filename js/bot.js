'use strict';
// An automatic keeper. Used by the node balance tests and the title-screen attract mode.

class KeeperBot {
  constructor(night, skill = 1) {
    this.n = night;
    this.skill = skill; // 0..1: lower skill reacts slower and wastes less thought on danger
    this.think = 0;
    this.flareCd = 6;
    this.target = null;
    this.focus = false;
  }

  // Look ahead along a dark ship's heading for rocks.
  danger(s) {
    const map = this.n.map;
    let d = 0;
    for (let k = 1; k <= 5; k++) {
      const r = k * 24;
      const x = s.x + Math.cos(s.ang) * r, y = s.y + Math.sin(s.ang) * r;
      if (map.hitAt(x, y)) { d = Math.max(d, 6 - k); break; }
      if (map.distAt(x, y) < 10) d = Math.max(d, 3.5 - k * 0.5);
    }
    return d;
  }

  update(dt) {
    const n = this.n;
    if (n.state !== 'run') return;
    this.think -= dt; this.flareCd -= dt;
    if (this.think > 0) { this.apply(); return; }
    this.think = lerp(1.0, 0.15, this.skill) * (0.7 + Math.random() * 0.6);
    const L = n.L, range = n.k.range;
    const cand = [];
    const add = (x, y, score, kind, strong) => {
      const d = dist(x, y, L.x, L.y);
      const a = Math.atan2(y - L.y, x - L.x);
      cand.push({ x, y, d, a, score, kind, strong });
    };
    for (const s of n.ships) {
      if (s.state !== 'sail' && s.state !== 'grabbed') continue;
      let sc = 0;
      if (!s.lit || s.light < LIT_T * 1.3) {
        sc += Math.min(s.darkT, 12) * 0.25 + Math.abs(s.err) * 1.5 + this.danger(s) * 1.4 * this.skill;
        if (s.lostT > 1) sc += 1.5;
      }
      if (s.latched) sc += 2.5 * s.latched;
      if (s.T.vip) sc *= 1.4;
      if (s.hull < s.maxHull * 0.4) sc *= 1.2;
      if (s.state === 'grabbed') continue; // handled through the kraken
      add(s.x, s.y, sc, 'ship', false);
    }
    for (const m of n.monsters) {
      if (m.dead) continue;
      if (m.kind === 'gloom' && m.state !== 'rise') {
        let near = 1e9;
        for (const s of n.ships) if (s.state === 'sail') near = Math.min(near, dist(m.x, m.y, s.x, s.y));
        const sc = m.state === 'latched' ? 4.5 : near < 160 ? 3.2 : near < 300 ? 1.2 : 0.3;
        add(m.x, m.y, sc, 'gloom', false);
      } else if (m.kind === 'wisp' && m.state !== 'rise') {
        let lured = 0;
        for (const s of n.ships) if (s.state === 'sail' && !s.lit && dist(m.x, m.y, s.x, s.y) < 300) lured++;
        add(m.x, m.y, 1 + lured * 2.6, 'wisp', false);
      } else if (m.kind === 'kraken' && m.state === 'up') {
        add(m.x, m.y, m.grab ? 6 + (m.grab.T.vip ? 4 : 0) : 0.8, 'kraken', true);
      } else if (m.kind === 'wraith') {
        const d = dist(m.x, m.y, L.x, L.y);
        if (d < range * 1.3) add(m.x, m.y, 2 + Math.max(0, (420 - d) / 70), 'wraith', true);
      }
    }
    const b = n.boss;
    if (b && !b.dead && b.state === 'up') add(b.x, b.y, 7, 'boss', true);
    const reach = range * 1.38;
    let best = null, bs = -1e9;
    for (const c of cand) {
      if (c.d > reach) continue;
      if (Math.random() < (1 - this.skill) * 0.45) continue; // a human doesn't notice everything
      const turnCost = Math.abs(angDiff(n.beam.ang, c.a)) / n.k.turn; // seconds to swing there
      let sc = c.score - turnCost * 0.9;
      if (this.target && Math.abs(angDiff(this.target.a, c.a)) < 0.15) sc += 0.6; // stickiness
      if (sc > bs) { bs = sc; best = c; }
    }
    if (!best) {
      // idle sweep
      const a = n.beam.ang + 0.8;
      best = { a, d: range * 0.6, kind: 'sweep', strong: false, x: L.x + Math.cos(a) * 300, y: L.y + Math.sin(a) * 300 };
    }
    if (this.skill < 1 && best.kind !== 'sweep') best = Object.assign({}, best, { a: best.a + (Math.random() - 0.5) * 0.25 * (1 - this.skill) });
    this.target = best;
    const fog = n.fogs.length ? n.fogAt(best.x, best.y) : 1;
    const oilFrac = n.oil / n.k.oilMax;
    this.focus = (best.strong || best.d > range * 0.88 || fog < 0.75 || best.kind === 'gloom' && best.score > 3) && oilFrac > (best.strong ? 0.08 : 0.25);
    // flares for far or doubled trouble
    if (n.canFlare && n.flaresLeft > 0 && this.flareCd <= 0) {
      const urgent = cand.filter(c => c.score > 3.5 && (c.d > reach || Math.abs(angDiff(n.beam.ang, c.a)) > 1.4));
      if (urgent.length) {
        const u = urgent[0];
        n.throwFlare(u.x, u.y); this.flareCd = 14 - this.skill * 4;
      }
    }
    // foghorn when shades swarm or many ships are lost
    if (n.canHorn && n.hornT <= 0) {
      const latched = n.monsters.filter(m => m.kind === 'gloom' && m.state === 'latched').length;
      const lost = n.ships.filter(s => s.state === 'sail' && !s.lit && s.lostT > 2).length;
      if (latched >= 2 || lost >= 3) n.horn();
    }
    this.apply();
  }

  apply() {
    if (!this.target) return;
    this.n.setAim(this.target.a);
    this.n.setFocus(this.focus);
  }
}

if (typeof module !== 'undefined') module.exports = {};
