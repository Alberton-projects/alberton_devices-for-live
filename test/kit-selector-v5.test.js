'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./max-stub');

let nextId = 1;
const node = (props, children) => ({ id: nextId++, ...props, children: children || {} });
const param = (name, value) => node({ name, value, min: 0, max: 127 });
const fxRack = (values) => node({ name: '[FX] Alberton per Track-1', class_name: 'AudioEffectGroupDevice' },
  { parameters: [param('Device On', 1), ...values.map((v, i) => param('Macro ' + (i + 1), v))] });
const track = (name, devices, extra) => node({ name, is_foldable: 0, ...extra }, { devices, mixer_device: node({}, { volume: param('Volume', 0.5) }) });
function rig() {
  nextId = 1;
  return { live_set: node({ name: 'set' }, {
    tracks: [track('1 DRUMS', [fxRack([64, 127, 14, 0, 0, 0, 0, 0, 0])], { is_foldable: 1 }), track('Kick', []), track('Vocals', [fxRack([9, 8, 7, 6, 5, 4, 3, 2, 1])])],
    master_track: track('Main', []),
  }) };
}
const labels = {};
const boot = (opts = {}) => {
  const live = rig();
  const d = load('kit-selector', 'kit-selector.js', { live, controls: opts.controls });
  d.live = live;
  if (!opts.keepSync) { d.Task.advance(0); d.take(0); d.take(1); }   // the compile-time sync has run and named the channels
  // labels: patcher.getnamed("lab<n>").message("set", name) -- record what the script sets
  const base = d.ctx.patcher.getnamed;
  d.ctx.patcher.getnamed = (name) => /^lab\d+$/.test(name) ? { message: (m, text) => { labels[name] = text; } } : base(name);
  return d;
};
const sendMsg = (d, name, ...args) => { d.ctx.messagename = name; return d.ctx.anything(...args); };

test('a program dial queues its strip on the bus, one every 150 ms; a volume dial goes at once', () => {
  const d = boot();
  sendMsg(d, 'p3', 40); sendMsg(d, 'p7', 41);
  assert.deepEqual(d.take(0), []);
  d.Task.advance(150);
  assert.deepEqual(d.take(0), [['prog', 3, 40]]);
  d.Task.advance(150);
  assert.deepEqual(d.take(0), [['prog', 7, 41]]);
  sendMsg(d, 'v3', 0.7);
  assert.deepEqual(d.take(0), [['vol', 3, 0.7]]);
});

test('the main dial writes the master volume; bus renames both channels and asks who', () => {
  const d = boot();
  d.send('vmain', 0.6);
  assert.equal(d.live.live_set.children.master_track.children.mixer_device.children.volume.value, 0.6);
  d.send('bus', 2);
  assert.deepEqual(d.take(0), [['send', 'ks2'], ['who']]);
  assert.deepEqual(d.take(1), [['set', 'ks2_ret']]);
});

test('a recall sends every strip again, in order, then announces the kit', () => {
  const d = boot();
  sendMsg(d, 'p1', 5); sendMsg(d, 'v2', 0.3); d.Task.advance(200); d.take(0);
  d.send('recalled', 4);
  assert.deepEqual(d.take(0), [], 'nothing until the dials have settled');
  d.Task.advance(50);
  const out = d.take(0);
  assert.deepEqual(out.filter(o => o[0] === 'vol').slice(0, 2), [['vol', 1, 0.85], ['vol', 2, 0.3]]);
  assert.equal(out.filter(o => o[0] === 'vol').length, 16);
  assert.deepEqual(out[out.length - 1], ['kit', 4]);
  d.Task.advance(16 * 150);
  const progs = d.take(0).filter(o => o[0] === 'prog');
  assert.equal(progs.length, 16);
  assert.deepEqual(progs[0], ['prog', 1, 5]);
});

test('a receiver introducing itself names the strip', () => {
  const d = boot();
  d.send('bound', 3, 'Live', 'Scratcher');
  assert.equal(labels.lab3, 'Live Scratcher');
  d.send('bound', 99, 'Nope');
  assert.equal(labels.lab99, undefined);
});

test('fx banks are broadcast to the receivers, captured through them, and re-sent on recall', () => {
  const d = boot();
  sendMsg(d, 'drums_fx', 1, 2, 3, 4, 5, 6, 7, 8, 9);
  assert.deepEqual(d.take(0), [['fx', 1, 1, 2, 3, 4, 5, 6, 7, 8, 9]]);
  sendMsg(d, 'fxvol_vocals', 0.6);
  assert.deepEqual(d.take(0), [['fxvol', 8, 0.6]]);
  assert.equal(d.liveLog.length, 0, 'the panel writes nothing to Live for fx');
  d.send('capture_fx');
  assert.deepEqual(d.take(0), [['capture']]);
  d.send('fxret', 9, 64, 0, 0, 0, 0, 0, 0, 0, 0);
  assert.deepEqual(d.take(2), [['resample_fx', 64, 0, 0, 0, 0, 0, 0, 0, 0]]);
  d.send('recalled', 2); d.Task.advance(50);
  const out = d.take(0);
  assert.ok(out.some(o => o[0] === 'fx' && o[1] === 1 && o[2] === 1 && o[10] === 9), 'the drums bank goes out again');
  assert.ok(out.some(o => o[0] === 'fx' && o[1] === 9 && o[2] === 64), 'and the captured resample bank');
  assert.ok(out.some(o => o[0] === 'fxvol' && o[1] === 8 && o[2] === 0.6));
});

test('an unknown message is reported, not fatal', () => {
  const d = boot();
  sendMsg(d, 'zz', 1);
  assert.match(d.posts.join('\n'), /unknown message zz/);
});

test('at compile time the dials, the main and the bus are read from the patcher', () => {
  const d = boot({ controls: { p1: 12, v1: 0.4, vmain: 0.9, bus: 3, pattr_drums: [9, 8, 7, 6, 5, 4, 3, 2, 1], fxvol_drums: 0.3 }, keepSync: true });
  d.Task.advance(0);
  assert.equal(d.ctx.prog[1], 12); assert.equal(d.ctx.vol[1], 0.4); assert.equal(d.ctx.mainVol, 0.9); assert.equal(d.ctx.busNumber, 3);
  assert.deepEqual(d.ctx.fxValues[1], [9, 8, 7, 6, 5, 4, 3, 2, 1]); assert.equal(d.ctx.fxVol[1], 0.3);
  assert.deepEqual(d.take(0), [['send', 'ks3']]);
});
