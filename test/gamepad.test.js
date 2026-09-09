'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./max-stub');

let nextId = 1;
const node = (props, children) => ({ id: nextId++, ...props, children: children || {} });
const track = (name, slots = 4) => node({ name }, { clip_slots: Array.from({ length: slots }, () => node({})) });
function rig(names = ['1 DRUMS', 'Kick', 'Snare', 'Live Scratcher', 'MIDI REC']) {
  nextId = 1;
  return { live_set: node({ name: 'set' }, { tracks: names.map(n => track(n)), scenes: [node({}), node({}), node({})] }) };
}
const boot = (opts = {}) => { const live = rig(opts.names); const d = load('gamepad', 'slot-fire.js', { live, controls: opts.controls }); d.live = live; return d; };
const menu = (d) => d.take(1);
const fires = (d) => d.liveLog.filter(w => w.call === 'fire').map(w => w.path);

test('refresh fills the menu with the track names and shows the first track', () => {
  const d = boot();
  d.send('refresh');
  assert.deepEqual(menu(d), [['_parameter_range', '1 DRUMS', 'Kick', 'Snare', 'Live Scratcher', 'MIDI REC'], ['set', 0]]);
  assert.equal(d.ctx.target_track_index, 0);
  assert.equal(d.posts.length, 0);
});

test('choosing a track on the menu fires on it by index, one Live API object per fire', () => {
  const d = boot();
  d.send('refresh'); d.take(1);
  d.send('msg_int', 3);
  assert.deepEqual(d.take(2), [['Live Scratcher']], 'the name goes to the pattr');
  const before = d.ctx.LiveAPI.created;
  d.ctx.list(1, 2);
  assert.equal(d.ctx.LiveAPI.created - before, 1);
  assert.deepEqual(fires(d), ['live_set tracks 3 clip_slots 2']);
  assert.deepEqual(d.take(0), [['fired', 2]]);
  d.ctx.list(0, 2);
  assert.equal(fires(d).length, 1, 'a release fires nothing');
});

test('a saved name restored by the pattr before the scan is resolved at init, even if tracks moved', () => {
  const d = boot({ names: ['Kick', 'Live Scratcher', 'Snare'] });
  d.send('restore', 'Live', 'Scratcher');          // from the pattr, at load, before the scan
  assert.equal(d.ctx.selected_name, 'Live Scratcher');
  d.send('init');
  assert.deepEqual(menu(d).pop(), ['set', 1]);
  assert.equal(d.ctx.target_track_index, 1);
  d.ctx.list(1, 0);
  assert.deepEqual(fires(d), ['live_set tracks 1 clip_slots 0']);
});

test('a saved name that is no longer in the set falls back to the first track, with a warning', () => {
  const d = boot();
  d.send('restore', 'Gone');
  d.send('refresh');
  assert.equal(d.ctx.target_track_index, 0);
  assert.match(d.posts.join('\n'), /'Gone' is not in the set/);
});

test('the tracks observer rebuilds the list and keeps the chosen track by name', () => {
  const d = boot();
  d.send('refresh'); d.take(1);
  d.send('msg_int', 3);                              // Live Scratcher
  d.live.live_set.children.tracks.unshift(track('New first'));
  d.ctx.LiveAPI.notify('tracks');
  assert.equal(d.ctx.target_track_index, 4, 'the same track, one index later');
  assert.deepEqual(menu(d).pop(), ['set', 4]);
});

test('after a recompile the name comes from the pattr and the list is rebuilt on first use', () => {
  const d = boot({ controls: { track_sel: 'Snare' } });
  d.Task.advance(0);
  assert.equal(d.ctx.selected_name, 'Snare');
  assert.equal(d.ctx.track_names.length, 0, 'nothing scanned yet');
  d.ctx.list(1, 1);                                  // first use
  assert.deepEqual(fires(d), ['live_set tracks 2 clip_slots 1']);
});

test('scenes fire by number; a missing scene or slot is reported, not fatal', () => {
  const d = boot();
  d.ctx.messagename = 'scene'; d.ctx.anything(1, 2);
  assert.deepEqual(fires(d), ['live_set scenes 2']);
  assert.deepEqual(d.take(0), [['scene_fired', 2]]);
  d.ctx.anything(1, 9);
  assert.match(d.posts.join('\n'), /no scene 9/);
  d.send('refresh'); d.ctx.list(1, 7);
  assert.match(d.posts.join('\n'), /no clip slot 7/);
});

test('with the Live API not ready, refresh shows nothing and a menu value is ignored; the pattr name still wins', () => {
  const d = boot({ names: [] });                       // an unreachable live_set: no tracks answer
  d.send('refresh');
  assert.deepEqual(menu(d), [], 'no empty list is sent to the menu');
  d.send('msg_int', 2);                                // the menu's clamped restored value
  assert.equal(d.ctx.selected_name, '');
  assert.deepEqual(d.take(2), []);
  d.send('restore', 'Snare');
  d.live.live_set.children.tracks.push(track('Kick'), track('Snare'));
  d.send('init');
  assert.deepEqual(menu(d).pop(), ['set', 1]);
});
