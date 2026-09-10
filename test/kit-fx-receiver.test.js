'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./max-stub');

let nextId = 1;
const node = (props, children) => ({ id: nextId++, ...props, children: children || {} });
const param = (name, value, extra) => node({ name, value, min: 0, max: 127, is_enabled: 1, ...extra });
const device = (name, class_name, params) => node({ name, class_name }, { parameters: params });
const rack = (name, disabled = []) => device(name, 'AudioEffectGroupDevice',
  [param('Device On', 1), ...Array.from({ length: 16 }, (_, i) => param('Macro ' + (i + 1), 10 + i, { is_enabled: disabled.includes(i + 1) ? 0 : 1 }))]);
const track = (name, devices) => node({ name }, { devices, mixer_device: node({}, { volume: param('Volume', 0.5, { max: 1 }) }) });

function rig({ atDevice = 2, inChain = false, devices } = {}) {
  nextId = 1;
  const ds = devices || [rack('Alberton Drums Chain'), rack('[FX] Alberton per Track-1'), device('Alberton Kit FX Receiver', 'MxDeviceAudioEffect', [])];
  const t = track('1 DRUMS', ds);
  const canonical = inChain ? `live_set tracks 0 devices ${atDevice} chains 0 devices 0` : `live_set tracks 0 devices ${atDevice}`;
  return { live_set: node({ name: 'set' }, { tracks: [t] }), this_device: node({ name: 'Alberton Kit FX Receiver', canonical }) };
}
const boot = (opts = {}) => { const live = rig(opts); const d = load('kit-fx-receiver', 'kit-fx-receiver.js', { live, controls: opts.controls }); d.live = live; d.Task.advance(0); d.take(0); d.take(1); return d; };
const macros = (d, di) => d.live.live_set.children.tracks[0].children.devices[di].children.parameters.slice(1, 10).map(p => p.value);

test('appended after the racks, it binds to the last rack before it and writes its bank\'s nine macros', () => {
  const d = boot();
  d.send('init');
  assert.equal(d.ctx.rackPath, 'live_set tracks 0 devices 1', 'the [FX] rack, not the chain rack');
  assert.deepEqual(d.take(0), [['boundfx', 1, '1 DRUMS']]);
  d.send('fx', 1, 1, 2, 3, 4, 5, 6, 7, 8, 9);
  assert.deepEqual(macros(d, 1), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(macros(d, 0), [10, 11, 12, 13, 14, 15, 16, 17, 18], 'the other rack untouched');
  assert.deepEqual(d.take(2), [[9]]);
  d.send('fx', 2, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  assert.deepEqual(macros(d, 1), [1, 2, 3, 4, 5, 6, 7, 8, 9], 'another bank is not mine');
});

test('placed before a rack it binds to the first rack after it; inside a chain, to the parent rack', () => {
  const d = boot({ atDevice: 0, devices: [device('Alberton Kit FX Receiver', 'MxDeviceAudioEffect', []), rack('Alberton Drums Chain'), rack('[FX] Alberton per Track-1')] });
  d.send('init');
  assert.equal(d.ctx.rackPath, 'live_set tracks 0 devices 1');
  const c = boot({ atDevice: 1, inChain: true });
  c.send('init');
  assert.equal(c.ctx.rackPath, 'live_set tracks 0 devices 1');
});

test('capture answers with the rack\'s macros; a disabled macro is skipped on write', () => {
  const d = boot({ devices: [rack('[FX] Alberton per Track-1', [1, 6, 7, 8]), device('Alberton Kit FX Receiver', 'MxDeviceAudioEffect', [])], atDevice: 1 });
  d.send('capture');
  assert.deepEqual(d.take(0), [['fxret', 1, 10, 11, 12, 13, 14, 15, 16, 17, 18]]);
  d.send('fx', 1, 1, 2, 3, 4, 5, 6, 7, 8, 9);
  assert.deepEqual(macros(d, 0), [10, 2, 3, 4, 5, 15, 16, 17, 9]);
  assert.deepEqual(d.take(2), [[5]]);
  assert.equal(d.posts.length, 0, 'quietly');
});

test('fxvol sets the track volume for its bank while Apply Volume is on', () => {
  const d = boot();
  d.send('fxvol', 1, 0.7);
  assert.equal(d.live.live_set.children.tracks[0].children.mixer_device.children.volume.value, 0.7);
  d.send('fxvol', 2, 0.1); d.send('applyvol', 0); d.send('fxvol', 1, 0.2);
  assert.equal(d.live.live_set.children.tracks[0].children.mixer_device.children.volume.value, 0.7);
});

test('a track with no rack refuses with a warning; bank and bus changes re-announce and rename', () => {
  const d = boot({ devices: [device('Alberton Kit FX Receiver', 'MxDeviceAudioEffect', [])], atDevice: 0 });
  d.send('fx', 1, 1, 2, 3, 4, 5, 6, 7, 8, 9);
  assert.match(d.posts.join('\n'), /no rack near '1 DRUMS'/);
  d.send('bank', 4);
  assert.deepEqual(d.take(0), [['boundfx', 4, '1 DRUMS']]);
  d.send('bus', 2);
  assert.deepEqual(d.take(1), [['set', 'ks2']]);
  assert.deepEqual(d.take(0), [['set', 'ks2_ret'], ['boundfx', 4, '1 DRUMS']]);
});

test('at compile time bus, bank and apply volume are read from the patcher', () => {
  const live = rig();
  const d = load('kit-fx-receiver', 'kit-fx-receiver.js', { live, controls: { bus: 3, bank: 7, applyvol: 0 } });
  d.Task.advance(0);
  assert.equal(d.ctx.busNumber, 3); assert.equal(d.ctx.bankNumber, 7); assert.equal(d.ctx.applyVolume, 0);
});
