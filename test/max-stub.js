'use strict';
// Runs a Max `js` script under Node with stand-ins for the globals Max provides.
//
// Max's js engine is ES5 with a handful of globals: post(), outlet(), the inlet
// counters, arrayfromargs(), messagename, Task and LiveAPI. This file provides
// enough of each for the device scripts to load and be called the way Max calls
// them: list(60, 100) for a note, msg_int(2) for an int, and so on. Everything a
// script sends out of an outlet is recorded so a test can read it back.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DEVICES = path.join(__dirname, '..', 'devices');

class FakeTask {
  constructor(fn, obj, ...args) { this.fn = fn; this.obj = obj; this.args = args; this.interval = 0; this.due = null; this.repeats = 0; }
  schedule(ms) { this.due = FakeTask.now + (ms || 0); FakeTask.pending.add(this); }
  repeat(n) { this.repeats = n === undefined ? Infinity : n; this.due = FakeTask.now + this.interval; FakeTask.pending.add(this); }
  cancel() { FakeTask.pending.delete(this); this.due = null; }
  static reset() { FakeTask.now = 0; FakeTask.pending = new Set(); }
  // Advance the clock, running every task that comes due, in time order.
  static advance(ms) {
    const until = FakeTask.now + ms;
    for (;;) {
      const next = [...FakeTask.pending].filter(t => t.due !== null && t.due <= until).sort((a, b) => a.due - b.due)[0];
      if (!next) break;
      FakeTask.now = next.due;
      if (next.repeats > 0) { next.repeats -= 1; next.due = FakeTask.now + next.interval; if (next.repeats === 0) FakeTask.pending.delete(next); }
      else FakeTask.pending.delete(next);
      next.fn.apply(next.obj, next.args);
    }
    FakeTask.now = until;
  }
}
FakeTask.reset();

// A LiveAPI stand-in driven by a plain object tree: {"live_set": {props..., children: {"tracks": [...]}}}
// Only what the scripts use: .path, .id, get(), set(), getcount(), call(). Paths are
// space-separated as in Max ("live_set tracks 3 devices 0").
function makeLiveAPI(tree, log) {
  function resolve(p) {
    const parts = String(p).trim().split(/\s+/).filter(Boolean);
    let node = tree[parts[0]];
    for (let i = 1; node && i < parts.length; i += 2) {
      const kids = (node.children || {})[parts[i]];
      node = kids ? kids[parseInt(parts[i + 1], 10)] : undefined;
    }
    return node || null;
  }
  return class LiveAPI {
    constructor(a, b) { this._path = ''; this.node = null; const p = typeof a === 'function' ? b : a; if (p !== undefined) this.path = p; }
    get path() { return this._path; }
    set path(p) { this._path = String(p); this.node = resolve(p); }
    get id() { return this.node ? (this.node.id || 1) : 0; }
    get(prop) { if (!this.node) return null; if (prop in (this.node.children || {})) { const out = []; this.node.children[prop].forEach((c, i) => { out.push('id', c.id || (i + 1)); }); return out; } return this.node[prop]; }
    set(prop, v) { if (!this.node) return; if (this.node.disabled) throw new Error("Value cannot be set, the parameter is disabled"); this.node[prop] = v; log.push({ path: this._path, prop, value: v }); }
    getcount(kid) { return this.node && this.node.children && this.node.children[kid] ? this.node.children[kid].length : 0; }
    call(method, ...args) { log.push({ path: this._path, call: method, args }); return null; }
  };
}

function load(device, script, opts = {}) {
  const file = path.join(DEVICES, device, script);
  const code = fs.readFileSync(file, 'utf8');
  const out = [];       // every outlet() call: {index, args}
  const posts = [];     // every post() call, joined
  const liveLog = [];   // every LiveAPI set()/call()
  FakeTask.reset();
  const ctx = {
    inlets: 1, outlets: 1, autowatch: 0, inlet: 0, messagename: '',
    post: (...a) => posts.push(a.join('')),
    error: (...a) => posts.push('ERROR ' + a.join('')),
    // Array.from copies the values into this realm: arrays born inside the vm have a
    // different Array prototype and deepStrictEqual would reject them.
    outlet: (i, ...a) => out.push({ index: i, args: Array.from(a.length === 1 && Array.isArray(a[0]) ? a[0] : a) }),
    arrayfromargs: (args) => Array.prototype.slice.call(args),
    Task: FakeTask,
    LiveAPI: makeLiveAPI(opts.live || {}, liveLog),
    Math, parseInt, parseFloat, String, Number, Array, Object, isNaN,
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: script });
  return {
    ctx, out, posts, liveLog, Task: FakeTask,
    // Call a script function the way Max does, on a given inlet.
    send(fn, ...args) { ctx.inlet = 0; return ctx[fn](...args); },
    sendOn(inletIndex, fn, ...args) { ctx.inlet = inletIndex; return ctx[fn](...args); },
    // Notes arrive as "list pitch velocity" on inlet 0.
    note(pitch, vel) { ctx.inlet = 0; return ctx.list(pitch, vel); },
    // Everything sent from outlet `i` since the last take, then cleared.
    take(i = 0) { const mine = out.filter(o => o.index === i).map(o => o.args); out.length = 0; return mine; },
  };
}

module.exports = { load, FakeTask };
