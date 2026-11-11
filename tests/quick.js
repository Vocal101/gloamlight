const { load } = require('./load');
const { g } = load();
const NIGHTS = g('NIGHTS'), Night = g('Night'), KeeperBot = g('KeeperBot'), DT = g('DT');
const lv = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const only = process.argv[3];
for (let i = 0; i < NIGHTS.length; i++) {
  if (only && NIGHTS[i].id !== only) continue;
  const t0 = Date.now();
  const n = new Night({ night: i, upgrades: lv });
  const tMap = Date.now() - t0;
  const bot = new KeeperBot(n, 1);
  n.begin();
  let steps = 0;
  while (n.state === 'run' && steps < 60 * 900) { bot.update(DT); n.step(DT); steps++; }
  const r = n.result || {};
  console.log(NIGHTS[i].id.padEnd(4), (n.state).padEnd(5), 'saved', r.saved + '/' + r.total, 'wrecked', r.wrecked, 'stars', r.stars, 'coins', r.coins, 'oil', (r.oilFrac*100|0)+'%', 'time', (n.t|0)+'s', 'reefs', n.map.clusters.length+'/'+NIGHTS[i].reefs, 'cur', n.map.currents.length, 'map', tMap+'ms', 'sim', (Date.now()-t0-tMap)+'ms', 'g', r.stats&&r.stats.glooms, 'hits', r.stats&&r.stats.hits);
}
