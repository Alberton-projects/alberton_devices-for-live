'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./max-stub');

const dev = (mode) => { const d = load('drum-mapper', 'alberton-drum-mapper.js'); if (mode !== undefined) d.send('msg_int', mode); return d; };
const KICK = 0, SNARE = 1, HIHAT = 2, CYMBALS = 3;
const SNARE_RANGE = [37, 38, 39, 40, 41, 43, 45, 47, 48, 50, 52];
const HIHAT_RANGE = [42, 44, 46];
const CYMBAL_RANGE = [49, 51, 53, 55, 57, 59];

test('the mode menu selects the map; out-of-range values are ignored', () => {
  const d = dev();
  d.send('msg_int', 9);
  assert.equal(d.ctx.mode, 0);
  d.send('msg_int', 3);
  assert.equal(d.ctx.mode, 3);
});

test('kick: B0 and C1 pass, everything else lands on one of them', () => {
  const d = dev(KICK);
  for (let p = 0; p < 128; p++) {
    const q = d.ctx.mapKick(p);
    if (p === 35 || p === 36) assert.equal(q, p); else assert.ok(q === 35 || q === 36, `${p} -> ${q}`);
  }
});

test('snare: articulations pass, the rest map deterministically by pitch', () => {
  const d = dev(SNARE);
  for (const p of SNARE_RANGE) assert.equal(d.ctx.mapSnare(p), p);
  for (let p = 0; p < 128; p++) {
    const q = d.ctx.mapSnare(p);
    assert.ok(SNARE_RANGE.includes(q), `${p} -> ${q}`);
    assert.equal(d.ctx.mapSnare(p), q, 'same pitch, same snare');
  }
});

test('hi-hat: open above velocity 85, closed or pedal below', () => {
  const d = dev(HIHAT);
  for (const p of HIHAT_RANGE) assert.equal(d.ctx.mapHihat(p, 100), p);
  for (let v = 86; v <= 127; v++) assert.equal(d.ctx.mapHihat(60, v), 46);
  for (let i = 0; i < 200; i++) assert.ok([42, 44].includes(d.ctx.mapHihat(60, 1 + (i % 85))));
});

test('cymbals: ride, bell, crash by velocity band', () => {
  const d = dev(CYMBALS);
  for (const p of CYMBAL_RANGE) assert.equal(d.ctx.mapCymbals(p, 100), p);
  for (let v = 1; v <= 79; v++) assert.equal(d.ctx.mapCymbals(60, v), 51);
  for (let v = 80; v <= 105; v++) assert.equal(d.ctx.mapCymbals(60, v), 53);
  for (let v = 106; v <= 127; v++) assert.equal(d.ctx.mapCymbals(60, v), 49, 'an even pitch crashes on C#2');
  for (let v = 106; v <= 127; v++) assert.equal(d.ctx.mapCymbals(61, v), 57, 'an odd pitch crashes on A2');
});

test('with humanize off the soft hi-hat follows pitch parity', () => {
  const d = dev(HIHAT);
  d.send('humanize', 0);
  for (let i = 0; i < 20; i++) { assert.equal(d.ctx.mapHihat(60, 40), 42); assert.equal(d.ctx.mapHihat(61, 40), 44); }
  d.send('humanize', 1);
  const seen = new Set(); for (let i = 0; i < 200; i++) seen.add(d.ctx.mapHihat(60, 40));
  assert.deepEqual([...seen].sort(), [42, 44], 'with humanize on both hats appear');
});

test('reset and CC 123 release every held note, then nothing is held', () => {
  const d = dev(SNARE);
  d.note(60, 100); d.note(62, 100); d.note(60, 90);
  const ons = d.take().map(o => o[0]);
  d.send('reset');
  assert.deepEqual(d.take().map(o => o[0]).sort(), ons.slice().sort());
  d.note(60, 0);
  assert.deepEqual(d.take(), [], 'nothing left to release');
  d.note(64, 100); d.take();
  d.send('cc', 123, 0);
  assert.equal(d.take().length, 1);
  d.send('cc', 64, 127);
  assert.deepEqual(d.take(), [], 'other controllers do nothing here');
});

test('note-off releases the pitch that was actually played, per held note', () => {
  const d = dev(HIHAT);
  d.note(60, 120); d.note(60, 40);           // open hat, then closed or pedal
  const ons = d.take();
  assert.equal(ons[0][0], 46);
  assert.ok([42, 44].includes(ons[1][0]));
  d.note(60, 0); d.note(60, 0);
  assert.deepEqual(d.take(), [[ons[0][0], 0], [ons[1][0], 0]]);
});

test('bang reports the mode without sending anything', () => {
  const d = dev(SNARE);
  d.send('bang');
  assert.deepEqual(d.take(), []);
  assert.match(d.posts.join('\n'), /SNARE.*humanize on/);
});
