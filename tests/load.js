'use strict';
// Loads the browser game scripts into a node vm context (same global scope as <script> tags).
const vm = require('vm'), fs = require('fs'), path = require('path');
const FILES = ['util.js', 'data.js', 'map.js', 'sim.js', 'bot.js'];
function load() {
  const ctx = vm.createContext({ console, Math, Date });
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
  const g = name => vm.runInContext(name, ctx);
  return { ctx, g };
}
module.exports = { load };
