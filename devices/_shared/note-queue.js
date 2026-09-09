// --- begin shared: note-queue.js ---
// Held notes: input pitch -> the output pitches sounding for it, oldest first.
// A queue, not a single value: the same input pitch can sound twice at once (two
// sources into one track, a sequencer retriggering a held note), and a plain map lost
// the first mapping and hung that note.
//
// This block is the same text in every mapper; tools/sync_shared.py keeps it so.
var heldNotes = {};

function noteQueueRemember(inputPitch, outputPitch) {
    if (heldNotes[inputPitch] === undefined) heldNotes[inputPitch] = [];
    heldNotes[inputPitch].push(outputPitch);
}

// The output pitch to release for a note-off, or -1 when nothing is held for it.
function noteQueueRelease(inputPitch) {
    var queue = heldNotes[inputPitch];
    if (queue === undefined || queue.length === 0) return -1;
    var released = queue.shift();
    if (queue.length === 0) delete heldNotes[inputPitch];
    return released;
}

// Every output pitch still held, oldest first, and forget them all: what a reset or an
// all-notes-off must release so nothing stays hanging in the instrument.
function noteQueueFlush() {
    var out = [];
    for (var k in heldNotes) {
        var queue = heldNotes[k];
        for (var i = 0; i < queue.length; i++) out.push(queue[i]);
    }
    heldNotes = {};
    return out;
}
// --- end shared: note-queue.js ---
