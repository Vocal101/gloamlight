'use strict';
// npm test: map checks, every night played by the bot, an endless run, and sanity checks on the numbers.
const assert = require('assert');
const { load } = require('./load');
const { g } = load();
const NIGHTS = g('NIGHTS'), REGIONS = g('REGIONS'), UPGRADES = g('UPGRADES'), Night = g('Night'), KeeperBot = g('KeeperBot'), DT = g('DT'), GameMap = g('GameMap');
const FULL = Object.fromEntries(UPGRADES.map(u => [u.id, u.vals.length - 1]));
let fails = 0, passes = 0;
function test(name, fn) {
  try { fn(); passes++; console.log('  ok  ', name); }
  catch (e) { fails++; console.log('  FAIL', name, '\n       ', e.message); }
}
function finite(n) {
  for (const s of n.ships) assert(isFinite(s.x) && isFinite(s.y) && isFinite(s.ang) && isFinite(s.hull), 'ship has a bad number: ' + JSON.stringify({ x: s.x, y: s.y, a: s.ang, h: s.hull }));
  for (const m of n.monsters) assert(isFinite(m.x) && isFinite(m.y) && isFinite(m.hp), m.kind + ' has a bad number');
  assert(isFinite(n.oil) && n.oil >= 0 && n.oil <= n.k.oilMax + 1e-6, 'oil out of range: ' + n.oil);
  assert(isFinite(n.beam.ang), 'beam angle');
}
function play(i, upgrades, seed, skill = 1) {
  const n = new Night({ night: i, upgrades, seed });
  const bot = new KeeperBot(n, skill);
  n.begin();
  let k = 0;
  while (n.state === 'run' && k < 60 * 900) { bot.update(DT); n.step(DT); k++; if (k % 300 === 0) finite(n); n.events.length = 0; }
  finite(n);
  return n;
}

console.log('Maps');
test('every region and night builds a map where every spawn reaches every active pier', () => {
  for (const nd of NIGHTS) {
    const m = new GameMap(nd.region, nd);
    assert(m.reachable(), nd.id + ' has a cut-off pier');
    assert.strictEqual(m.clusters.length, nd.reefs, nd.id + ' placed ' + m.clusters.length + ' of ' + nd.reefs + ' reefs');
    assert(m.hitAt(m.lighthouse.x, m.lighthouse.y + 20) !== 0, nd.id + ': lighthouse is not on land');
    for (const k of m.activeDocks) assert.strictEqual(m.terrainAt(m.docks[k].berth.x, m.docks[k].berth.y), 0, nd.id + ' berth ' + k + ' is not in open water');
    for (const r of m.reefs) assert(Math.hypot(r.x - m.lighthouse.x, r.y - m.lighthouse.y) < 520, nd.id + ': reef beyond the base beam');
  }
});
test('endless maps are valid on every region', () => {
  for (let r = 0; r < REGIONS.length; r++) {
    const n = new Night({ endless: true, region: r, seed: 5 + r });
    assert(n.map.reachable());
  }
});

console.log('Schedules');
test('each night schedules exactly its ships, the envoy sails last', () => {
  for (let i = 0; i < NIGHTS.length; i++) {
    const n = new Night({ night: i });
    const ships = n.schedule.filter(e => e.kind === 'ship');
    const want = NIGHTS[i].ships.reduce((a, [, c]) => a + c, 0);
    assert.strictEqual(ships.length, want, NIGHTS[i].id);
    if (NIGHTS[i].ships.some(([t]) => t === 'royal')) assert.strictEqual(ships[ships.length - 1].type, 'royal', NIGHTS[i].id + ' envoy order');
  }
});

console.log('Nights (bot with a fully fitted lamp)');
for (let i = 0; i < NIGHTS.length; i++) {
  test(`${NIGHTS[i].id} ${NIGHTS[i].name} can be won`, () => {
    let won = false, last;
    for (let s = 0; s < 3 && !won; s++) { last = play(i, FULL, 100 + s * 31); won = last.state === 'won'; }
    assert(won, `lost: saved ${last.stats.saved}, wrecked ${last.stats.wrecked}, reason ${last.result && last.result.reason}`);
  });
}

console.log('Nights (bare lamp, no upgrades)');
test('every night runs to an end without errors', () => {
  for (let i = 0; i < NIGHTS.length; i++) {
    const n = play(i, {}, 7, 0.5);
    assert(n.state === 'won' || n.state === 'lost', NIGHTS[i].id + ' did not finish: ' + n.state);
    assert(n.result && isFinite(n.result.coins) && n.result.coins >= 0, 'bad coins');
  }
});

console.log('Long Night');
test('an eight-minute endless watch stays sane', () => {
  for (let r = 0; r < REGIONS.length; r++) {
    const n = new Night({ endless: true, region: r, seed: 77 + r, upgrades: FULL });
    const bot = new KeeperBot(n, 1);
    n.begin();
    for (let k = 0; k < 60 * 480 && n.state === 'run'; k++) { bot.update(DT); n.step(DT); n.events.length = 0; if (k % 600 === 0) { finite(n); assert(n.monsters.length < 60, 'monster pile-up'); assert(n.ships.length < 40, 'ship pile-up'); } }
    assert(n.stats.saved > 10, 'region ' + r + ': only ' + n.stats.saved + ' saved');
  }
});

console.log('Rules');
test('wrecking the envoy ends the night at once', () => {
  const i = NIGHTS.findIndex(n => n.id === 'h5');
  const n = new Night({ night: i });
  n.begin();
  const s = n.spawnShip('royal', 0, n.map.activeDocks[0]);
  n.damageShip(s, 9999, 'test');
  assert.strictEqual(n.state, 'lost'); assert.strictEqual(n.result.reason, 'vip');
});
test('focus drains more oil than a wide beam', () => {
  const a = new Night({ night: 0 }), b = new Night({ night: 0 });
  a.begin(); b.begin(); b.setFocus(true);
  for (let k = 0; k < 600; k++) { a.step(DT); b.step(DT); }
  assert(b.oil < a.oil - 10, `wide ${a.oil.toFixed(1)} vs focused ${b.oil.toFixed(1)}`);
});
test('a ship in the beam is lit and one behind the lamp is not', () => {
  const n = new Night({ night: 0 });
  n.begin(); n.beam.ang = 0; n.step(DT);
  assert(n.lightAt(n.L.x + 200, n.L.y) > 0.3);
  assert(n.lightAt(n.L.x - 300, n.L.y) < 0.05);
});
test('the foghorn puts lost ships back on course and has a cooldown', () => {
  const i = NIGHTS.findIndex(n => n.id === 's5');
  const n = new Night({ night: i });
  n.begin();
  const s = n.spawnShip('cog', 0, n.map.activeDocks[0]);
  s.err = 1;
  assert(n.horn()); assert.strictEqual(s.err, 0);
  assert(!n.horn(), 'second blast should wait for the cooldown');
});
test('flares are limited and locked before Night 4', () => {
  const n0 = new Night({ night: 0 }); n0.begin();
  assert(!n0.throwFlare(500, 500));
  const n3 = new Night({ night: 3, upgrades: { flares: 1 } }); n3.begin();
  assert(n3.throwFlare(500, 500)); assert(n3.throwFlare(500, 500)); assert(!n3.throwFlare(500, 500));
});
test('upgrade tables line up', () => {
  for (const u of UPGRADES) assert.strictEqual(u.cost.length, u.vals.length - 1, u.id);
});

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
