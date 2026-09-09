'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./max-stub');

let nextId = 1;
const node = (props, children) => ({ id: nextId++, ...props, children: children || {} });
const param = (name, value, extra) => node({ name, value, min: -48, max: 48, ...extra });
const device = (name, class_name, params) => node({ name, class_name }, { parameters: params });
const pitch = (name = '[PITCH]') => device(name, 'MidiPitcher', [param('Device On', 1, { min: 0, max: 1 }), param('Pitch', 0)]);
const track = (name, devices) => node({ name }, { devices });

function rig() {
  nextId = 1;
  const own = track('MIDI REC', [device('Alberton Transpose Q', 'MxDeviceMidiEffect', []), pitch()]);   // a [PITCH] on the own track: never touched
  const tracks = [
    track('6 BASS', []),
    track('Bass Synth', [device('Step', 'MxDeviceMidiEffect', []), pitch()]),
    track('Kick', [pitch('Pitch')]),                              // a Pitch device without the tag: not a target
    track('Pad 1', [pitch('Pad [PITCH] up')]),                     // the tag anywhere in the name
    own,
    track('Vocoder', [pitch()]),
    track('Odd', [device('[PITCH] but not a pitcher', 'AudioEffectGroupDevice', [param('Device On', 1, { min: 0, max: 1 })])]),
  ];
  return { live_set: node({ name: 'set' }, { tracks }), this_device: node({}, { canonical_parent: own }) };
}
const boot = (opts = {}) => { const live = rig(); const d = load('transpose-q', 'alberton-transpose-q.js', { live, controls: opts.controls }); d.live = live; return d; };
const tracks = (d) => d.live.live_set.children.tracks;
const pitchOf = (t) => t.children.devices.find(x => x.class_name === 'MidiPitcher').children.parameters[1].value;
const beat = (d, n) => d.sendOn(1, 'msg_int', n);

test('on the bar line a pending value reaches every [PITCH] device except those on the own track or without the tag', () => {
  const d = boot();
  d.send('pending', 2);
  beat(d, 2); beat(d, 3); beat(d, 4);
  assert.equal(d.liveLog.length, 0, 'not before beat 1');
  beat(d, 1);
  const ts = tracks(d);
  assert.equal(pitchOf(ts[1]), 2); assert.equal(pitchOf(ts[3]), 2); assert.equal(pitchOf(ts[5]), 2);
  assert.equal(pitchOf(ts[2]), 0, 'no tag, no write'); assert.equal(pitchOf(ts[4]), 0, 'the own track is left alone');
  assert.deepEqual(d.take(), [[2]]);
  assert.match(d.posts.join('\n'), /carries \[PITCH\] but has no Pitch parameter/);
  assert.equal(d.posts.length, 1);
});

test('quantize to the beat applies on any beat change; off applies at once', () => {
  const d = boot();
  d.send('quantize', 1);
  d.send('pending', 3); beat(d, 3);
  assert.equal(pitchOf(tracks(d)[1]), 3);
  d.send('quantize', 2);
  d.send('pending', -5);
  assert.equal(pitchOf(tracks(d)[1]), -5, 'no beat needed');
  d.send('quantize', 0);
  d.send('pending', 1); beat(d, 2);
  assert.equal(pitchOf(tracks(d)[1]), -5, 'back on the bar: waits for beat 1');
  beat(d, 1);
  assert.equal(pitchOf(tracks(d)[1]), 1);
});

test('switching quantize off releases what was waiting', () => {
  const d = boot();
  d.send('pending', 4);
  d.send('quantize', 2);
  assert.equal(pitchOf(tracks(d)[1]), 4);
});

test('a beat with nothing pending costs no Live API object; the second change uses the cache', () => {
  const d = boot();
  d.send('pending', 3); beat(d, 1);
  let before = d.ctx.LiveAPI.created;
  beat(d, 2); beat(d, 1);
  assert.equal(d.ctx.LiveAPI.created, before);
  before = d.ctx.LiveAPI.created;
  d.send('pending', -1); beat(d, 1);
  assert.equal(d.ctx.LiveAPI.created - before, 1 + 3, 'the count check plus one per target');
});

test('current applies at once; bang on inlet 1 is a manual downbeat; bang on inlet 0 is nothing', () => {
  const d = boot();
  d.send('current', 7);
  assert.equal(pitchOf(tracks(d)[1]), 7);
  d.send('pending', 5); d.sendOn(0, 'bang');
  assert.equal(pitchOf(tracks(d)[1]), 7);
  d.sendOn(1, 'bang');
  assert.equal(pitchOf(tracks(d)[1]), 5);
});

test('rescan, a track-count change and the tracks observer each clear the cache', () => {
  const d = boot();
  d.send('current', 1);
  assert.equal(d.ctx.LiveAPI.observers.length, 1);
  d.send('rescan'); assert.equal(d.ctx.pitchTargets, null);
  d.send('current', 2); assert.equal(d.ctx.pitchTargets.length, 3);
  tracks(d).push(track('Lead 1', [pitch()]));
  d.send('current', 3); assert.equal(d.ctx.pitchTargets.length, 4, 'rebuilt because the count changed');
  tracks(d)[3].children.devices.length = 0;
  d.ctx.LiveAPI.notify('tracks');
  assert.equal(d.ctx.pitchTargets, null, 'the observer cleared it');
  d.send('current', 4); assert.equal(d.ctx.pitchTargets.length, 3);
});

test('a track that answers nothing is skipped; a target that disappears is reported and the rest are written', () => {
  const d = boot();
  tracks(d)[1].children.devices[1].name = null;       // a device that answers nothing: the whole track is skipped
  d.send('current', 2);
  assert.equal(d.ctx.pitchTargets.length, 2);
  assert.match(d.posts.join('\n'), /scan of track 1 failed/);
  tracks(d)[5].children.devices.length = 0;
  d.posts.length = 0;
  d.send('current', 3);
  assert.match(d.posts.join('\n'), /target is gone/);
  assert.equal(pitchOf(tracks(d)[3]), 3);
});

test('at compile time the script reads Pending, Current and Quantize from the patcher', () => {
  const d = boot({ controls: { 'live.dial': 2, 'live.dial[1]': 2, quantize: 1 } });
  d.Task.advance(0);
  assert.equal(d.ctx.pendingTranspose, 2); assert.equal(d.ctx.currentTranspose, 2); assert.equal(d.ctx.quantizeMode, 1);
  beat(d, 3);
  assert.equal(d.liveLog.length, 0, 'pending equals current: nothing to apply');
});

