'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./max-stub');

let nextId = 1;
const node = (props, children) => ({ id: nextId++, ...props, children: children || {} });
const param = (name, value, extra) => node({ name, value, min: -48, max: 48, ...extra });
const device = (name, class_name, params) => node({ name, class_name }, { parameters: params });
const pitch = (name = '[PITCH]', cls = 'MidiPitcher') => device(name, cls, [param('Device On', 1, { min: 0, max: 1 }), param('Pitch', 0)]);
const track = (name, devices, extra) => node({ name, is_foldable: 0, ...extra }, { devices });

function rig() {
  nextId = 1;
  return { live_set: node({ name: 'set' }, { tracks: [
    track('6 BASS', [], { is_foldable: 1 }),
    track('Bass Synth', [device('Step', 'MxDeviceMidiEffect', []), pitch()]),
    track('Bass Electric', [pitch()]),
    track('Kick', [pitch()]),                                   // not melodic by name: never touched
    track('Pad 1', [pitch('Pitch Shift', 'MidiPitcher')]),       // matched by class, not by name
    track('MIDI REC', [pitch()]),                                // excluded by name
    track('Vocoder', [pitch()]),
    track('Bass Drum', [device('Drum Rack', 'DrumGroupDevice', [param('Device On', 1)])]),   // "bass" by substring, no [PITCH]
  ] }) };
}
const boot = () => { const live = rig(); const d = load('transpose-q', 'alberton-transpose-v2.js', { live }); d.live = live; return d; };
const tracks = (d) => d.live.live_set.children.tracks;
const pitchOf = (t) => t.children.devices.find(x => x.class_name === 'MidiPitcher').children.parameters[1].value;
const downbeat = (d) => d.sendOn(1, 'bang');

test('a pending value is applied on the downbeat to every [PITCH] on a melodic track', () => {
  const d = boot();
  d.send('pending', 2);
  assert.equal(d.liveLog.length, 0, 'nothing is written before the downbeat');
  downbeat(d);
  const ts = tracks(d);
  assert.equal(pitchOf(ts[1]), 2); assert.equal(pitchOf(ts[2]), 2); assert.equal(pitchOf(ts[4]), 2); assert.equal(pitchOf(ts[6]), 2);
  assert.equal(pitchOf(ts[3]), 0, 'Kick is not melodic'); assert.equal(pitchOf(ts[5]), 0, 'MIDI REC is excluded');
  assert.deepEqual(d.take(), [[2]], 'the display dial gets the applied value');
  assert.equal(d.posts.length, 0, 'silent unless debug is on');
});

test('a downbeat with nothing pending costs no Live API object at all', () => {
  const d = boot();
  d.send('pending', 3); downbeat(d);
  const before = d.ctx.LiveAPI.created;
  downbeat(d); downbeat(d);
  assert.equal(d.ctx.LiveAPI.created, before);
  assert.deepEqual(d.take(), [[3]], 'and nothing is re-sent');
});

test('the second change uses the cache: one object for the count check plus one per target', () => {
  const d = boot();
  d.send('pending', 1); downbeat(d);
  const before = d.ctx.LiveAPI.created;
  d.send('pending', -1); downbeat(d);
  assert.equal(d.ctx.LiveAPI.created - before, 1 + 4);
  assert.equal(pitchOf(tracks(d)[1]), -1);
});

test('msg_int on inlet 1 is the downbeat; on inlet 0 it is the pending value; bang on inlet 0 is nothing', () => {
  const d = boot();
  d.sendOn(0, 'msg_int', 5);
  d.sendOn(0, 'bang');
  assert.equal(d.liveLog.length, 0);
  d.sendOn(1, 'msg_int', 0);
  assert.equal(pitchOf(tracks(d)[1]), 5);
});

test('current applies at once, without a downbeat', () => {
  const d = boot();
  d.send('current', 7);
  assert.equal(pitchOf(tracks(d)[2]), 7);
  assert.deepEqual(d.take(), [[7]]);
});

test('rescan, a track-count change and the tracks observer each clear the cache', () => {
  const d = boot();
  d.send('current', 1);
  assert.equal(d.ctx.LiveAPI.observers.length, 1, 'the observer exists after the first application');
  d.send('rescan');
  assert.equal(d.ctx.pitchTargets, null);
  d.send('current', 2);
  assert.equal(d.ctx.pitchTargets.length, 4);
  tracks(d).push(track('Lead 1', [pitch()]));
  d.send('current', 3);
  assert.equal(d.ctx.pitchTargets.length, 5, 'rebuilt because the count changed');
  tracks(d)[4].children.devices.length = 0;      // Pad 1 lost its Pitch device; same count
  d.ctx.LiveAPI.notify('tracks');
  assert.equal(d.ctx.pitchTargets, null, 'the observer cleared it');
  d.send('current', 4);
  assert.equal(d.ctx.pitchTargets.length, 4);
});

test('a track that answers nothing is skipped; a target that disappears is reported and the rest are written', () => {
  const d = boot();
  tracks(d)[2].name = null;
  d.send('current', 2);
  assert.equal(d.ctx.pitchTargets.length, 3);
  assert.match(d.posts.join('\n'), /scan of track 2 failed/);
  tracks(d)[6].children.devices.length = 0;      // Vocoder's device is gone, cache still points at it
  d.posts.length = 0;
  d.send('current', 3);
  assert.match(d.posts.join('\n'), /target is gone/);
  assert.equal(pitchOf(tracks(d)[1]), 3);
  assert.equal(pitchOf(tracks(d)[4]), 3);
});
