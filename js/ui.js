'use strict';
// DOM screens: title, chart, briefing, HUD, pause, results, workshop, logbook, settings, guide.

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const starsHtml = (n, max = 3) => `<span class="stars" aria-label="${n} of ${max} stars">${Array.from({ length: max }, (_, i) => `<span class="${i < n ? 'on' : ''}">${icon('star')}</span>`).join('')}</span>`;
const SHIP_ORDER = ['royal', 'galleon', 'cog', 'packet', 'skiff', 'trawler'];

const UI = {
  init(app) {
    this.app = app;
    this.root = $('#ui');
    this.hud = $('#hud');
    this.screen = null;
    this.root.addEventListener('click', e => this.onClick(e));
    this.root.addEventListener('pointerenter', e => { if (e.target.closest && e.target.closest('.btn,.night-btn,.tab,.rp')) app.audio.play('hover'); }, true);
    this.root.addEventListener('input', e => this.onInput(e));
    this.buildHud();
  },

  set(html, name) {
    this.root.innerHTML = html;
    this.screen = name;
    const f = this.root.firstElementChild;
    if (f) f.classList.add('fade-in');
  },
  clear() { this.root.innerHTML = ''; this.screen = null; },

  onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const act = el.dataset.act, arg = el.dataset.arg;
    const app = this.app;
    app.audio.init();
    if (act !== 'none') app.audio.play('click');
    switch (act) {
      case 'campaign': this.chart(); break;
      case 'title': this.title(); break;
      case 'night': app.startNight(+arg); break;
      case 'begin': app.beginNight(); break;
      case 'placeBuoys': this.showPrepBar(); break;
      case 'workshop': this.workshop(arg || 'title'); break;
      case 'buy': this.buy(arg); break;
      case 'logbook': this.logbook(arg || 'journal'); break;
      case 'settings': this.settings(arg || 'title'); break;
      case 'guide': this.guide(arg || 'title'); break;
      case 'endless': this.endless(); break;
      case 'pickRegion': this.endlessRegion = +arg; this.endless(); break;
      case 'startEndless': app.startEndless(this.endlessRegion || 0); break;
      case 'resume': app.resume(); break;
      case 'restart': app.restart(); break;
      case 'quit': app.quitToMenu(); break;
      case 'next': app.startNight(+arg); break;
      case 'back': this.goBack(arg); break;
      case 'toggle': this.toggleSetting(arg, el); break;
      case 'fullscreen': app.toggleFullscreen(); break;
      case 'reset': this.confirmReset(); break;
      case 'resetYes': Save.reset(); app.applySettings(); this.title(); this.toast('Progress cleared', 'The light passes to a new keeper.'); break;
      case 'rotateOk': document.body.classList.add('rotate-ok'); break;
    }
  },
  onInput(e) {
    const el = e.target;
    if (el.dataset.vol) {
      Save.data.settings[el.dataset.vol] = +el.value / 100;
      this.app.applySettings();
      Save.write();
    }
  },
  goBack(where) {
    if (where === 'title') this.title();
    else if (where === 'chart') this.chart();
    else if (where === 'pause') this.pause();
    else if (where === 'brief') this.app.startNight(this.app.match.n.nightIdx);
    else if (where === 'results') this.results(this.lastResult);
    else this.title();
  },

  // ---------- title
  title() {
    this.app.setMenuMode();
    const d = Save.data;
    const started = Object.keys(d.nights).length > 0;
    const endlessOk = Save.endlessUnlocked();
    this.set(`
      <div class="scrim light"></div>
      <div class="title-wrap">
        <div class="title-col">
          <h1 class="logo">Gloam<em>light</em></h1>
          <p class="tagline">Keep the lamp lit. Show the ships the rocks. Burn back what lives in the dark.</p>
          <nav class="menu-list">
            <button class="btn primary" data-act="campaign">${icon('chart')}${started ? 'Continue the watch' : 'Take the watch'}</button>
            <button class="btn" data-act="endless" ${endlessOk ? '' : 'disabled title="Finish Saltmere Cove to unlock"'}>${icon(endlessOk ? 'moon' : 'lock')}The Long Night</button>
            <button class="btn" data-act="workshop" data-arg="title">${icon('gears')}Workshop</button>
            <button class="btn" data-act="logbook">${icon('book')}Logbook</button>
            <button class="btn" data-act="guide" data-arg="title">${icon('lens')}How to keep a light</button>
            <button class="btn" data-act="settings" data-arg="title">${icon('gear')}Settings</button>
          </nav>
          <div class="menu-foot"><span class="coinline">${icon('coin')}${d.coins}</span><span>${icon('star')} ${Save.totalStars()} / ${NIGHTS.length * 3}</span><span>v${GAME_VERSION}</span></div>
        </div>
      </div>`, 'title');
  },

  thumb(r) {
    this.thumbs = this.thumbs || {};
    if (this.thumbs[r]) return this.thumbs[r];
    const R = REGIONS[r], P = R.palette, W = 400, H = 225, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(R.lighthouse.x / 4, R.lighthouse.y / 4, 10, R.lighthouse.x / 4, R.lighthouse.y / 4, 260);
    g.addColorStop(0, P.sea); g.addColorStop(1, P.deep);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.scale(W / WORLD_W, H / WORLD_H);
    const polys = coastPolys(R);
    x.beginPath(); for (const p of polys) { p.pts.forEach((pt, i) => (i ? x.lineTo(pt[0], pt[1]) : x.moveTo(pt[0], pt[1]))); x.closePath(); }
    x.strokeStyle = P.shallow; x.lineWidth = 26; x.globalAlpha = 0.5; x.stroke(); x.globalAlpha = 1;
    x.fillStyle = P.grass; x.fill();
    x.strokeStyle = P.sand; x.lineWidth = 8; x.stroke();
    const L = R.lighthouse;
    x.save(); x.translate(L.x, L.y); x.rotate(-0.6);
    const bg = x.createLinearGradient(0, 0, 700, 0); bg.addColorStop(0, 'rgba(255,226,160,0.55)'); bg.addColorStop(1, 'rgba(255,226,160,0)');
    x.fillStyle = bg; x.beginPath(); x.moveTo(0, -12); x.lineTo(700, -150); x.lineTo(700, 150); x.lineTo(0, 12); x.fill();
    x.restore();
    x.fillStyle = '#fff0c4'; x.beginPath(); x.arc(L.x, L.y, 16, 0, TAU); x.fill();
    return (this.thumbs[r] = c.toDataURL('image/png'));
  },

  // ---------- campaign chart
  chart() {
    this.app.setMenuMode();
    const nextIdx = NIGHTS.findIndex((n, i) => Save.unlocked(i) && !Save.nightDone(n.id));
    const regions = REGIONS.map((R, r) => {
      const nights = NIGHTS.map((n, i) => ({ n, i })).filter(o => o.n.region === r);
      const open = Save.unlocked(nights[0].i);
      const p = R.palette;
      return `<section class="panel region ${open ? '' : 'locked'}">
        <span class="kicker">Posting ${r + 1}</span>
        <h3>${esc(R.name)}</h3>
        <div class="sub">${esc(R.sub)}</div>
        <div class="region-art" style="background:${p.deep} url(${this.thumb(r)}) center/cover no-repeat"></div>
        <div class="nights">
          ${nights.map(({ n, i }) => {
            const ok = Save.unlocked(i);
            const st = (Save.data.nights[n.id] || {}).stars || 0;
            return `<button class="night-btn ${i === nextIdx ? 'next' : ''}" data-act="night" data-arg="${i}" ${ok ? '' : 'disabled'}>
              <span class="num">${String(i + 1).padStart(2, '0')}</span>
              <span class="nm">${esc(n.name)}</span>
              ${ok ? starsHtml(st) : icon('lock')}
            </button>`;
          }).join('')}
        </div>
      </section>`;
    }).join('');
    this.set(`
      <div class="scrim"></div>
      <div class="page">
        <div class="page-head">
          <button class="btn iconbtn ghost" data-act="title" aria-label="Back">${icon('back')}</button>
          <h2>The Coast</h2>
          <span class="coinline">${icon('coin')}${Save.data.coins}</span>
          <button class="btn small" data-act="workshop" data-arg="chart">${icon('gears')}Workshop</button>
        </div>
        <div class="page-body"><div class="chart-grid">${regions}</div></div>
      </div>`, 'chart');
  },

  // ---------- briefing during dusk
  briefing(i, match) {
    const n = NIGHTS[i], R = REGIONS[n.region], night = match.n;
    const counts = {};
    for (const [t, c] of n.ships) counts[t] = (counts[t] || 0) + c;
    const ships = SHIP_ORDER.filter(t => counts[t]).map(t => `<span class="chip" title="${esc(SHIP_TYPES[t].desc)}"><b>${counts[t]}</b>${esc(SHIP_TYPES[t].name)}</span>`).join('');
    const mons = {};
    for (const [k, c] of n.monsters || []) mons[k] = (mons[k] || 0) + c;
    const threats = Object.keys(mons).map(k => `<span class="chip threat" title="${esc(MONSTER_TYPES[k].desc)}"><b>${mons[k]}</b>${esc(MONSTER_TYPES[k].name)}${mons[k] > 1 && k !== 'kraken' ? 's' : k === 'kraken' && mons[k] > 1 ? 's' : ''}</span>`);
    if (n.boss) threats.push(`<span class="chip threat"><b>!</b>${esc(MONSTER_TYPES[n.boss].name)}</span>`);
    if (n.fog) threats.push(`<span class="chip threat">Fog banks</span>`);
    if (n.storm) threats.push(`<span class="chip threat">${n.storm >= 0.8 ? 'Heavy storm' : 'Squalls'}</span>`);
    if (n.currents) threats.push(`<span class="chip threat">Tide races</span>`);
    const docks = night.map.activeDocks.map(k => { const st = night.map.docks[k].style; return `<span class="chip"><span class="dot" style="background:${st.color}"></span>${st.name} pier</span>`; }).join('');
    const best = (Save.data.nights[n.id] || {}).stars || 0;
    const buoys = night.buoyLimit();
    const hint = HINTS[(i * 7 + Save.data.stats.nights) % HINTS.length];
    this.set(`
      <aside class="panel brief"><div class="brief-body">
        <div><span class="kicker">${esc(R.name)} · Night ${i + 1} of ${NIGHTS.length}</span>
        <h2>${esc(n.name)}</h2>${best ? `<div style="margin-top:6px">${starsHtml(best)}</div>` : ''}</div>
        <p class="log">${esc(n.log)}</p>
        <div><span class="kicker">Expected tonight</span><div class="manifest" style="margin-top:8px">${ships}</div></div>
        ${threats.length ? `<div><span class="kicker">On the water</span><div class="manifest" style="margin-top:8px">${threats.join('')}</div></div>` : ''}
        <div><span class="kicker">Piers</span><div class="manifest" style="margin-top:8px">${docks}</div></div>
        <p class="rules">The night is lost if <strong>more than ${n.maxWrecks} ships</strong> are wrecked${counts.royal ? ', or if <strong>the envoy\'s barque</strong> goes down' : ''}. No wrecks earns three stars.</p>
        <div class="hintline">${esc(hint)}</div>
        </div>
        <div class="actions">
          ${buoys ? `<button class="btn" data-act="placeBuoys">${icon('buoy')}Anchor buoys (${buoys})</button>` : ''}
          <button class="btn primary" data-act="begin">${icon('burner')}Light the lamp</button>
          <button class="btn small ghost" data-act="back" data-arg="chart">${icon('back')}Chart</button>
          <button class="btn small ghost" data-act="workshop" data-arg="brief">${icon('gears')}Workshop</button>
        </div>
      </aside>`, 'brief');
    this.hidePrepBar();
  },

  endlessBrief(match) {
    const R = match.n.region;
    this.set(`
      <aside class="panel brief"><div class="brief-body">
        <div><span class="kicker">The Long Night · ${esc(R.name)}</span><h2>No dawn tonight</h2></div>
        <p class="log">Ships keep coming and so does the Gloam, faster as the hours pass. Bring home as many as you can. The watch ends when ${ENDLESS.maxWrecks} ships have been wrecked.</p>
        <p class="rules">Best so far: <strong>${Save.data.endless.best}</strong> ships home.</p>
        </div>
        <div class="actions">
          ${match.n.buoyLimit() ? `<button class="btn" data-act="placeBuoys">${icon('buoy')}Anchor buoys (${match.n.buoyLimit()})</button>` : ''}
          <button class="btn primary" data-act="begin">${icon('burner')}Light the lamp</button>
          <button class="btn small ghost" data-act="endless">${icon('back')}Back</button>
        </div>
      </aside>`, 'brief');
    this.hidePrepBar();
  },

  // ---------- HUD
  buildHud() {
    this.hud.innerHTML = `
      <div class="hud-top">
        <div class="hbox oil" id="hOil" title="Lamp oil">${icon('oil')}<div class="meter"><i></i></div><span class="num" id="hOilN">100</span></div>
        <div class="hbox tally" id="hTally">
          <span class="grp" id="hSavedG" title="Ships home">${icon('ship')}<span class="num" id="hSaved">0</span><span style="color:var(--muted)">/</span><span class="num" id="hTotal" style="text-align:left">0</span></span>
          <span class="grp" id="hWreckG" title="Wrecks allowed">${icon('wreck')}<span class="wreckpips" id="hWrecks"></span></span>
        </div>
        <span class="spacer"></span>
        <button class="btn iconbtn hbox" id="hPause" aria-label="Pause">${icon('pause')}</button>
      </div>
      <div class="boss" id="hBoss" hidden><label>The Hollow Mouth</label><div class="meter"><i></i></div></div>
      <div class="banner" id="hBanner"></div>
      <div class="hint panel" id="hHint" hidden>${icon('lens')}<span></span></div>
      <div class="keyhints" id="hKeys"></div>
      <div class="abil" id="hAbil">
        <button class="abtn" id="bFocus" aria-label="Focus the beam (hold)">${icon('focus')}<small>Focus</small></button>
        <button class="abtn" id="bFlare" aria-label="Throw a flare">${icon('flare')}<small>Flare</small><span class="cnt" id="bFlareN">0</span></button>
        <button class="abtn" id="bHorn" aria-label="Sound the foghorn">${icon('horn')}<small>Horn</small><svg class="cd" viewBox="0 0 72 72"><circle cx="36" cy="36" r="34" id="bHornCd" stroke-dasharray="213.6" stroke-dashoffset="0"/></svg></button>
      </div>
      <div class="prepbar panel" id="hPrep" hidden><span class="txt" id="hPrepTxt"></span><button class="btn primary small" id="hPrepGo">${icon('burner')}Light the lamp</button></div>`;
    const app = this.app;
    $('#hPause').addEventListener('click', () => { app.audio.play('click'); app.pause(); });
    $('#hPrepGo').addEventListener('click', () => { app.audio.play('click'); app.beginNight(); });
    const f = $('#bFocus');
    const fOn = e => { e.preventDefault(); app.match && app.match.setBtnFocus(true); f.classList.add('on'); };
    const fOff = () => { app.match && app.match.setBtnFocus(false); f.classList.remove('on'); };
    f.addEventListener('pointerdown', fOn); f.addEventListener('pointerup', fOff); f.addEventListener('pointerleave', fOff); f.addEventListener('pointercancel', fOff);
    $('#bFlare').addEventListener('click', () => { if (app.match) { const armed = app.match.armFlare(); $('#bFlare').classList.toggle('armed', !!armed); } });
    $('#bHorn').addEventListener('click', () => app.match && app.match.hornBtn());
    for (const b of this.hud.querySelectorAll('.abtn,#hPause,#hPrepGo')) b.addEventListener('pointerdown', e => e.stopPropagation());
    this.hudCache = {};
  },
  showHud(on) {
    this.hud.hidden = !on;
    if (on) this.hudCache = {};
  },
  isPrepActive() { return !$('#hPrep').hidden || (this.screen === 'brief' && window.innerWidth > 760); },
  showPrepBar() {
    this.clear();
    this.showHud(true);
    $('#hPrep').hidden = false;
    $('#hAbil').hidden = true;
    this.refreshPrep();
  },
  hidePrepBar() { $('#hPrep').hidden = true; $('#hAbil').hidden = false; },
  refreshPrep() {
    const m = this.app.match; if (!m) return;
    const left = m.n.buoyLimit() - m.n.buoys.length;
    $('#hPrepTxt').innerHTML = `Tap the sea to anchor a buoy: <b>${left}</b> left. Tap a buoy to lift it.`;
  },
  flashBuoyCount() { const p = $('#hPrep'); p.classList.remove('flash'); void p.offsetWidth; p.classList.add('flash'); },

  updateHud(match) {
    const n = match.n, c = this.hudCache;
    const set = (id, v, fn) => { if (c[id] !== v) { c[id] = v; fn(v); } };
    const oilF = n.oil / n.k.oilMax;
    set('oil', Math.round(oilF * 200), v => { $('#hOil .meter i').style.width = (v / 2) + '%'; });
    set('oilN', Math.ceil(n.oil), v => { $('#hOilN').textContent = v; });
    set('oilLow', oilF < 0.2, v => $('#hOil').classList.toggle('low', v));
    set('saved', n.stats.saved, v => { $('#hSaved').textContent = v; });
    set('total', n.endless ? '∞' : n.totalShips, v => { $('#hTotal').textContent = v; });
    set('wrecks', n.stats.wrecked + '/' + n.maxWrecks, () => {
      // pips show how many more wrecks the port will forgive
      const allowed = n.maxWrecks + (n.endless ? 0 : 1);
      let h = '';
      for (let i = 0; i < allowed; i++) h += `<i class="${i < n.stats.wrecked ? 'on' : ''}"></i>`;
      $('#hWrecks').innerHTML = h;
      $('#hWreckG').title = n.endless ? `${n.stats.wrecked} of ${n.maxWrecks} wrecks: the watch ends at ${n.maxWrecks}` : `${n.stats.wrecked} wrecked. The night is lost after ${n.maxWrecks}.`;
    });
    set('flares', n.canFlare ? n.flaresLeft : -1, v => { $('#bFlareN').textContent = Math.max(0, v); $('#bFlare').classList.toggle('off', v <= 0); $('#bFlare').style.display = n.canFlare ? '' : 'none'; });
    if (!match.input.flareArmed) $('#bFlare').classList.remove('armed');
    set('horn', n.canHorn ? Math.ceil(n.hornT * 10) : -1, () => {
      $('#bHorn').style.display = n.canHorn ? '' : 'none';
      const f = n.hornT / n.k.hornCd;
      $('#bHornCd').setAttribute('stroke-dashoffset', String(213.6 * f));
      $('#bHorn').classList.toggle('off', n.hornT > 0);
    });
    set('focusOn', n.beam.focus > 0.5, v => $('#bFocus').classList.toggle('on', v));
    const b = n.boss;
    set('boss', b ? Math.round(b.hp) + (b.dead ? 'd' : '') : -1, () => {
      $('#hBoss').hidden = !b || b.dead;
      if (b) $('#hBoss .meter i').style.width = (100 * b.hp / b.maxHp) + '%';
    });
    const hint = match.hint;
    set('hint', hint || '', v => { const h = $('#hHint'); h.hidden = !v; if (v) h.querySelector('span').textContent = v; });
    set('prep', n.state === 'prep', v => { if (!v) this.hidePrepBar(); this.hud.classList.toggle('prep', v); });
    set('keys', (n.canFlare ? 'f' : '') + (n.canHorn ? 'h' : '') + (hint ? 'x' : ''), () => {
      const k = $('#hKeys');
      k.hidden = !!hint;
      k.innerHTML = '<kbd>Mouse</kbd> aim · <kbd>Hold click</kbd>/<kbd>Shift</kbd> focus' + (n.canFlare ? ' · <kbd>Right click</kbd>/<kbd>F</kbd> flare' : '') + (n.canHorn ? ' · <kbd>Space</kbd> horn' : '') + ' · <kbd>Esc</kbd> pause';
    });
  },
  pulse(which) {
    const el = which === 'saved' ? $('#hSavedG') : which === 'wrecks' ? $('#hWreckG') : $('#hOil');
    if (!el) return;
    el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
  },
  banner(text, kind = '') {
    const el = $('#hBanner');
    el.textContent = text; el.className = 'banner show ' + kind;
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => { el.className = 'banner ' + kind; }, 2600);
  },

  // ---------- pause
  pause() {
    const m = this.app.match;
    const n = m.n;
    const title = n.endless ? 'The Long Night' : NIGHTS[n.nightIdx].name;
    this.set(`
      <div class="modal-wrap">
        <div class="panel modal">
          <h2>Paused</h2><div class="sub">${esc(title)}</div>
          <div class="rows">
            <span>Ships home</span><span>${n.stats.saved}${n.endless ? '' : ' / ' + n.totalShips}</span>
            <span>Wrecks</span><span>${n.stats.wrecked}${n.endless ? ' / ' + n.maxWrecks : ' (lose after ' + n.maxWrecks + ')'}</span>
            <span>Time on watch</span><span>${fmtTime(n.t)}</span>
          </div>
          <div class="actions">
            <button class="btn primary" data-act="resume">${icon('play')}Resume</button>
            <button class="btn" data-act="restart">${icon('restart')}Restart</button>
            <button class="btn" data-act="settings" data-arg="pause">${icon('gear')}Settings</button>
            <button class="btn" data-act="guide" data-arg="pause">${icon('lens')}Guide</button>
            <button class="btn ghost" data-act="quit">${icon('back')}${n.endless ? 'End the watch' : 'Leave to chart'}</button>
          </div>
        </div>
      </div>`, 'pause');
  },

  // ---------- results
  results(res) {
    this.lastResult = res;
    const r = res.r;
    const won = r.won;
    const nightDef = res.nightIdx >= 0 ? NIGHTS[res.nightIdx] : null;
    let title, sub;
    if (res.endless) { title = 'The watch ends'; sub = `${r.saved} ships brought home${res.newBest ? ' — a new record' : ''}`; }
    else if (won) { title = res.nightIdx === NIGHTS.length - 1 ? 'Dawn, at last' : 'Dawn breaks'; sub = nightDef.name; }
    else { title = 'The port is closed'; sub = r.reason === 'vip' ? 'The envoy\'s barque went down.' : 'Too many ships were lost tonight.'; }
    const next = !res.endless && won && res.nightIdx + 1 < NIGHTS.length ? res.nightIdx + 1 : -1;
    const st = r.stats;
    const rows = [
      ['Ships home', res.endless ? r.saved : `${r.saved} / ${r.total}`],
      ['Wrecks', r.wrecked],
      ['Oil left', Math.round(r.oilFrac * 100) + '%'],
    ];
    if (st.glooms) rows.push(['Shades burned', st.glooms]);
    if (st.wisps) rows.push(['False lights dispelled', st.wisps]);
    if (st.krakens) rows.push(['Krakens driven off', st.krakens]);
    if (st.wraiths) rows.push(['Drowned galleons banished', st.wraiths]);
    if (res.firstClear) rows.push(['First watch bonus', '+' + res.firstClear]);
    const actions = [];
    if (next >= 0) actions.push(`<button class="btn primary" data-act="next" data-arg="${next}">${icon('play')}Next night</button>`);
    if (!won || res.endless) actions.push(`<button class="btn ${next < 0 && !won ? 'primary' : ''}" data-act="restart">${icon('restart')}${res.endless ? 'Again' : 'Try again'}</button>`);
    else if (r.stars < 3) actions.push(`<button class="btn" data-act="restart">${icon('restart')}Replay for stars</button>`);
    actions.push(`<button class="btn" data-act="workshop" data-arg="results">${icon('gears')}Workshop</button>`);
    actions.push(`<button class="btn ghost" data-act="quit">${icon('chart')}${res.endless ? 'Menu' : 'Chart'}</button>`);
    this.set(`
      <div class="modal-wrap">
        <div class="panel modal">
          <h2>${esc(title)}</h2><div class="sub">${esc(sub)}</div>
          ${!res.endless && won ? `<div class="bigstars" id="rStars">${[0, 1, 2].map(i => `<span data-i="${i}">${icon('star')}</span>`).join('')}</div>` : ''}
          ${res.nightIdx === NIGHTS.length - 1 && won ? `<p class="log" style="text-align:left">The Hollow Mouth sinks into the Crown and does not rise. Grey light spreads over the water. Somewhere in the drowned tower an old lamp gutters out, its work done. Yours goes on. Every coast needs a keeper.</p>` : ''}
          <div class="rows">
            ${rows.map(([a, b]) => `<span>${esc(a)}</span><span>${esc(b)}</span>`).join('')}
            <span class="total">Coins earned</span><span class="total" id="rCoins">0</span>
          </div>
          <div class="actions">${actions.join('')}</div>
        </div>
      </div>`, 'results');
    // animate
    const target = r.coins + (res.firstClear || 0);
    const el = $('#rCoins');
    const t0 = performance.now();
    const step = () => {
      if (!document.body.contains(el)) return;
      const k = clamp((performance.now() - t0) / 900, 0, 1);
      el.textContent = Math.round(target * easeOut(k));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    if (!res.endless && won) {
      for (let i = 0; i < r.stars; i++) setTimeout(() => { const s = $(`#rStars [data-i="${i}"]`); if (s) { s.classList.add('on'); this.app.audio.play('star', { i }); } }, 450 + i * 380);
    }
  },

  // ---------- workshop
  workshop(from) {
    this.wsFrom = from;
    const d = Save.data;
    const cards = UPGRADES.map(u => {
      const lv = Save.upLevel(u.id), max = u.vals.length - 1;
      const locked = u.needs && !Save.nightDone(u.needs);
      const cost = lv < max ? u.cost[lv] : 0;
      const cur = u.fmt(u.vals[lv]), nxt = lv < max ? u.fmt(u.vals[lv + 1]) : null;
      return `<div class="panel up ${lv >= max ? 'maxed' : ''}">
        <div class="up-head">${icon(u.icon)}<h4>${esc(u.name)}</h4></div>
        <p>${esc(u.desc)}</p>
        <div class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>
        <div class="up-val">${esc(cur)}${nxt ? ` → <b>${esc(nxt)}</b>` : ''}</div>
        ${locked ? `<button class="btn small" disabled>${icon('lock')}Finish ${esc(NIGHTS[NIGHT_INDEX(u.needs)].name)}</button>`
          : lv >= max ? `<button class="btn small" disabled>Fully fitted</button>`
          : `<button class="btn small ${d.coins >= cost ? 'primary' : ''}" data-act="buy" data-arg="${u.id}" ${d.coins >= cost ? '' : 'disabled'}>${icon('coin')}${cost}</button>`}
      </div>`;
    }).join('');
    this.set(`
      <div class="scrim"></div>
      <div class="page">
        <div class="page-head">
          <button class="btn iconbtn ghost" data-act="back" data-arg="${from}" aria-label="Back">${icon('back')}</button>
          <h2>The Workshop</h2>
          <span class="coinline" style="font-size:18px">${icon('coin')}${d.coins}</span>
        </div>
        <div class="page-body"><div class="ws-grid">${cards}</div></div>
      </div>`, 'workshop');
  },
  buy(id) {
    const u = UPGRADES.find(x => x.id === id);
    const lv = Save.upLevel(id);
    if (lv >= u.vals.length - 1) return;
    const cost = u.cost[lv];
    if (Save.data.coins < cost) { this.app.audio.play('deny'); return; }
    Save.data.coins -= cost;
    Save.data.upgrades[id] = lv + 1;
    Save.write();
    this.app.audio.play('buy');
    this.app.checkAchievements();
    const scroll = $('.page-body') ? $('.page-body').scrollTop : 0;
    this.workshop(this.wsFrom);
    const pb = $('.page-body'); if (pb) pb.scrollTop = scroll;
  },

  // ---------- logbook
  logbook(tab) {
    const d = Save.data;
    let body = '';
    if (tab === 'journal') {
      const entries = NIGHTS.map((n, i) => ({ n, i })).filter(({ n, i }) => Save.unlocked(i));
      body = `<div class="journal">${entries.map(({ n, i }) => `<div class="entry"><div class="kicker">${esc(REGIONS[n.region].name)} · Night ${i + 1}</div><h4>${esc(n.name)}</h4><p class="log">${esc(n.log)}</p></div>`).join('')}
        ${Save.nightDone('d5') ? `<div class="entry"><div class="kicker">The Drowned Crown · After</div><h4>Morning</h4><p class="log">I have brought Ansel's coat home to Saltmere and hung it by the door. The lamp still needs lighting every night, and I still light it. Some nights I could swear I hear the old man breathing beside me, steady and slow.</p></div>` : ''}</div>`;
    } else if (tab === 'marks') {
      const got = ACHIEVEMENTS.filter(a => d.ach[a.id]).length;
      body = `<p class="rules" style="margin:0 0 12px">${got} of ${ACHIEVEMENTS.length} marks earned.</p><div class="ach-grid">${ACHIEVEMENTS.map(a => `<div class="ach ${d.ach[a.id] ? 'got' : ''}">${icon('trophy')}<div><b>${esc(a.name)}</b><span>${esc(a.desc)}</span></div></div>`).join('')}</div>`;
    } else {
      const s = d.stats;
      const items = [[s.saved, 'Ships brought home'], [s.wrecked, 'Ships wrecked'], [s.nights, 'Nights kept'], [s.clean, 'Nights without a wreck'], [s.glooms, 'Shades burned'], [s.wisps, 'False lights dispelled'], [s.krakens, 'Krakens driven off'], [s.wraiths, 'Ghost ships banished'], [s.flares, 'Flares thrown'], [s.horns, 'Foghorn blasts'], [d.endless.best, 'Long Night record'], [fmtDur(s.playTime), 'Time on watch']];
      body = `<div class="stat-grid">${items.map(([v, l]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
    }
    this.set(`
      <div class="scrim"></div>
      <div class="page">
        <div class="page-head">
          <button class="btn iconbtn ghost" data-act="title" aria-label="Back">${icon('back')}</button>
          <h2>Logbook</h2>
          <div class="tabs">
            <button class="tab ${tab === 'journal' ? 'on' : ''}" data-act="logbook" data-arg="journal">Journal</button>
            <button class="tab ${tab === 'marks' ? 'on' : ''}" data-act="logbook" data-arg="marks">Marks</button>
            <button class="tab ${tab === 'records' ? 'on' : ''}" data-act="logbook" data-arg="records">Records</button>
          </div>
        </div>
        <div class="page-body">${body}</div>
      </div>`, 'logbook');
  },

  // ---------- settings
  settings(from) {
    this.setFrom = from;
    const s = Save.data.settings;
    const slider = (k, label) => `<div class="setrow"><label for="v_${k}">${label}</label><input id="v_${k}" type="range" min="0" max="100" value="${Math.round(s[k] * 100)}" data-vol="${k}"></div>`;
    const tog = (k, label, sub) => `<div class="setrow"><label>${label}${sub ? `<small>${sub}</small>` : ''}</label><button class="toggle ${s[k] ? 'on' : ''}" data-act="toggle" data-arg="${k}" role="switch" aria-checked="${!!s[k]}" aria-label="${esc(label)}"></button></div>`;
    this.set(`
      <div class="scrim"></div>
      <div class="page">
        <div class="page-head">
          <button class="btn iconbtn ghost" data-act="back" data-arg="${from}" aria-label="Back">${icon('back')}</button>
          <h2>Settings</h2>
        </div>
        <div class="page-body"><div class="settings">
          ${slider('master', 'Master volume')}
          ${slider('music', 'Music')}
          ${slider('sfx', 'Sound effects')}
          ${slider('amb', 'Sea and weather')}
          ${tog('shake', 'Screen shake')}
          ${tog('reduceFlash', 'Gentle lightning', 'Softens lightning flashes')}
          ${tog('hints', 'Tutorial hints', 'Show tips during the first nights')}
          ${tog('badges', 'Destination badges', 'Mark each ship with its pier symbol, not just its colour')}
          <div class="setrow"><label>Fullscreen</label><button class="btn small" data-act="fullscreen">${icon('full')}Toggle</button></div>
          ${from === 'title' ? `<div class="setrow"><label>Reset progress<small>Clears nights, coins, upgrades and marks</small></label><button class="btn small" data-act="reset">Reset</button></div>` : ''}
          ${Save.ok ? '' : '<p class="rules">This browser is blocking storage, so progress will not be saved after you close the page.</p>'}
        </div></div>
      </div>`, 'settings');
  },
  toggleSetting(k, el) {
    Save.data.settings[k] = !Save.data.settings[k];
    el.classList.toggle('on', Save.data.settings[k]);
    el.setAttribute('aria-checked', String(Save.data.settings[k]));
    Save.write();
    this.app.applySettings();
  },
  confirmReset() {
    this.set(`
      <div class="modal-wrap">
        <div class="panel modal">
          <h2>Clear all progress?</h2>
          <div class="sub">Nights, stars, coins, upgrades and marks will be gone. This can't be undone.</div>
          <div class="actions">
            <button class="btn" data-act="settings" data-arg="title">Keep my progress</button>
            <button class="btn" style="border-color:rgba(232,101,79,.6);color:#ffb3a5" data-act="resetYes">Clear everything</button>
          </div>
        </div>
      </div>`, 'confirm');
  },

  // ---------- guide
  guide(from) {
    const beasts = Object.entries(MONSTER_TYPES).filter(([k]) => k !== 'leviathan').map(([k, m]) => `<div class="beast"><b>${esc(m.name)}</b><br><span class="rules">${esc(m.desc)}</span></div>`).join('');
    const ships = SHIP_ORDER.map(t => `<div class="beast"><b>${esc(SHIP_TYPES[t].name)}</b><br><span class="rules">${esc(SHIP_TYPES[t].desc)}</span></div>`).join('');
    this.set(`
      <div class="scrim"></div>
      <div class="page">
        <div class="page-head">
          <button class="btn iconbtn ghost" data-act="back" data-arg="${from}" aria-label="Back">${icon('back')}</button>
          <h2>How to keep a light</h2>
        </div>
        <div class="page-body"><div class="guide">
          <div><h3>The job</h3><p>Ships sail in from the open sea, bound for the pier that matches the colour of their lantern. You never steer them. While your beam is on a ship, its crew can see the rocks and will follow the safe channel. In the dark they hold the last course they had, drift, and run onto whatever is in the way. Out on the open sea, beyond the Gloam, captains manage on their own. They lose their way as they come in toward the coast and your light.</p></div>
          <div><h3>The lamp</h3><p>The beam burns oil, and a focused beam burns a lot more. Focusing narrows the beam but throws it further and makes it brighter, which you need for fog, far piers and the bigger creatures. Every ship that docks tops up your oil. Oil trawlers bring the most. If the lamp runs dry, it shrinks to a weak glow until more oil arrives.</p></div>
          <div><h3>Controls</h3><div class="ctrl-table">
            <kbd>Mouse / drag</kbd><span>Swing the beam toward the pointer</span>
            <kbd>Hold left click · Shift · W</kbd><span>Focus the beam</span>
            <kbd>Right click · F</kbd><span>Throw a flare where you point (from Night 4)</span>
            <kbd>Space</kbd><span>Foghorn: scatters shades and puts every lost ship back on course (from Night 5)</span>
            <kbd>A / D · ← / →</kbd><span>Turn the beam with the keyboard</span>
            <kbd>Esc · P</kbd><span>Pause</span>
            <kbd>Touch</kbd><span>Drag to aim. Use the Focus, Flare and Horn buttons. Tap Flare, then tap the sea.</span>
          </div></div>
          <div><h3>Ships</h3><div class="bestiary">${ships}</div></div>
          <div><h3>What lives in the Gloam</h3><div class="bestiary">${beasts}</div></div>
          <div><h3>Between nights</h3><p>Coins from delivered cargo buy upgrades in the Workshop. Bell buoys, once you own them, are anchored at dusk before you light the lamp: tap the sea beside a dangerous reef. If a night goes badly, you still keep part of what you earned, so a hard night can be won with a better lamp.</p></div>
        </div></div>
      </div>`, 'guide');
  },

  // ---------- endless
  endless() {
    this.app.setMenuMode();
    if (this.endlessRegion == null) this.endlessRegion = Save.data.endless.bestRegion || 0;
    const opts = REGIONS.map((R, r) => {
      const first = NIGHTS.findIndex(n => n.region === r);
      const ok = Save.unlocked(first) && Save.nightDone(NIGHTS[first].id);
      return `<button class="rp ${this.endlessRegion === r ? 'on' : ''}" data-act="pickRegion" data-arg="${r}" ${ok ? '' : 'disabled'}><b>${esc(R.name)}</b><span>${ok ? esc(R.sub) : 'Keep a night here first'}</span></button>`;
    }).join('');
    this.set(`
      <div class="scrim"></div>
      <div class="page">
        <div class="page-head">
          <button class="btn iconbtn ghost" data-act="title" aria-label="Back">${icon('back')}</button>
          <h2>The Long Night</h2>
          <span class="coinline">${icon('trophy')} Record: ${Save.data.endless.best}</span>
        </div>
        <div class="page-body">
          <p class="rules" style="max-width:640px;margin:0 0 14px">An endless watch with your current lamp. Ships and creatures come faster as the hours pass. Fog rolls in after a while, then storms. The watch ends after ${ENDLESS.maxWrecks} wrecks. You keep 60% of the cargo value as coins.</p>
          <div class="region-pick">${opts}</div>
          <div style="margin-top:18px"><button class="btn primary" data-act="startEndless">${icon('moon')}Begin the watch</button></div>
        </div>
      </div>`, 'endless');
  },

  // ---------- toasts
  toast(title, sub) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `${icon('trophy')}<div>${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
    box.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3600);
    setTimeout(() => el.remove(), 4100);
  },
};
