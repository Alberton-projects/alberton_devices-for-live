'use strict';
// Characterisation of live_controller.js as it is today, against a stand-in of the set.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./max-stub');

// --- a small copy of the set's shape ---------------------------------------------
let nextId = 1;
const node = (props, children) => ({ id: nextId++, ...props, children: children || {} });
const param = (name, value, extra) => node({ name, value, min: 0, max: 127, ...extra });
const device = (name, class_name, params) => node({ name, class_name }, { parameters: params });
const macros = (n) => Array.from({ length: n }, (_, i) => param('Macro ' + (i + 1), 10 * (i + 1)));
const fxRack = (values) => device('[FX] Alberton per Track-1', 'AudioEffectGroupDevice',
  [param('Device On', 1), ...values.map((v, i) => param('Macro ' + (i + 1), v)), ...macros(7)]);
const track = (name, devices, extra) => node({ name, is_foldable: 0, ...extra },
  { devices, mixer_device: node({}, { volume: param('Volume', 0.5, { min: 0, max: 1 }) }) });
const drumTrack = (name) => track(name, [
  device('Alberton Drum Mapper', 'MxDeviceMidiEffect', [param('Device On', 1), param('live.menu', 0)]),
  device('Alberton DRUMS Selector', 'InstrumentGroupDevice',
    [param('Device On', 1), param('Chain Selector', 0), ...macros(15), param('Chain Selector', 0, { disabled: true })]),
]);

function rig() {
  nextId = 1;
  const tracks = [
    track('1 DRUMS', [device('Alberton Drums Chain', 'InstrumentGroupDevice', macros(8)), fxRack([64, 127, 14, 0, 0, 0, 0, 0, 0])], { is_foldable: 1 }),
    drumTrack('Kick'), drumTrack('Snare'), drumTrack('HiHat'), drumTrack('Cymbals'),
    track('6 BASS', [fxRack([1, 2, 3, 4, 5, 6, 7, 8, 9])], { is_foldable: 1 }),
    track('Bass Synth', [
      device('[PITCH]', 'MidiPitcher', [param('Device On', 1), param('Pitch', 0, { min: -48, max: 48 })]),
      device('Alberton PC Kit Selector Receiver', 'MxDeviceMidiEffect', [param('Device On', 1), param('Track ID', 1), param('PC Display', 0)]),
      device('Analog Lab V', 'PluginDevice', [param('Device On', 1), param('Program', 3)]),
    ]),
    track('Bass Electric', [device('Fretless Bass Open', 'InstrumentVector', [param('Device On', 1)])]),
    track('Pad 1', [device('Analog Lab V', 'PluginDevice', [param('Device On', 1)])]),   // no preset parameter exposed
    track('Vocals', [fxRack([9, 8, 7, 6, 5, 4, 3, 2, 1])]),
    track('Resample', []),
    track('Live Scratcher', []),
    track('MIDI REC', [device('Alberton Transpose Q', 'MxDeviceMidiEffect', [param('Device On', 1)])]),
  ];
  return {
    live_set: node({ name: 'Alberton Multiverse' }, {
      tracks,
      return_tracks: [track('A-Reverb', []), track('B-Delay', [])],
      master_track: track('Main', []),
    }),
  };
}

const boot = () => { const live = rig(); const d = load('kit-selector', 'live_controller.js', { live }); d.live = live; return d; };
const byName = (live, name) => live.live_set.children.tracks.find(t => t.name === name);
const volumeOf = (t) => t.children.mixer_device.children.volume.value;

test('refresh caches the four drum tracks and the melodic tracks that expose a preset parameter', () => {
  const d = boot();
  d.send('refresh');
  assert.deepEqual(Object.keys(d.ctx.drumCache).sort(), ['cymbals', 'hihat', 'kick', 'snare']);
  assert.deepEqual(Object.keys(d.ctx.melodicCache).sort(), ['bass_synth', 'pad1']);
  assert.equal(d.ctx.melodicCache.bass_synth.paramName, 'Program');
  assert.equal(d.ctx.melodicCache.pad1.needsConfiguration, true, 'a plugin with no preset parameter is cached as needing configuration');
  assert.deepEqual(d.take(), [['refresh_complete']]);
  assert.match(d.posts.join('\n'), /Scan complete: 4\/4 drums, 2\/8 melodic/);
});

test('a drum dial writes the first parameter whose name contains "Chain", the enabled macro', () => {
  const d = boot();
  d.send('refresh'); d.take();
  d.send('kick', 3);
  const writes = d.liveLog.filter(w => w.prop === 'value');
  assert.equal(writes.length, 1);
  assert.match(writes[0].path, /Kick|tracks 1 /);
  assert.equal(writes[0].path, 'live_set tracks 1 devices 1 parameters 1');
  assert.equal(writes[0].value, 3);
  assert.equal(d.posts.filter(p => /disabled/.test(p)).length, 0, 'the disabled real Chain Selector is never reached');
});

test('a drum dial before refresh writes nothing and says so', () => {
  const d = boot();
  d.send('snare', 5);
  assert.equal(d.liveLog.length, 0);
  assert.match(d.posts.join('\n'), /snare not in cache/);
});

test('melodic dials queue program changes, one every 150 ms, then the queue stops', () => {
  const d = boot();
  d.send('bass_synth', 5); d.send('pad1', 7);
  assert.deepEqual(d.take(), [], 'nothing leaves at once');
  d.Task.advance(150);
  assert.deepEqual(d.take(), [['pc', 'bass_synth', 5]]);
  d.Task.advance(150);
  assert.deepEqual(d.take(), [['pc', 'pad1', 7]]);
  d.Task.advance(150);
  assert.deepEqual(d.take(), []);
  assert.equal(d.ctx.pcTask, null, 'the task cancels itself when the queue is empty');
  d.send('pc_interval', 200);
  d.send('lead1', 1);
  d.Task.advance(150);
  assert.deepEqual(d.take(), [], 'a new interval applies to the next queue');
  d.Task.advance(50);
  assert.deepEqual(d.take(), [['pc', 'lead1', 1]]);
});

test('clearPCQueue drops what is still queued', () => {
  const d = boot();
  d.send('pad1', 1); d.send('pad2', 2);
  d.send('clearPCQueue');
  d.Task.advance(1000);
  assert.deepEqual(d.take(), []);
});

test('sendAll re-sends every chain and program and resets the volumes by name', () => {
  const d = boot();
  d.send('refresh'); d.take(); d.liveLog.length = 0;
  d.send('kick', 2); d.send('bass_synth', 9);
  d.Task.advance(150); d.liveLog.length = 0; d.take();   // let the queued program change go out first
  d.send('sendAll');
  d.Task.advance(8 * 150);
  const out = d.take();
  assert.deepEqual(out.filter(o => o[0] === 'pc').map(o => o.slice(1)),
    [['bass_electric', 0], ['bass_synth', 9], ['pad1', 0], ['pad2', 0], ['piano1', 0], ['piano2', 0], ['lead1', 0], ['lead2', 0]]);
  assert.ok(out.some(o => o[0] === 'volumes_reset') && out.some(o => o[0] === 'sent_all'));
  const chains = d.liveLog.filter(w => /devices 1 parameters 1$/.test(w.path));
  assert.deepEqual(chains.map(w => w.value), [2, 0, 0, 0], 'kick keeps its value, the others are 0');
  const live = d.live;
  assert.equal(volumeOf(byName(live, 'Kick')), 0.70);
  assert.equal(volumeOf(byName(live, '1 DRUMS')), 0.70, 'group tracks are reset too');
  assert.equal(volumeOf(byName(live, 'Bass Electric')), 0.85);
  assert.equal(volumeOf(byName(live, 'Resample')), 0.85);
  assert.equal(volumeOf(byName(live, 'Live Scratcher')), 0.36);
  assert.equal(volumeOf(byName(live, 'Vocals')), 0.625);
  assert.equal(volumeOf(byName(live, 'MIDI REC')), 0.70);
  for (const r of live.live_set.children.return_tracks) assert.equal(volumeOf(r), 0.70);
  assert.equal(volumeOf(live.live_set.children.master_track), 0.85, 'the master goes to 0 dB since 2026-09-03');
});

test('capture_fx reads nine macros of every [FX] rack it can find, zeros for the rest', () => {
  const d = boot();
  d.send('capture_fx');
  const out = d.take();
  const fx = Object.fromEntries(out.filter(o => /_fx$/.test(o[0])).map(o => [o[0], o.slice(1)]));
  assert.deepEqual(fx.drums_fx, [64, 127, 14, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(fx.bass_fx, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(fx.vocals_fx, [9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual(fx.pads_fx, [0, 0, 0, 0, 0, 0, 0, 0, 0], 'no PADS group in this rig');
  assert.deepEqual(fx.resample_fx, [0, 0, 0, 0, 0, 0, 0, 0, 0], 'Resample has no [FX] device here');
  assert.deepEqual(out[out.length - 1], ['fx_captured']);
});

test('a recalled FX slider writes its nine values to the rack macros', () => {
  const d = boot();
  d.send('drums_fx', 1, 2, 3, 4, 5, 6, 7, 8, 9);
  const writes = d.liveLog.filter(w => w.prop === 'value');
  assert.equal(writes.length, 9);
  assert.deepEqual(writes.map(w => w.value), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(writes.every(w => w.path.startsWith('live_set tracks 0 devices 1 parameters ')));
  const rack = byName(d.live, '1 DRUMS').children.devices[1];
  assert.equal(rack.children.parameters[1].value, 1);
  assert.equal(rack.children.parameters[9].value, 9);
});

test('preset names: set, get, pack and unpack', () => {
  const d = boot();
  d.send('preset_name', 3, 'No', 'fas', 'pas', 'por');
  d.send('get_preset_name', 3);
  assert.deepEqual(d.take(), [['name', 3, 'No fas pas por']]);
  d.send('current_preset', 3);
  assert.deepEqual(d.take(), [['current_name', 'No fas pas por']]);
  d.send('get_names_data');
  const data = d.take()[0][1];
  assert.match(data, /^Preset 1\|Preset 2\|Preset 3\|No fas pas por\|Preset 5/);
  d.send('reset_names');
  d.send('get_preset_name', 3);
  assert.deepEqual(d.take(), [['name', 3, 'Preset 4']]);
  d.send('set_names_data', ...data.split(' '));
  d.send('get_preset_name', 3);
  assert.deepEqual(d.take(), [['name', 3, 'No fas pas por']]);
});

test('today, a track that answers nothing stops refresh with an exception', () => {
  const d = boot();
  byName(d.live, 'Snare').name = null;
  assert.throws(() => d.send('refresh'), (e) => e.name === 'TypeError');   // the vm's TypeError is another realm's
  assert.deepEqual(Object.keys(d.ctx.drumCache), ['kick'], 'the scan died after the first drum track');
});
