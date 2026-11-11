'use strict';
// Particles and floating text. World-space, updated with real frame time.

class FX {
  constructor() { this.p = []; this.texts = []; this.rings = []; this.shake = 0; this.rng = new RNG(99); }
  clear() { this.p.length = 0; this.texts.length = 0; this.rings.length = 0; this.shake = 0; }

  add(o) {
    if (this.p.length > 1400) this.p.shift();
    o.t = 0;
    this.p.push(o);
    return o;
  }
  burst(x, y, n, opts) {
    const r = this.rng;
    for (let i = 0; i < n; i++) {
      const a = opts.ang != null ? opts.ang + r.range(-opts.spread, opts.spread) : r.range(0, TAU);
      const sp = r.range(opts.speed[0], opts.speed[1]);
      this.add({
        x: x + r.range(-(opts.jitter || 0), opts.jitter || 0), y: y + r.range(-(opts.jitter || 0), opts.jitter || 0),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: r.range(opts.life[0], opts.life[1]),
        size: r.range(opts.size[0], opts.size[1]), color: opts.color, glow: !!opts.glow, drag: opts.drag != null ? opts.drag : 1.5,
        rise: opts.rise || 0, kind: opts.kind || 'dot', rot: r.range(0, TAU), vr: r.range(-4, 4), grow: opts.grow || 0,
      });
    }
  }
  text(x, y, str, color, opts = {}) {
    this.texts.push({ x, y, str, color, t: 0, life: opts.life || 1.6, size: opts.size || 15, rise: opts.rise != null ? opts.rise : 26 });
  }
  ring(x, y, color, opts = {}) {
    this.rings.push({ x, y, color, t: 0, life: opts.life || 1, r0: opts.r0 || 4, r1: opts.r1 || 40, w: opts.w || 2, glow: opts.glow !== false });
  }

  update(dt) {
    for (const o of this.p) {
      o.t += dt;
      const d = Math.exp(-o.drag * dt);
      o.vx *= d; o.vy *= d;
      o.vy -= o.rise * dt;
      o.x += o.vx * dt; o.y += o.vy * dt;
      o.rot += o.vr * dt;
      o.size += o.grow * dt;
    }
    this.p = this.p.filter(o => o.t < o.life);
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter(t => t.t < t.life);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter(r => r.t < r.life);
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }

  // glow=false particles draw under the darkness, glow=true ones on top
  draw(ctx, glow) {
    for (const o of this.p) {
      if (o.glow !== glow) continue;
      const k = 1 - o.t / o.life;
      ctx.globalAlpha = clamp(k * (o.t < 0.08 ? o.t / 0.08 : 1), 0, 1);
      ctx.fillStyle = o.color;
      if (o.kind === 'chip') {
        ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.rot);
        ctx.fillRect(-o.size, -o.size * 0.35, o.size * 2, o.size * 0.7);
        ctx.restore();
      } else if (o.kind === 'streak') {
        ctx.strokeStyle = o.color; ctx.lineWidth = o.size;
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x - o.vx * 0.05, o.y - o.vy * 0.05); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(o.x, o.y, Math.max(0.3, o.size * (glow ? (0.4 + 0.6 * k) : 1)), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (glow) {
      for (const r of this.rings) {
        const k = r.t / r.life;
        ctx.globalAlpha = (1 - k) * 0.9;
        ctx.strokeStyle = r.color; ctx.lineWidth = r.w * (1 - k * 0.5);
        ctx.beginPath(); ctx.arc(r.x, r.y, lerp(r.r0, r.r1, easeOut(k)), 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  drawTexts(ctx, scale) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.t / t.life;
      const a = k < 0.12 ? k / 0.12 : 1 - smooth(0.65, 1, k);
      const pop = k < 0.12 ? 0.7 + 0.3 * easeOut(k / 0.12) : 1;
      ctx.globalAlpha = a;
      ctx.font = `600 ${Math.round(t.size * pop)}px "Plex Sans", system-ui, sans-serif`;
      const y = t.y - t.rise * easeOut(k);
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(4,10,18,0.85)';
      ctx.strokeText(t.str, t.x, y);
      ctx.fillStyle = t.color; ctx.fillText(t.str, t.x, y);
    }
    ctx.globalAlpha = 1;
  }
}
