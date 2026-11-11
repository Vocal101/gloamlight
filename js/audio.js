'use strict';
// All sound is synthesized with WebAudio: sea ambience, generative music and effects.

const SCALES = {
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  locrianish: [0, 2, 3, 6, 7, 8, 11],
};
const PROGS = {
  dorian: [[0, 2, 4], [3, 5, 0], [4, 6, 1], [0, 2, 4], [6, 1, 3], [3, 5, 0]],
  aeolian: [[0, 2, 4], [5, 0, 2], [2, 4, 6], [6, 1, 3], [3, 5, 0], [4, 6, 1]],
  phrygian: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [6, 1, 3], [5, 0, 2], [1, 3, 5]],
  locrianish: [[0, 2, 4], [5, 0, 2], [1, 3, 5], [0, 2, 4], [4, 6, 1], [5, 0, 2]],
};
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

class GameAudio {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, music: 0.6, sfx: 0.8, amb: 0.7 };
    this.last = {};
    this.music = { on: false, region: 0, mode: 'title', tension: 0, bar: 0, nextT: 0, beat: 0, melodyNote: 0 };
    this.storm = 0; this.sea = 1;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(c.destination);
    this.busMusic = c.createGain(); this.busSfx = c.createGain(); this.busAmb = c.createGain();
    this.busMusic.connect(this.master); this.busSfx.connect(this.master); this.busAmb.connect(this.master);
    // reverb
    this.verb = c.createConvolver();
    this.verb.buffer = this.impulse(3.2, 2.4);
    this.verbGain = c.createGain(); this.verbGain.gain.value = 0.5;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
    // echo for bells
    this.delay = c.createDelay(2); this.delay.delayTime.value = 0.48;
    const fb = c.createGain(); fb.gain.value = 0.33;
    const dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2200;
    this.delay.connect(dlp); dlp.connect(fb); fb.connect(this.delay);
    this.delayOut = c.createGain(); this.delayOut.gain.value = 0.35;
    dlp.connect(this.delayOut); this.delayOut.connect(this.busMusic); this.delayOut.connect(this.verb);
    this.noise = this.noiseBuffer(4);
    this.applyVolumes();
    this.startAmbience();
    this.timer = setInterval(() => this.tick(), 90);
  }

  impulse(sec, decay) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return b;
  }
  noiseBuffer(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) { // soft pink-ish noise
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    return b;
  }

  setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, v = this.vol;
    this.master.gain.setTargetAtTime(v.master, t, 0.05);
    this.busMusic.gain.setTargetAtTime(v.music * 0.55, t, 0.05);
    this.busSfx.gain.setTargetAtTime(v.sfx, t, 0.05);
    this.busAmb.gain.setTargetAtTime(v.amb * 0.8, t, 0.05);
  }
  suspend(on) { if (!this.ctx) return; if (on) this.ctx.suspend(); else this.ctx.resume(); }

  // ---------- ambience
  startAmbience() {
    const c = this.ctx;
    const mk = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; };
    const src = (rate = 1) => { const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; s.playbackRate.value = rate; s.start(); return s; };
    // sea swell
    this.waveG = c.createGain(); this.waveG.gain.value = 0.25;
    const w = src(1); const wl = mk('lowpass', 520); w.connect(wl); wl.connect(this.waveG); this.waveG.connect(this.busAmb);
    // surf hiss
    this.surfG = c.createGain(); this.surfG.gain.value = 0.05;
    const s2 = src(0.93); const sh = mk('bandpass', 1800, 0.6); s2.connect(sh); sh.connect(this.surfG); this.surfG.connect(this.busAmb);
    // wind
    this.windG = c.createGain(); this.windG.gain.value = 0.0;
    const s3 = src(1.07); this.windF = mk('bandpass', 500, 1.4); s3.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.busAmb);
    // rain
    this.rainG = c.createGain(); this.rainG.gain.value = 0;
    const s4 = src(1.21); const rh = mk('highpass', 2600); s4.connect(rh); rh.connect(this.rainG); this.rainG.connect(this.busAmb);
    this.ambT = 0;
  }
  setWeather(storm, sea = 1) { this.storm = storm; this.sea = sea; }

  tick() {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    const t = c.currentTime;
    // breathing sea
    this.ambT += 0.09;
    const swell = 0.5 + 0.5 * Math.sin(this.ambT * 0.55) * Math.sin(this.ambT * 0.21 + 1);
    this.waveG.gain.setTargetAtTime((0.12 + 0.28 * swell) * this.sea, t, 0.4);
    this.surfG.gain.setTargetAtTime((0.02 + 0.06 * swell) * this.sea, t, 0.4);
    const st = this.storm;
    this.windG.gain.setTargetAtTime(0.03 + st * 0.22 * (0.6 + 0.4 * Math.sin(this.ambT * 0.8)), t, 0.6);
    this.windF.frequency.setTargetAtTime(380 + 500 * (0.5 + 0.5 * Math.sin(this.ambT * 0.37)) + st * 300, t, 0.8);
    this.rainG.gain.setTargetAtTime(st * 0.16, t, 1.2);
    this.musicTick(t);
  }

  // ---------- generative music
  setMusic(mode, region = 0) {
    const m = this.music;
    if (m.mode === mode && m.region === region && m.on) return;
    m.mode = mode; m.region = region; m.on = mode !== 'off';
    m.bar = 0;
    if (this.ctx) m.nextT = this.ctx.currentTime + 0.3;
  }
  setTension(x) { this.music.tension = clamp(x, 0, 1); }

  musicTick(t) {
    const m = this.music;
    if (!m.on) return;
    const R = REGIONS[m.region] || REGIONS[0];
    const mode = m.mode === 'title' ? 'aeolian' : R.music.mode;
    const root = m.mode === 'title' ? 50 : R.music.root;
    const scale = SCALES[mode], prog = PROGS[mode];
    const beat = m.mode === 'title' ? 1.25 : 1.05 - m.tension * 0.2;
    while (m.nextT < t + 0.4) {
      const bt = m.nextT;
      const b = m.beat % 4;
      const chord = prog[m.bar % prog.length];
      const deg = d => root + scale[d % 7] + 12 * Math.floor(d / 7);
      if (b === 0) {
        for (let i = 0; i < 3; i++) this.pad(midiHz(deg(chord[i]) + (i === 0 ? -12 : 0)), bt, beat * 4.2, i === 0 ? 0.05 : 0.035);
        this.pad(midiHz(deg(chord[0]) - 24), bt, beat * 4.2, 0.04, 'sine');
      }
      // bell melody, sparser when calm
      const density = m.mode === 'title' ? 0.45 : 0.32 + m.tension * 0.3;
      if (Math.random() < density) {
        const step = [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)];
        m.melodyNote = clamp(m.melodyNote + step, 0, 11);
        const tone = chord.includes(m.melodyNote % 7) || Math.random() < 0.5 ? m.melodyNote : m.melodyNote + 1;
        this.bellNote(midiHz(deg(tone) + 12), bt + (Math.random() < 0.3 ? beat / 2 : 0), 0.06);
      }
      // tension: low heartbeat and a shimmering string
      if (m.tension > 0.25 && (b === 0 || b === 1)) this.thump(bt + (b === 1 ? beat * 0.3 : 0), 0.12 * m.tension);
      if (m.tension > 0.55 && b === 2) this.tremolo(midiHz(deg(chord[1]) + 12), bt, beat * 2, 0.025 * m.tension);
      m.nextT += beat;
      m.beat++;
      if (m.beat % 4 === 0) m.bar++;
    }
  }

  pad(f, t, dur, vol, type = 'triangle') {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.3;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.35); g.gain.linearRampToValueAtTime(vol * 0.7, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur);
    const oscs = type === 'sine' ? [0] : [-6, 6];
    for (const d of oscs) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = d;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.1);
    }
    lp.connect(g); g.connect(this.busMusic);
    const s = c.createGain(); s.gain.value = 0.4; g.connect(s); s.connect(this.verb);
  }
  bellNote(f, t, vol) {
    const c = this.ctx;
    const out = c.createGain(); out.gain.value = 1;
    out.connect(this.busMusic); out.connect(this.delay);
    const vs = c.createGain(); vs.gain.value = 0.6; out.connect(vs); vs.connect(this.verb);
    [[1, 1, 2.2], [2, 0.35, 1.2], [3.01, 0.15, 0.7], [4.2, 0.08, 0.4]].forEach(([r, a, d]) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * r;
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * a, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05);
    });
  }
  thump(t, vol) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g); g.connect(this.busMusic); o.start(t); o.stop(t + 0.45);
  }
  tremolo(f, t, dur, vol) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2;
    const g = c.createGain(); g.gain.value = 0;
    const lfo = c.createOscillator(); lfo.frequency.value = 7; const lg = c.createGain(); lg.gain.value = vol * 0.5;
    lfo.connect(lg); lg.connect(g.gain);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(bp); bp.connect(g); g.connect(this.busMusic);
    const s = c.createGain(); s.gain.value = 0.5; g.connect(s); s.connect(this.verb);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
  }

  // ---------- effects
  ok(name, gap) {
    if (!this.ctx || this.ctx.state !== 'running') return false;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < gap) return false;
    this.last[name] = now; return true;
  }
  env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  noiseHit(t, { type = 'lowpass', f = 1000, f2 = null, q = 0.7, a = 0.005, d = 0.3, vol = 0.3, verb = 0.2, rate = 1 }) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = rate;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    const g = c.createGain(); this.env(g, t, a, vol, d);
    s.connect(fl); fl.connect(g); g.connect(this.busSfx);
    if (verb) { const v = c.createGain(); v.gain.value = verb; g.connect(v); v.connect(this.verb); }
    s.start(t, Math.random() * 3); s.stop(t + a + d + 0.05);
  }
  tone(t, { type = 'sine', f = 440, f2 = null, a = 0.005, d = 0.3, vol = 0.2, verb = 0.2, detune = 0 }) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    const g = c.createGain(); this.env(g, t, a, vol, d);
    o.connect(g); g.connect(this.busSfx);
    if (verb) { const v = c.createGain(); v.gain.value = verb; g.connect(v); v.connect(this.verb); }
    o.start(t); o.stop(t + a + d + 0.05);
  }
  bell(f, vol = 0.18, t) {
    const c = this.ctx; t = t || c.currentTime;
    [[1, 1, 2.6], [2.0, 0.5, 1.6], [2.76, 0.35, 1.2], [5.4, 0.15, 0.6], [8.9, 0.06, 0.3]].forEach(([r, a, d]) => this.tone(t, { f: f * r, vol: vol * a, d, verb: 0.5 }));
  }

  play(name, opt = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'click': if (this.ok(name, 0.04)) this.tone(t, { type: 'triangle', f: 880, f2: 660, d: 0.06, vol: 0.06, verb: 0 }); break;
      case 'hover': if (this.ok(name, 0.05)) this.tone(t, { type: 'sine', f: 1320, d: 0.03, vol: 0.025, verb: 0 }); break;
      case 'buy': this.bell(988, 0.12); this.bell(1318, 0.09, t + 0.09); break;
      case 'deny': this.tone(t, { type: 'square', f: 160, d: 0.12, vol: 0.05, verb: 0 }); break;
      case 'dock': {
        const f = [523, 659, 784][opt.dock || 0];
        this.bell(f, 0.16); this.bell(f * 1.5, 0.07, t + 0.18);
        break;
      }
      case 'coins': if (this.ok(name, 0.1)) [0, 0.06, 0.12].forEach((d, i) => this.tone(t + d, { type: 'triangle', f: 1400 + i * 300, d: 0.12, vol: 0.04, verb: 0.3 })); break;
      case 'horn': {
        for (const [f, v] of [[73, 0.22], [110, 0.12], [146.8, 0.05]]) {
          const c = this.ctx;
          const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.94, t); o.frequency.linearRampToValueAtTime(f, t + 0.35);
          const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(200, t); lp.frequency.linearRampToValueAtTime(620, t + 0.4); lp.frequency.linearRampToValueAtTime(260, t + 2.6); lp.Q.value = 3;
          const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.3); g.gain.setValueAtTime(v, t + 1.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
          const vib = c.createOscillator(); vib.frequency.value = 4.5; const vg = c.createGain(); vg.gain.value = f * 0.01; vib.connect(vg); vg.connect(o.frequency);
          o.connect(lp); lp.connect(g); g.connect(this.busSfx);
          const s = c.createGain(); s.gain.value = 0.7; g.connect(s); s.connect(this.verb);
          o.start(t); vib.start(t); o.stop(t + 2.9); vib.stop(t + 2.9);
        }
        break;
      }
      case 'flare':
        this.noiseHit(t, { type: 'bandpass', f: 400, f2: 3000, q: 1.5, a: 0.05, d: 0.5, vol: 0.18 });
        this.noiseHit(t + 0.55, { type: 'highpass', f: 1500, d: 0.25, vol: 0.2 });
        this.tone(t + 0.55, { f: 300, f2: 120, d: 0.2, vol: 0.12 });
        break;
      case 'hit':
        if (!this.ok(name, 0.08)) break;
        this.tone(t, { f: 110, f2: 40, d: 0.28, vol: 0.32, verb: 0.15 });
        this.noiseHit(t, { f: 1400, f2: 300, d: 0.32, vol: 0.28 });
        this.tone(t + 0.04, { type: 'sawtooth', f: 160 + Math.random() * 60, f2: 90, d: 0.35, vol: 0.05, verb: 0.2 });
        break;
      case 'wreck':
        this.noiseHit(t, { f: 2200, f2: 120, a: 0.01, d: 1.4, vol: 0.4, verb: 0.4 });
        this.tone(t, { f: 80, f2: 30, d: 0.6, vol: 0.35 });
        this.bell(196, 0.14, t + 0.8);
        this.bell(185, 0.1, t + 2.1);
        break;
      case 'splash': if (this.ok(name, 0.1)) this.noiseHit(t, { type: 'bandpass', f: 900, f2: 300, q: 0.8, d: 0.45, vol: 0.14 }); break;
      case 'burn': if (this.ok(name, 0.22)) this.noiseHit(t, { type: 'highpass', f: 3800, d: 0.18, vol: 0.05, verb: 0, rate: 1.4 }); break;
      case 'gloomDie':
        if (!this.ok(name, 0.08)) break;
        this.noiseHit(t, { type: 'bandpass', f: 2400, f2: 260, q: 3, d: 0.55, vol: 0.16, verb: 0.4 });
        this.tone(t, { type: 'triangle', f: 620, f2: 160, d: 0.5, vol: 0.06, verb: 0.4 });
        break;
      case 'latch': if (this.ok(name, 0.15)) { this.noiseHit(t, { f: 500, f2: 150, d: 0.22, vol: 0.18 }); this.tone(t, { f: 220, f2: 110, d: 0.2, vol: 0.08 }); } break;
      case 'wispDie': [0, 0.05, 0.1, 0.16].forEach((d, i) => this.tone(t + d, { f: 1200 + i * 330, d: 0.3, vol: 0.05, verb: 0.6 })); break;
      case 'wisp': if (this.ok(name, 0.6)) this.tone(t, { f: 880, f2: 860, a: 0.3, d: 1.2, vol: 0.025, verb: 0.8 }); break;
      case 'rumble': if (this.ok(name, 0.4)) { this.noiseHit(t, { f: 160, a: 0.4, d: 1.6, vol: 0.35, verb: 0.3 }); this.tone(t, { f: 46, a: 0.3, d: 1.5, vol: 0.2 }); } break;
      case 'grab': this.noiseHit(t, { f: 700, f2: 120, d: 0.5, vol: 0.3 }); this.tone(t, { type: 'sawtooth', f: 90, f2: 55, d: 0.6, vol: 0.08, verb: 0.3 }); break;
      case 'freed': this.noiseHit(t, { type: 'bandpass', f: 800, d: 0.5, vol: 0.2 }); this.bell(659, 0.1, t + 0.1); this.bell(880, 0.08, t + 0.22); break;
      case 'ghost': {
        if (!this.ok(name, 1)) break;
        this.tone(t, { f: 330, f2: 250, a: 0.6, d: 1.8, vol: 0.05, verb: 0.9, detune: 8 });
        this.tone(t, { f: 335, f2: 240, a: 0.6, d: 1.8, vol: 0.04, verb: 0.9 });
        this.noiseHit(t, { type: 'bandpass', f: 700, f2: 400, q: 4, a: 0.5, d: 1.6, vol: 0.06, verb: 0.8 });
        break;
      }
      case 'wraithDie': this.noiseHit(t, { type: 'bandpass', f: 300, f2: 3000, q: 2, a: 0.1, d: 1, vol: 0.18, verb: 0.8 }); [0, 0.1, 0.2].forEach((d, i) => this.tone(t + d, { f: 660 * (1 + i * 0.25), d: 0.8, vol: 0.05, verb: 0.8 })); break;
      case 'drain': this.tone(t, { type: 'sawtooth', f: 300, f2: 60, a: 0.05, d: 1.2, vol: 0.12, verb: 0.5 }); this.noiseHit(t, { f: 600, f2: 100, d: 1, vol: 0.15 }); break;
      case 'roar': {
        const c = this.ctx;
        const o = c.createOscillator(); o.type = 'sawtooth';
        const base = opt.high ? 95 : 62;
        o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 1.3, t + 0.5); o.frequency.linearRampToValueAtTime(base * 0.7, t + 2);
        const ws = c.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 3); } ws.curve = curve;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.setValueAtTime(300, t); bp.frequency.linearRampToValueAtTime(900, t + 0.5); bp.frequency.linearRampToValueAtTime(350, t + 2);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + (opt.long ? 3.2 : 2.1));
        o.connect(ws); ws.connect(bp); bp.connect(g); g.connect(this.busSfx);
        const s = c.createGain(); s.gain.value = 0.6; g.connect(s); s.connect(this.verb);
        o.start(t); o.stop(t + 3.3);
        this.noiseHit(t, { f: 400, a: 0.2, d: 1.8, vol: 0.2, verb: 0.4 });
        break;
      }
      case 'thunder': {
        const d = opt.delay || 0.4;
        this.noiseHit(t, { type: 'highpass', f: 2500, d: 0.15, vol: 0.12, verb: 0.3 });
        this.noiseHit(t + d, { f: 380, f2: 60, a: 0.08, d: 3.2, vol: 0.5, verb: 0.5, rate: 0.6 });
        break;
      }
      case 'incoming': if (this.ok(name, 1.2)) { this.tone(t, { f: 196, a: 0.15, d: 0.8, vol: 0.04, verb: 0.8 }); this.tone(t, { f: 294, a: 0.15, d: 0.8, vol: 0.025, verb: 0.8 }); } break;
      case 'dry': this.noiseHit(t, { f: 300, f2: 80, d: 0.6, vol: 0.25 }); this.tone(t, { f: 120, f2: 50, d: 0.6, vol: 0.15 }); break;
      case 'begin':
        this.noiseHit(t, { type: 'bandpass', f: 200, f2: 1600, q: 0.8, a: 0.3, d: 0.9, vol: 0.2, verb: 0.5 });
        [0, 4, 7].forEach((s, i) => this.tone(t + 0.25 + i * 0.07, { type: 'triangle', f: midiHz(57 + s), a: 0.2, d: 1.8, vol: 0.05, verb: 0.8 }));
        break;
      case 'buoy': this.bell(1175, 0.08); break;
      case 'star': this.bell([784, 988, 1175][opt.i || 0], 0.16); break;
      case 'win': [0, 4, 7, 12].forEach((s, i) => this.tone(t + i * 0.12, { type: 'triangle', f: midiHz(60 + s), a: 0.05, d: 2.2, vol: 0.07, verb: 0.8 })); break;
      case 'lose': [0, 3, 7].forEach(s => this.tone(t, { type: 'sawtooth', f: midiHz(38 + s), a: 0.4, d: 2.8, vol: 0.05, verb: 0.8 })); this.bell(147, 0.14, t + 0.4); break;
      case 'boss': this.play('roar', { long: true }); break;
      case 'achieve': this.bell(1047, 0.1); this.bell(1319, 0.08, t + 0.12); this.bell(1568, 0.07, t + 0.24); break;
    }
  }
}
