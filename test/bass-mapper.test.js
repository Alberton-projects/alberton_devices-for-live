'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./max-stub');

const LOW = 36, HIGH = 60;
const dev = () => load('bass-mapper', 'alberton-bass-mapper.js');

test('every pitch lands inside the window and keeps its pitch class', () => {
  const d = dev();
  for (let p = 0; p < 128; p++) {
    const q = d.ctx.foldToBassRange(p);
    assert.ok(q >= LOW && q <= HIGH, `pitch ${p} -> ${q}`);
    assert.equal(Math.abs(q - p) % 12, 0, `pitch ${p} changed name: ${q}`);
  }
});

test('pitches already in range pass through unchanged', () => {
  const d = dev();
  for (let p = LOW; p <= HIGH; p++) assert.equal(d.ctx.foldToBassRange(p), p);
});

test('a note-on is folded and its note-off releases the folded pitch', () => {
  const d = dev();
  d.note(72, 100);
  assert.deepEqual(d.take(), [[60, 100]]);
  d.note(72, 0);
  assert.deepEqual(d.take(), [[60, 0]]);
});

test('the same input pitch twice releases twice, oldest first', () => {
  const d = dev();
  d.note(72, 90); d.note(72, 80);
  assert.deepEqual(d.take(), [[60, 90], [60, 80]]);
  d.note(72, 0); d.note(72, 0);
  assert.deepEqual(d.take(), [[60, 0], [60, 0]]);
  d.note(72, 0);
  assert.deepEqual(d.take(), [], 'a note-off with nothing held sends nothing');
});

test('a short list is ignored', () => {
  const d = dev();
  d.ctx.list(60);
  assert.deepEqual(d.take(), []);
});

test('low and high move the window and keep it at least an octave wide', () => {
  const d = dev();
  d.send('low', 48); d.send('high', 72);
  assert.equal(d.ctx.foldToBassRange(36), 48);
  assert.equal(d.ctx.foldToBassRange(84), 72);
  d.send('high', 50);                       // narrower than an octave: low follows
  assert.equal(d.ctx.BASS_LOW, 39);
  d.send('low', 60);                        // above high: high follows
  assert.equal(d.ctx.BASS_HIGH, 71);
  for (let p = 0; p < 128; p++) { const q = d.ctx.foldToBassRange(p); assert.ok(q >= 60 && q <= 71 && Math.abs(q - p) % 12 === 0, `${p} -> ${q}`); }
});

test('reset and CC 120/123 release what is held', () => {
  const d = dev();
  d.note(72, 100); d.note(74, 100); d.take();
  d.send('cc', 120, 0);
  assert.deepEqual(d.take().sort(), [[60, 0], [50, 0]].sort());
  d.note(72, 0);
  assert.deepEqual(d.take(), []);
  d.note(72, 100); d.take();
  d.send('reset');
  assert.deepEqual(d.take(), [[60, 0]]);
});
