'use strict';
// All game content: regions, maps, ships, monsters, nights, upgrades, story and achievements.

const WORLD_W = 1600, WORLD_H = 900;
const LIT_T = 0.3; // light level at which a ship can see the safe channel

const SHIP_TYPES = {
  skiff:   { name: 'Skiff',         speed: 44, turn: 2.4, hull: 40,  value: 10, oil: 6,  len: 22, beam: 9,  sail: '#e8dcc0', hullC: '#7a5234', desc: 'Small and quick. Breaks easily.' },
  cog:     { name: 'Merchant Cog',  speed: 33, turn: 1.6, hull: 70,  value: 18, oil: 12, len: 32, beam: 13, sail: '#d9c9a3', hullC: '#6b4429', desc: 'The common trader. Steady and sound.' },
  trawler: { name: 'Oil Trawler',   speed: 29, turn: 1.5, hull: 60,  value: 12, oil: 30, len: 30, beam: 13, sail: '#b9c4c7', hullC: '#4f5a5e', desc: 'Low on coin, but its barrels refill your lamp.' },
  packet:  { name: 'Mail Packet',   speed: 50, turn: 2.0, hull: 45,  value: 14, oil: 8,  len: 26, beam: 10, sail: '#f1ece0', hullC: '#2f4a6b', desc: 'Pays a bonus if it docks quickly.', rush: 60 },
  galleon: { name: 'Galleon',       speed: 25, turn: 1.0, hull: 130, value: 42, oil: 18, len: 46, beam: 18, sail: '#e6d7b4', hullC: '#5a3520', desc: 'Slow, sturdy and rich. Turns like a church.' },
  royal:   { name: 'Royal Barque',  speed: 31, turn: 1.4, hull: 90,  value: 60, oil: 16, len: 38, beam: 15, sail: '#d8b44a', hullC: '#5b1f2a', desc: 'Carries the Crown\'s envoy. If it wrecks, the night is lost.', vip: true },
};

const MONSTER_TYPES = {
  gloom:  { name: 'Shade',            hp: 2.2, speed: 42, desc: 'Eels of living dark. They latch onto hulls and gnaw. Light burns them.' },
  wisp:   { name: 'False Light',      hp: 1.6, speed: 0,  desc: 'A drifting lantern-glow that lures lost ships toward the rocks. Shine on it to dispel it.' },
  kraken: { name: 'Kraken',           hp: 5.5, speed: 0,  desc: 'Rises beneath shipping lanes and seizes hulls. Only strong light makes it let go.' },
  wraith: { name: 'Drowned Galleon',  hp: 13,  speed: 15, desc: 'A ghost ship that sails for your lamp to drink its oil. Ships near it cannot be seen.' },
  leviathan: { name: 'The Hollow Mouth', hp: 66, speed: 70, desc: 'The thing beneath the Crown.' },
};

const DOCK_STYLES = [
  { name: 'Anchor', color: '#f2b84b', sym: 'anchor' },
  { name: 'Bell',   color: '#6fc3d8', sym: 'bell' },
  { name: 'Star',   color: '#e7807a', sym: 'star' },
];

// Region maps. Land shapes are generated from noise, so they read as natural coast.
const REGIONS = [
  {
    id: 'saltmere', name: 'Saltmere Cove', sub: 'A fishing town on the southern shore',
    seed: 1301,
    palette: { deep: '#0a2433', sea: '#0f3446', shallow: '#2d6a73', sand: '#cdb683', grass: '#3d5a37', grass2: '#4f6e3f', rock: '#5b5f63', roof: '#9a4a3a', dark: [3, 9, 18] },
    music: { root: 50, mode: 'dorian' },
    lighthouse: { x: 780, y: 470 },
    land: [
      { type: 'edge', side: 's', base: 800, amp: 34, freq: 0.0065, bays: [{ x: 880, w: 300, d: 46 }] },
      { type: 'edge', side: 'w', base: 70, amp: 30, freq: 0.008, from: 520 },
      { type: 'blob', x: 780, y: 478, r: 44, amp: 0.18, lighthouse: true },
      { type: 'blob', x: 1390, y: 230, r: 34, amp: 0.35 },
      { type: 'blob', x: 260, y: 160, r: 26, amp: 0.3 },
    ],
    docks: [{ x: 700, y: 790, ang: -Math.PI / 2 }, { x: 1080, y: 800, ang: -Math.PI / 2 }],
    spawns: [{ x: 260, y: -40 }, { x: 760, y: -40 }, { x: 1240, y: -40 }, { x: 1640, y: 160 }, { x: 1640, y: 470 }, { x: -40, y: 300 }],
  },
  {
    id: 'hollowfen', name: 'Hollowfen Reach', sub: 'Marsh islands where the fog lives',
    seed: 2203,
    palette: { deep: '#0b2629', sea: '#12383a', shallow: '#3b6a5a', sand: '#a99c6c', grass: '#3d5236', grass2: '#56683c', rock: '#5a5e55', roof: '#6d5a44', dark: [3, 11, 12] },
    music: { root: 48, mode: 'aeolian' },
    lighthouse: { x: 680, y: 450 },
    land: [
      { type: 'edge', side: 'w', base: 230, amp: 60, freq: 0.006, bays: [{ y: 300, w: 140, d: 50 }, { y: 640, w: 140, d: 50 }] },
      { type: 'blob', x: 690, y: 455, r: 40, amp: 0.25, lighthouse: true },
      { type: 'blob', x: 440, y: 140, r: 30, amp: 0.4 },
      { type: 'blob', x: 470, y: 790, r: 36, amp: 0.4 },
      { type: 'blob', x: 1290, y: 700, r: 30, amp: 0.4 },
      { type: 'blob', x: 1180, y: 140, r: 24, amp: 0.4 },
    ],
    docks: [{ x: 260, y: 300, ang: 0 }, { x: 255, y: 640, ang: 0 }],
    spawns: [{ x: 1640, y: 120 }, { x: 1640, y: 450 }, { x: 1640, y: 780 }, { x: 1000, y: -40 }, { x: 960, y: 940 }],
  },
  {
    id: 'thornback', name: 'Thornback Strait', sub: 'A narrow channel between two cliffs',
    seed: 3307,
    palette: { deep: '#0a1f2e', sea: '#0e2f40', shallow: '#2c5a68', sand: '#b4a27c', grass: '#46553d', grass2: '#5b6a48', rock: '#686a6f', roof: '#7c4b3a', dark: [3, 8, 16] },
    music: { root: 45, mode: 'phrygian' },
    lighthouse: { x: 800, y: 450 },
    land: [
      { type: 'edge', side: 'n', base: 120, amp: 40, freq: 0.006, bays: [{ x: 520, w: 180, d: 40 }, { x: 1150, w: 180, d: 40 }] },
      { type: 'edge', side: 's', base: 790, amp: 40, freq: 0.006, bays: [{ x: 1080, w: 200, d: 40 }] },
      { type: 'blob', x: 800, y: 455, r: 38, amp: 0.3, lighthouse: true },
    ],
    docks: [{ x: 520, y: 140, ang: Math.PI / 2 }, { x: 1080, y: 770, ang: -Math.PI / 2 }, { x: 1150, y: 140, ang: Math.PI / 2 }],
    spawns: [{ x: -40, y: 300 }, { x: -40, y: 470 }, { x: -40, y: 640 }, { x: 1640, y: 300 }, { x: 1640, y: 470 }, { x: 1640, y: 640 }],
  },
  {
    id: 'crown', name: 'The Drowned Crown', sub: 'Where the Gloam rises from the deep',
    seed: 4409,
    palette: { deep: '#0d1626', sea: '#132238', shallow: '#33496a', sand: '#9c968a', grass: '#3b4642', grass2: '#4a5550', rock: '#5f6370', roof: '#4b4a5e', dark: [4, 6, 15] },
    music: { root: 47, mode: 'locrianish' },
    lighthouse: { x: 800, y: 440 },
    land: [
      { type: 'blob', x: 800, y: 455, r: 82, amp: 0.22, lighthouse: true, crown: true },
      { type: 'blob', x: 240, y: 170, r: 40, amp: 0.4 },
      { type: 'blob', x: 1380, y: 740, r: 44, amp: 0.4 },
      { type: 'blob', x: 1430, y: 160, r: 30, amp: 0.4 },
      { type: 'blob', x: 190, y: 730, r: 34, amp: 0.4 },
    ],
    docks: [{ x: 800, y: 350, ang: -Math.PI / 2 }, { x: 905, y: 520, ang: 0.6 }, { x: 695, y: 520, ang: Math.PI - 0.6 }],
    spawns: [{ x: 400, y: -40 }, { x: 1200, y: -40 }, { x: 1640, y: 450 }, { x: 1200, y: 940 }, { x: 400, y: 940 }, { x: -40, y: 450 }],
  },
];

// Nights. ships: [type, count]; monsters: [kind, count]. The schedule is built from the seed.
const NIGHTS = [
  // ---- Saltmere Cove
  { id: 's1', region: 0, name: 'First Watch', docks: [0], ships: [['cog', 4]], gap: [15.0, 19.0], reefs: 3, maxWrecks: 2, moon: 0.16, tutorial: 'basics',
    log: 'The harbourmaster gave me the key and would not meet my eye. Old Ansel kept this light for forty years, and three weeks ago he simply was not here. The lamp is cold. The ships are coming. I suppose I am the keeper now.' },
  { id: 's2', region: 0, name: 'The Narrow Rocks', docks: [0, 1], ships: [['cog', 5], ['skiff', 3]], gap: [11.0, 15.0], reefs: 5, maxWrecks: 2, moon: 0.13, tutorial: 'focus',
    log: 'Found Ansel\'s notes behind the oil cask. "Hold the beam tight and it reaches further. Mind the wick, though. A tight flame drinks oil like a sailor drinks rum."' },
  { id: 's3', region: 0, name: 'Things in the Water', docks: [0, 1], ships: [['cog', 5], ['skiff', 3]], gap: [11.0, 15.0], reefs: 5, monsters: [['gloom', 5]], maxWrecks: 2, moon: 0.12, tutorial: 'gloom',
    log: 'A fisherman swore something black and boneless climbed his gunwale last night and ate a hole through the planks. He said it hissed when his lantern swung near it. I am keeping the lamp lit.' },
  { id: 's4', region: 0, name: 'Oil and Embers', docks: [0, 1], ships: [['cog', 5], ['skiff', 2], ['trawler', 2]], gap: [10.0, 14.0], reefs: 6, monsters: [['gloom', 8]], maxWrecks: 2, moon: 0.1, tutorial: 'flare',
    log: 'The trawlermen will trade me oil for safe passage. Good. In Ansel\'s locker I found a box of signal flares, still dry, wrapped in a page of his writing: "When you cannot be in two places, throw fire into the second."' },
  { id: 's5', region: 0, name: 'Squall Line', docks: [0, 1], ships: [['cog', 5], ['skiff', 2], ['packet', 3], ['trawler', 1]], gap: [9.0, 13.0], reefs: 7, monsters: [['gloom', 10]], storm: 0.5, maxWrecks: 2, moon: 0.08, tutorial: 'foghorn',
    log: 'A storm is coming over the cove. The mail packets will run before it and not wait for morning. The old foghorn on the gallery still works, and its note scatters the shades. Ansel scratched one word on the brass: "Breathe."' },
  // ---- Hollowfen Reach
  { id: 'h1', region: 1, name: 'Marsh Lights', docks: [0, 1], ships: [['cog', 6], ['trawler', 2]], gap: [10.4, 13.3], reefs: 6, monsters: [['wisp', 5], ['gloom', 5]], maxWrecks: 2, moon: 0.12, tutorial: 'wisp',
    log: 'They sent me north to Hollowfen. Their keeper drowned. Out on the fen at night there are other lights, green and patient, and lost ships steer toward them gratefully, right up until they hit the stones.' },
  { id: 'h2', region: 1, name: 'Milk Fog', docks: [0, 1], ships: [['cog', 6], ['skiff', 3], ['trawler', 1]], gap: [9.5, 12.3], reefs: 7, monsters: [['wisp', 5], ['gloom', 8]], fog: 3, maxWrecks: 2, moon: 0.12, tutorial: 'fog',
    log: 'Fog banks roll in off the marsh as thick as wool. A loose beam is eaten up by them. A tight one punches through. Ansel\'s writing is in the margin of the tide table here too. He passed this way before he vanished.' },
  { id: 'h3', region: 1, name: 'Packet Season', docks: [0, 1], ships: [['packet', 5], ['cog', 4], ['skiff', 2]], gap: [7.6, 11.4], reefs: 7, monsters: [['wisp', 6], ['gloom', 10]], fog: 2, maxWrecks: 3, moon: 0.1,
    log: 'Every letter in the north goes through Hollowfen in the autumn. The packets will not slow for the fog, and the postmaster pays well for speed. I have taken to talking to the lamp. It does not answer, which is a mercy.' },
  { id: 'h4', region: 1, name: 'The Long Reeds', docks: [0, 1], ships: [['cog', 6], ['galleon', 2], ['trawler', 2]], gap: [9.5, 12.3], reefs: 8, monsters: [['wisp', 8], ['gloom', 12]], fog: 3, maxWrecks: 3, moon: 0.09,
    log: 'Galleons now, riding low with southern grain. They turn so slowly I must see them in the dark well before their trouble. Found a page from Ansel: "The Gloam is not weather. It is coming from somewhere. South and east. The Crown."' },
  { id: 'h5', region: 1, name: 'The Envoy', docks: [0, 1], ships: [['royal', 1], ['cog', 5], ['packet', 3], ['galleon', 1], ['trawler', 1]], gap: [8.5, 11.4], reefs: 8, monsters: [['wisp', 8], ['gloom', 15]], fog: 3, maxWrecks: 3, moon: 0.08,
    log: 'A royal barque comes tonight carrying the Crown\'s envoy, who wants to see the Gloam for herself. If she is lost, they close the fen ports for good. No pressure, says the harbourmaster, who has never kept a light.' },
  // ---- Thornback Strait
  { id: 't1', region: 2, name: 'Under the Cliffs', docks: [0, 1], ships: [['cog', 6], ['skiff', 2], ['trawler', 2]], gap: [9.0, 11.7], reefs: 6, monsters: [['kraken', 2], ['gloom', 7]], currents: 1, maxWrecks: 2, moon: 0.11, tutorial: 'kraken',
    log: 'Thornback Strait. The envoy got me this posting. The cliffs are so close you can hear the gulls on both sides. Something big lives in the deep channel. The sailors call it the Clutch and won\'t say more.' },
  { id: 't2', region: 2, name: 'Running Tide', docks: [0, 1, 2], ships: [['cog', 6], ['skiff', 3], ['packet', 2]], gap: [8.1, 10.8], reefs: 7, monsters: [['kraken', 2], ['gloom', 10], ['wisp', 3]], currents: 2, maxWrecks: 3, moon: 0.1,
    log: 'The tide runs through the strait like a millrace. A ship that loses its way here is carried off sideways. I have marked the currents on my chart in red. Ansel had already marked them in blue.' },
  { id: 't3', region: 2, name: 'Clutch', docks: [0, 1, 2], ships: [['cog', 6], ['galleon', 2], ['trawler', 2]], gap: [8.1, 10.8], reefs: 7, monsters: [['kraken', 4], ['gloom', 11]], currents: 2, maxWrecks: 3, moon: 0.09,
    log: 'Watched the Clutch take a fishing smack last night. It did not eat it. It held it, and pulled it under slowly, the way a child drowns a toy. I am going to need a hotter flame.' },
  { id: 't4', region: 2, name: 'Thunderhead', docks: [0, 1, 2], ships: [['cog', 6], ['packet', 3], ['skiff', 2], ['trawler', 2]], gap: [7.2, 9.9], reefs: 8, monsters: [['kraken', 3], ['gloom', 14], ['wisp', 4]], currents: 2, storm: 0.8, maxWrecks: 3, moon: 0.07,
    log: 'The worst storm in thirty years, they say. When the lightning comes, every ship sees the rocks at once. Count on it, but don\'t lean on it.' },
  { id: 't5', region: 2, name: 'The Envoy Returns', docks: [0, 1, 2], ships: [['royal', 1], ['galleon', 2], ['cog', 5], ['packet', 2], ['trawler', 2]], gap: [7.2, 9.9], reefs: 8, monsters: [['kraken', 4], ['gloom', 17], ['wisp', 4]], currents: 2, fog: 2, maxWrecks: 3, moon: 0.07,
    log: 'The envoy sails south through the strait to the Crown and asked for me by name. She has Ansel\'s last letter. It says only: "The light was never meant to guide them. It was meant to keep it asleep."' },
  // ---- The Drowned Crown
  { id: 'd1', region: 3, name: 'The Crown Light', docks: [0, 1, 2], ships: [['cog', 7], ['trawler', 3]], gap: [7.9, 10.6], reefs: 8, monsters: [['wraith', 2], ['gloom', 12]], maxWrecks: 3, moon: 0.06, tutorial: 'wraith',
    log: 'The Crown is a ring of drowned towers around one island, and on the island stands the oldest light on the coast. Ansel\'s coat hangs by the door. Out on the water, ships sail that have no crews.' },
  { id: 'd2', region: 3, name: 'Ghost Convoy', docks: [0, 1, 2], ships: [['cog', 6], ['galleon', 2], ['skiff', 3], ['trawler', 2]], gap: [7.0, 9.7], reefs: 9, monsters: [['wraith', 3], ['gloom', 15], ['wisp', 4]], fog: 2, maxWrecks: 3, moon: 0.06,
    log: 'The drowned galleons go for the lamp, not the ships. They want the oil. Ansel\'s log: "Every night the Gloam comes closer to the light, and every night the thing below turns over in its sleep."' },
  { id: 'd3', region: 3, name: 'Black Water', docks: [0, 1, 2], ships: [['cog', 6], ['packet', 3], ['galleon', 2], ['trawler', 2]], gap: [7.0, 8.8], reefs: 9, monsters: [['wraith', 3], ['kraken', 2], ['gloom', 18]], currents: 2, maxWrecks: 3, moon: 0.05,
    log: 'The sea here is black even at noon. The envoy\'s people are evacuating the outer islands, and every boat is coming through my water tonight.' },
  { id: 'd4', region: 3, name: 'The Last Storm', docks: [0, 1, 2], ships: [['cog', 6], ['galleon', 2], ['packet', 3], ['skiff', 2], ['trawler', 2]], gap: [6.2, 8.8], reefs: 10, monsters: [['wraith', 3], ['kraken', 3], ['gloom', 21], ['wisp', 6]], storm: 1, currents: 1, maxWrecks: 4, moon: 0.05,
    log: 'Found him. Ansel is in the lamp room of the drowned tower on the north reef, or what is left of him is. He kept it asleep for forty years. Tomorrow I end it, one way or the other.' },
  { id: 'd5', region: 3, name: 'The Hollow Mouth', docks: [0, 1, 2], ships: [['royal', 1], ['cog', 5], ['galleon', 2], ['trawler', 3]], gap: [7.9, 10.6], reefs: 8, monsters: [['gloom', 18], ['wraith', 2]], boss: 'leviathan', maxWrecks: 4, moon: 0.04, tutorial: 'boss',
    log: 'It is awake. It rises when the ships come and it is hungry for them. The envoy will sail in last, to see it done. Burn it in the eyes. Keep the lamp lit. Breathe.' },
];

// Long Night: endless waves on a chosen region map
const ENDLESS = {
  unlockAfter: 's5',
  maxWrecks: 5,
};

// Workshop upgrades. lv: values per level (index 0 = base). cost: per level purchase.
const UPGRADES = [
  { id: 'lens',    name: 'Ground Lens',      icon: 'lens',   desc: 'Grind the Fresnel rings finer. The beam reaches further.', vals: [1, 1.1, 1.2, 1.3, 1.4, 1.5], cost: [75, 140, 225, 340, 475], fmt: v => Math.round(v * 100) + '% reach' },
  { id: 'reflector', name: 'Wide Reflector', icon: 'reflector', desc: 'A broader silvered mirror. The beam spreads wider.', vals: [1, 1.15, 1.3, 1.45, 1.6], cost: [100, 175, 275, 400], fmt: v => Math.round(v * 100) + '% width' },
  { id: 'gears',   name: 'Brass Gearing',    icon: 'gears',  desc: 'Oil the clockwork and swap the cogs. The lamp turns faster.', vals: [1, 1.2, 1.4, 1.6, 1.85], cost: [60, 125, 210, 325], fmt: v => Math.round(v * 100) + '% turn speed' },
  { id: 'cistern', name: 'Oil Cistern',      icon: 'cistern', desc: 'A bigger reservoir under the lamp room.', vals: [100, 125, 150, 180, 220], cost: [90, 160, 250, 375], fmt: v => v + ' oil' },
  { id: 'burner',  name: 'Clean Burner',     icon: 'burner', desc: 'A better wick and draft. The lamp burns less oil.', vals: [1, 0.88, 0.77, 0.67], cost: [110, 210, 350], fmt: v => Math.round(v * 100) + '% oil use' },
  { id: 'wick',    name: 'Hot Wick',         icon: 'wick',   desc: 'A hotter flame that burns the Gloam faster.', vals: [1, 1.25, 1.5, 1.8, 2.1], cost: [100, 190, 300, 440], fmt: v => Math.round(v * 100) + '% burn' },
  { id: 'flares',  name: 'Flare Locker',     icon: 'flare',  desc: 'More signal flares for each night.', vals: [1, 2, 3, 4], cost: [90, 175, 300], fmt: v => v + (v === 1 ? ' flare' : ' flares') },
  { id: 'horn',    name: 'Foghorn Bellows',  icon: 'horn',   desc: 'Bigger bellows. The foghorn is ready again sooner.', vals: [30, 23, 17], cost: [150, 275], fmt: v => v + 's cooldown' },
  { id: 'buoys',   name: 'Bell Buoys',       icon: 'buoy',   desc: 'Lit buoys you anchor at dusk. Their small light guides ships.', vals: [0, 1, 2, 3], cost: [110, 200, 325], fmt: v => v + (v === 1 ? ' buoy' : ' buoys') },
  { id: 'harbor',  name: 'Harbour Lanterns', icon: 'harbor', desc: 'Lanterns along the piers light the final approach.', vals: [0, 70, 105], cost: [125, 250], fmt: v => (v ? v + ' ft glow' : 'none') },
  { id: 'charts',  name: 'Pilot Charts',     icon: 'charts', desc: 'Give the captains your charts. Lost ships drift less.', vals: [1, 0.8, 0.64, 0.5], cost: [110, 210, 325], fmt: v => Math.round(v * 100) + '% drift' },
  { id: 'twin',    name: 'Twin Lens',        icon: 'twin',   desc: 'A second lens throws a weaker beam behind the first.', vals: [0, 1], cost: [810], fmt: v => (v ? 'installed' : 'none'), needs: 'h5' },
];

const ACHIEVEMENTS = [
  { id: 'first_light',  name: 'First Light',      desc: 'See your first night through.' },
  { id: 'clean_watch',  name: 'Clean Watch',      desc: 'Finish a night with no wrecks.' },
  { id: 'ten_clean',    name: 'Steady Hand',      desc: 'Finish ten nights with no wrecks.' },
  { id: 'hulls_100',    name: 'Harbour Friend',   desc: 'Bring 100 ships home.' },
  { id: 'hulls_500',    name: 'Patron of Sailors', desc: 'Bring 500 ships home.' },
  { id: 'shades_50',    name: 'Ember Tongue',     desc: 'Burn 50 shades.' },
  { id: 'shades_300',   name: 'Bonfire',          desc: 'Burn 300 shades.' },
  { id: 'wisps_25',     name: 'True North',       desc: 'Dispel 25 false lights.' },
  { id: 'kraken_free',  name: 'Unclenched',       desc: 'Make a kraken release a ship.' },
  { id: 'wraith',       name: 'Ghostbane',        desc: 'Banish a drowned galleon.' },
  { id: 'frugal',       name: 'Thrifty Keeper',   desc: 'Finish a night with at least 60% of your oil left.' },
  { id: 'region_0',     name: 'Saltmere Saved',   desc: 'Finish every night in Saltmere Cove.' },
  { id: 'region_1',     name: 'Fen Walker',       desc: 'Finish every night in Hollowfen Reach.' },
  { id: 'region_2',     name: 'Strait Keeper',    desc: 'Finish every night in Thornback Strait.' },
  { id: 'boss',         name: 'Dawn',             desc: 'Put out the Hollow Mouth.' },
  { id: 'all_stars',    name: 'Lamp of the Coast', desc: 'Earn three stars on every night.' },
  { id: 'long_20',      name: 'Into the Small Hours', desc: 'Bring 20 ships home in one Long Night.' },
  { id: 'long_50',      name: 'Sleepless',        desc: 'Bring 50 ships home in one Long Night.' },
  { id: 'maxed',        name: 'Master Lampwright', desc: 'Fully upgrade any part of the lighthouse.' },
];

const TUTORIALS = {
  basics: [
    { id: 'aim', text: 'Move the pointer to swing the beam. Drag on a touch screen.', until: 'aimed' },
    { id: 'lit', text: 'Ships in the beam can see the rocks and steer the safe channel. In the dark they drift off course.', until: 'shipLit', delay: 1 },
    { id: 'lantern', text: 'You can always see a ship\'s little lantern. A flashing ? means it is lost and drifting.', until: 'time:9' },
    { id: 'dock', text: 'Guide every ship to the pier that matches its pennant.', until: 'docked' },
  ],
  focus: [
    { id: 'focus', text: 'Hold the left button (or Shift, or the Focus button) to narrow the beam. A narrow beam reaches further and shines brighter, but it burns oil fast.', until: 'focused' },
    { id: 'oil', text: 'Docked ships bring oil. If the lamp runs dry, the beam shrinks to a weak glow.', until: 'time:14' },
  ],
  gloom: [
    { id: 'gloom', text: 'Shades hunt in the dark. Their eyes glow. Keep the beam on one to burn it before it latches onto a hull.', until: 'gloomKilled' },
  ],
  flare: [
    { id: 'flare', text: 'Right-click (or F, or the Flare button) to throw a flare. It lights a patch of sea for a while.', until: 'flared' },
  ],
  foghorn: [
    { id: 'horn', text: 'Press Space (or the Horn button) to sound the foghorn. It drives shades away and puts every lost ship back on course.', until: 'horned' },
  ],
  wisp: [
    { id: 'wisp', text: 'Green false lights lure lost ships onto the rocks. Shine the beam on one to dispel it.', until: 'wispKilled' },
  ],
  fog: [
    { id: 'fog', text: 'Fog swallows a wide beam. Focus to cut through it.', until: 'time:16' },
  ],
  kraken: [
    { id: 'kraken', text: 'Rings in the water mean a kraken is rising. Only a strong, focused beam makes it let go of a ship.', until: 'krakenHurt' },
  ],
  wraith: [
    { id: 'wraith', text: 'A drowned galleon sails for your lamp to steal its oil. Burn it before it arrives. Ships close to it can\'t be seen.', until: 'wraithHurt' },
  ],
  boss: [
    { id: 'boss', text: 'The Hollow Mouth surfaces near shipping. Burn its eyes with focused light to drive it under. Do it three times.', until: 'bossHurt' },
  ],
};

const HINTS = [
  'Lost ships hold the last course they were given. A quick sweep over each one keeps it honest.',
  'A ship in the beam always finds the safe channel. You don\'t steer them. You just let them see.',
  'Oil trawlers pay little, but a full lamp is worth more than coin.',
  'Flares are best thrown where two ships will meet trouble at once.',
  'The foghorn puts every lost ship back on course at the same moment.',
  'Lightning shows every ship the rocks for a heartbeat.',
  'Bell buoys placed beside a reef keep ships off it all night.',
  'A shade latched onto a hull can\'t flee the light.',
  'Focus is brightest at the tip of the beam. Use it to reach the far piers.',
  'Kraken rings appear before the tentacles rise. Hurry ships past or burn them early.',
];

if (typeof module !== 'undefined') module.exports = {};
