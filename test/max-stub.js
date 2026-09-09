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
  // Assumes Max runs the first repeat after one interval, not at once.
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

// A LiveAPI stand-in driven by a plain object tree. A node is {id, ...properties,
// children: {name: [nodes] for a list such as "tracks", or a single node such as
// "mixer_device"}}. Paths are space-separated as in Max: "live_set tracks 3 devices 0",
// "live_set master_track mixer_device volume". Only what the scripts use: path, id,
// get(), set(), getcount(), call(). Like Max, set() on a disabled parameter posts an
// error and goes on; it does not throw.
function makeLiveAPI(tree, log, posts) {
  function resolve(p) {
    const parts = String(p).trim().split(/\s+/).filter(Boolean);
    let node = tree[parts[0]];
    let i = 1;
    while (node && i < parts.length) {
      const kid = (node.children || {})[parts[i]];
      i += 1;
      if (Array.isArray(kid)) { node = kid[parseInt(parts[i], 10)]; i += 1; }
      else node = kid;
    }
    return node || null;
  }
  const observers = [];
  const LiveAPI = class LiveAPI {
    constructor(a, b) {
      LiveAPI.created += 1;
      this._path = ''; this.node = null; this._property = null;
      this.callback = typeof a === 'function' ? a : null;
      const p = typeof a === 'function' ? b : a;
      if (p !== undefined) this.path = p;
    }
    // Observing: like Max, setting `property` calls the callback at once with the current
    // value, then again on every change (a test fires those with LiveAPI.notify(prop)).
    get property() { return this._property; }
    set property(prop) { this._property = prop; observers.push(this); if (this.callback) this.callback([prop].concat(this.get(prop))); }
    static notify(prop) { for (const o of observers) if (o._property === prop && o.callback) o.callback([prop].concat(o.get(prop))); }
    static get observers() { return observers; }
    get path() { return this._path; }
    set path(p) { this._path = String(p); this.node = resolve(p); }
    // Max answers the string "0" for a path that resolves to nothing (verified 2026-09-09).
    get id() { return this.node ? this.node.id : '0'; }
    get(prop) {
      if (!this.node) return null;
      const kid = (this.node.children || {})[prop];
      if (Array.isArray(kid)) { const out = []; kid.forEach(c => out.push('id', c.id)); return out; }
      if (kid) return ['id', kid.id];
      return prop in this.node ? this.node[prop] : null;
    }
    set(prop, v) {
      if (!this.node) return;
      if (this.node.disabled) { posts.push('ERROR Value cannot be set, the parameter is disabled'); return; }
      this.node[prop] = v; log.push({ path: this._path, prop, value: v });
    }
    getcount(kid) { const k = this.node && this.node.children && this.node.children[kid]; return Array.isArray(k) ? k.length : 0; }
    call(method, ...args) { log.push({ path: this._path, call: method, args }); return null; }
  };
  LiveAPI.created = 0;
  return LiveAPI;
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
    // patcher.getnamed(varname).getvalueof(): the controls a test declares in opts.controls
    patcher: { getnamed: (name) => (opts.controls && name in opts.controls) ? { getvalueof: () => opts.controls[name] } : null },
    LiveAPI: makeLiveAPI(opts.live || {}, liveLog, posts),
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
