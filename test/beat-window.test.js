'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./max-stub');

// The Beat Window is a jsui: it owns no timing but its pulse, it draws what the patcher
// sends. These tests drive its three messages and read its state and the recorded drawing.
const boot = (opts = {}) => load('beat-window', 'beat-window.js', opts);
const rings = (d) => d.draws.filter(c => c[0] === 'stroke').length;

test('a new beat lights the ring; the same beat polled again does not restart it', () => {
  const d = boot();
  d.send('beat', 5, 3);
  assert.equal(d.ctx.curBar, 5);
  assert.equal(d.ctx.curBeat, 3);
  assert.equal(d.ctx.pulseOn, 1, 'the ring is on at the beat');
  assert.equal(d.ctx.mgraphics.redraws, 1, 'a changed position repaints');
  d.send('beat', 5, 3);                   // the same beat, polled 33 ms later
  assert.equal(d.ctx.mgraphics.redraws, 1, 'the same position does not repaint');
  d.send('beat', 5, 4);
  assert.equal(d.ctx.pulseOn, 1);
  assert.equal(d.ctx.mgraphics.redraws, 2);
});

test('the pulse goes out after blink ms once it has been painted', () => {
  const d = boot();
  d.send('blink', 100);
  d.send('beat', 1, 1);
  d.paint();                               // Live painted it
  d.Task.advance(90);
  assert.equal(d.ctx.pulseOn, 1, 'still on before blink ms');
  d.Task.advance(20);
  assert.equal(d.ctx.pulseOn, 0, 'off after blink ms');
  assert.equal([...d.Task.pending].length, 0, 'nothing left scheduled');
});

test('a pulse that was never painted stays on until it is, then goes out', () => {
  const d = boot();
  d.send('blink', 100);
  d.send('beat', 1, 1);
  d.Task.advance(400);                     // no paint happened for a long time
  assert.equal(d.ctx.pulseOn, 1, 'held on: nobody has seen it yet');
  d.paint();                               // the first paint after the beat shows the ring
  assert.equal(rings(d), 1);
  d.Task.advance(40);
  assert.equal(d.ctx.pulseOn, 0, 'out shortly after it was seen');
});

test('Flash off means no pulse, and puts out one in progress', () => {
  const d = boot();
  d.send('beat', 1, 1);
  assert.equal(d.ctx.pulseOn, 1);
  d.send('flash', 0);
  assert.equal(d.ctx.pulseOn, 0, 'turning Flash off puts the ring out');
  d.send('beat', 1, 2);
  assert.equal(d.ctx.pulseOn, 0, 'no pulse while Flash is off');
  d.draws.length = 0;
  d.paint();
  assert.equal(rings(d), 0, 'and paint draws no ring');
});

test('the labels: beat large, bar.beat beneath, 1-based, 0 before the first message', () => {
  const d = boot();
  assert.equal(d.ctx.bigLabel(0), '0');
  assert.equal(d.ctx.bigLabel(3), '3');
  assert.equal(d.ctx.formatPos(12, 4), '12.4');
  assert.equal(d.ctx.formatPos(0, 0), '0.0');
});

test('paint reads the box size and writes both labels over the disc', () => {
  const d = boot({ boxRect: [0, 0, 300, 200] });
  d.send('beat', 7, 2);
  d.draws.length = 0;
  d.paint();
  const texts = d.draws.filter(c => c[0] === 'text').map(c => c[1]);
  assert.deepEqual(texts, ['2', '7.2'], 'the big beat then the bar.beat');
  assert.equal(d.draws.filter(c => c[0] === 'ellipse').length, 2, 'the disc and the ring');
  const digit = d.draws.find(c => c[0] === 'size');
  assert.equal(digit[1], 100, 'the digit is half the height');
});
