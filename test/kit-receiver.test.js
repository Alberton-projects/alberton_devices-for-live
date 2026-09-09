'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./max-stub');

let nextId = 1;
const node = (props, children) => ({ id: nextId++, ...props, children: children || {} });
const param = (name, value, extra) => node({ name, value, min: 0, max: 127, is_enabled: 1, ...extra });
const device = (name, class_name, params) => node({ name, class_name }, { parameters: params });
const rack = (name, chainEnabled = true) => device(name, 'InstrumentGroupDevice',
  [param('Device On', 1), ...Array.from({ length: 16 }, (_, i) => param('Macro ' + (i + 1), 0)), param('Chain Selector', 0, { is_enabled: chainEnabled ? 1 : 0 })]);
const track = (name, devices) => node({ name }, { devices, mixer_device: node({}, { volume: param('Volume', 0.5, { max: 1 }) }) });

// The receiver as device D on track T; `canonical` is what Max's unquotedpath answers for this_device.
function rig({ onTrack = 1, atDevice = 0, inChain = false, tracks } = {}) {
  nextId = 1;
  const ts = tracks || [
    track('1 DRUMS', []),
    track('Kick', [device('Alberton Kit Receiver', 'MxDeviceMidiEffect', []), rack('DRUMS Selector')]),
    track('Pad 1', [device('Alberton Kit Receiver', 'MxDeviceMidiEffect', []), device('Analog Lab V', 'PluginDevice', [])]),
  ];
  const canonical = inChain ? `live_set tracks ${onTrack} devices ${atDevice} chains 0 devices 0` : `live_set tracks ${onTrack} devices ${atDevice}`;
  const me = node({ name: 'Alberton Kit Receiver', canonical });
  return { live_set: node({ name: 'set' }, { tracks: ts }), this_device: me };
}
const boot = (opts = {}) => { const live = rig(opts); const d = load('kit-receiver', 'kit-receiver.js', { live, controls: opts.controls }); d.live = live; return d; };
const kick = (d) => d.live.live_set.children.tracks[1];
const macro = (t, n) => t.children.devices[1].children.parameters[n].value;
const chain = (t) => t.children.devices[1].children.parameters[17].value;

test('at init it learns its track from its own path and introduces itself on the reply channel', () => {
  const d = boot();
  d.Task.advance(0);
  assert.deepEqual(d.take(2), [['set', 'ks1']]);
  assert.deepEqual(d.take(3), [['set', 'ks1_ret']]);
  d.send('init');
  assert.equal(d.ctx.trackName, 'Kick');
  assert.equal(d.ctx.rackPath, 'live_set tracks 1 devices 1');
  assert.deepEqual(d.take(3), [['bound', 1, 'Kick']]);
  d.send('who');
  assert.deepEqual(d.take(3), [['bound', 1, 'Kick']]);
});

test('a program for its strip goes out as a program change and shows on Last; other strips are ignored', () => {
  const d = boot();
  d.send('prog', 2, 40);
  assert.deepEqual(d.take(0), []); assert.deepEqual(d.take(1), []);
  d.send('prog', 1, 40);
  assert.deepEqual(d.take(0), [[40]]);
  assert.deepEqual(d.take(1), [[40]]);
  assert.equal(d.liveLog.length, 0, 'nothing written to Live for a program change');
});

test('changing strip or bus re-announces and renames the channels', () => {
  const d = boot();
  d.send('init'); d.take(3);
  d.send('strip', 5);
  assert.deepEqual(d.take(3), [['bound', 5, 'Kick']]);
  d.send('bus', 2);
  assert.deepEqual(d.take(2), [['set', 'ks2']]);
  assert.deepEqual(d.take(3), [['set', 'ks2_ret'], ['bound', 5, 'Kick']]);
  d.send('prog', 1, 9);
  assert.deepEqual(d.take(0), [], 'strip 1 is no longer mine');
});

test('the chain-selector action writes the rack on its track; macro n writes Macro n', () => {
  const d = boot();
  d.send('action', 1);
  d.send('prog', 1, 7);
  assert.equal(chain(kick(d)), 7);
  d.send('action', 3);                         // Macro 2
  d.send('prog', 1, 99);
  assert.equal(macro(kick(d), 2), 99);
  assert.equal(chain(kick(d)), 7, 'the chain selector kept its value');
});

test('a chain selector mapped to a macro is refused with advice, not written', () => {
  const d = boot({ tracks: [track('1 DRUMS', []), track('Kick', [device('Alberton Kit Receiver', 'MxDeviceMidiEffect', []), rack('DRUMS Selector', false)])] });
  d.send('action', 1);
  d.send('prog', 1, 7);
  assert.equal(chain(kick(d)), 0);
  assert.match(d.posts.join('\n'), /mapped to a macro/);
});

test('inside a rack chain, the parent rack is the target', () => {
  const d = boot({ onTrack: 1, atDevice: 1, inChain: true });
  d.send('action', 2);                         // Macro 1
  d.send('prog', 1, 64);
  assert.equal(d.ctx.rackPath, 'live_set tracks 1 devices 1');
  assert.equal(macro(kick(d), 1), 64);
});

test('a track without a rack refuses a rack action with a warning; a program change still works', () => {
  const d = boot({ onTrack: 2 });
  d.send('action', 2);
  d.send('prog', 1, 5);
  assert.match(d.posts.join('\n'), /no rack on 'Pad 1'/);
  d.send('action', 0);
  d.send('prog', 1, 5);
  assert.deepEqual(d.take(0), [[5]]);
});

test('vol sets the track volume only for its strip and only while Apply Volume is on', () => {
  const d = boot();
  d.send('vol', 1, 0.7);
  assert.equal(kick(d).children.mixer_device.children.volume.value, 0.7);
  d.send('vol', 2, 0.1);
  assert.equal(kick(d).children.mixer_device.children.volume.value, 0.7);
  d.send('applyvol', 0);
  d.send('vol', 1, 0.2);
  assert.equal(kick(d).children.mixer_device.children.volume.value, 0.7);
});

test('a rack that moved is looked up again once; a dead one is reported', () => {
  const d = boot();
  d.send('action', 2); d.send('prog', 1, 1);
  const devices = kick(d).children.devices;
  const theRack = devices.pop();                // the rack is gone
  d.send('prog', 1, 2);
  assert.match(d.posts.join('\n'), /no rack on 'Kick'/);
  devices.unshift(theRack);                     // it is back, at index 0 this time
  d.send('prog', 1, 3);
  assert.equal(theRack.children.parameters[1].value, 3);
});

test('at compile time the four settings are read from the patcher', () => {
  const d = boot({ controls: { bus: 3, strip: 7, action: 1, applyvol: 0 } });
  d.Task.advance(0);
  assert.equal(d.ctx.busNumber, 3); assert.equal(d.ctx.stripNumber, 7); assert.equal(d.ctx.actionIndex, 1); assert.equal(d.ctx.applyVolume, 0);
  assert.deepEqual(d.take(2), [['set', 'ks3']]);
});

test('the None action shows the value on Last and does nothing else', () => {
  const d = boot();
  d.send('action', 18);
  d.send('prog', 1, 44);
  assert.deepEqual(d.take(1), [[44]]);
  assert.deepEqual(d.take(0), []);
  assert.equal(d.liveLog.length, 0);
  d.send('vol', 1, 0.6);
  assert.equal(kick(d).children.mixer_device.children.volume.value, 0.6, 'the volume still applies');
});
