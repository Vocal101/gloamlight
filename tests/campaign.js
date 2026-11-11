'use strict';
// Plays the whole campaign with the bot, buying upgrades between nights and retrying losses.
// Usage: node tests/campaign.js [skill=1] [seedRuns=1]
const { load } = require('./load');
const { g } = load();
const NIGHTS = g('NIGHTS'), UPGRADES = g('UPGRADES'), Night = g('Night'), KeeperBot = g('KeeperBot'), DT = g('DT');
const skill = +(process.argv[2] || 1);
const PRIORITY = ['gears', 'lens', 'wick', 'reflector', 'cistern', 'flares', 'burner', 'charts', 'horn', 'harbor', 'twin', 'lens', 'gears', 'wick'];
function playNight(i, upgrades, seed) {
  const n = new Night({ night: i, upgrades, seed });
  const bot = new KeeperBot(n, skill);
  n.begin();
  let steps = 0;
  while (n.state === 'run' && steps < 60 * 1200) { bot.update(DT); n.step(DT); steps++; }
  return n.result || { won: false, coins: 0, saved: 0, wrecked: 99, stars: 0, reason: 'timeout', time: n.t };
}
function shop(save) {
  let bought = true;
  while (bought) {
    bought = false;
    for (const id of PRIORITY) {
      const u = UPGRADES.find(x => x.id === id);
      const lv = save.upgrades[id] || 0;
      if (lv >= u.vals.length - 1) continue;
      if (u.needs && !save.done[u.needs]) continue;
      if (save.coins >= u.cost[lv]) { save.coins -= u.cost[lv]; save.upgrades[id] = lv + 1; bought = true; break; }
    }
  }
}
const save = { coins: 0, upgrades: {}, done: {} };
let totalAttempts = 0;
for (let i = 0; i < NIGHTS.length; i++) {
  let attempts = 0, r;
  do {
    shop(save);
    r = playNight(i, save.upgrades, 1000 + attempts * 7919 + i);
    attempts++;
    save.coins += r.coins;
    if (r.won && !save.done[NIGHTS[i].id]) save.coins += 40 + i * 6;
  } while (!r.won && attempts < 8);
  totalAttempts += attempts;
  save.done[NIGHTS[i].id] = true;
  const ups = Object.entries(save.upgrades).map(([k, v]) => k + v).join(' ');
  console.log(NIGHTS[i].id.padEnd(4), 'tries', attempts, r.won ? 'won ' : 'LOST', 'stars', r.stars, 'saved', r.saved + '/' + r.total, 'wr', r.wrecked, 'oil', Math.round(r.oilFrac * 100) + '%', 't', Math.round(r.time) + 's', 'coins', save.coins, '|', ups);
}
console.log('total attempts', totalAttempts);
