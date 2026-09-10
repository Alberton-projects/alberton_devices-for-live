'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./max-stub');

// The Beat Window is a jsui: it owns no timing, it draws what the patcher sends. These tests
// drive its three messages and read its state and the mgraphics calls it records.
const boot = (opts = {}) => load('beat-window', 'beat-window.js', opts);

test('a new beat starts a full pulse; the same beat repeated does not', () => {
  const d = boot();
  d.send('beat', 5, 3);
  assert.equal(d.ctx.curBar, 5);
  assert.equal(d.ctx.curBeat, 3);
  assert.equal(d.ctx.flashLevel, 1, 'the beat pulses to full');
  d.ctx.flashLevel = 0.4;                 // pretend it faded a little
  d.send('beat', 5, 3);                   // the same beat, polled again
  assert.equal(d.ctx.flashLevel, 0.4, 'no new pulse on the same beat');
  d.send('beat', 5, 4);                   // the next beat
  assert.equal(d.ctx.flashLevel, 1, 'a new beat pulses again');
});

test('the pulse fades to zero over blink ms and then stops the task', () => {
  const d = boot();
  d.send('blink', 100);
  d.send('beat', 1, 1);
  assert.equal(d.ctx.flashLevel, 1);
  // the fade task runs on a ~33 ms interval; advance the clock and let it run.
  d.Task.advance(40);
  assert.ok(d.ctx.flashLevel > 0 && d.ctx.flashLevel < 1, 'partway down');
  d.Task.advance(300);
  assert.equal(d.ctx.flashLevel, 0, 'fully faded');
  assert.equal([...d.Task.pending].length, 0, 'the fade task cancels itself');
});

test('Flash off means no pulse, and clears one in progress', () => {
  const d = boot();
  d.send('beat', 1, 1);
  assert.equal(d.ctx.flashLevel, 1);
  d.send('flash', 0);
  assert.equal(d.ctx.flashLevel, 0, 'turning Flash off clears the pulse');
  d.send('beat', 1, 2);
  assert.equal(d.ctx.flashLevel, 0, 'no pulse while Flash is off');
});

test('the labels: beat large, bar.beat beneath, 1-based, 0 before the first message', () => {
  const d = boot();
  assert.equal(d.ctx.bigLabel(0), '0');
  assert.equal(d.ctx.bigLabel(3), '3');
  assert.equal(d.ctx.formatPos(12, 4), '12.4');
  assert.equal(d.ctx.formatPos(0, 0), '0.0');
});

test('paint reads the box size and writes both labels', () => {
  const d = boot({ boxRect: [0, 0, 300, 200] });
  d.send('beat', 7, 2);
  d.draws.length = 0;
  d.paint();
  const texts = d.draws.filter(c => c[0] === 'text').map(c => c[1]);
  assert.deepEqual(texts, ['2', '7.2'], 'the big beat then the bar.beat');
  assert.ok(d.draws.some(c => c[0] === 'ellipse'), 'the disc is drawn');
});

test('paint draws the ring only while the pulse is alive', () => {
  const d = boot();
  d.send('flash', 0);
  d.send('beat', 1, 1);
  d.draws.length = 0;
  d.paint();
  assert.equal(d.draws.filter(c => c[0] === 'stroke').length, 0, 'no ring with Flash off');
  d.send('flash', 1);
  d.send('beat', 1, 2);
  d.draws.length = 0;
  d.paint();
  assert.equal(d.draws.filter(c => c[0] === 'stroke').length, 1, 'the ring strokes on a pulse');
});
