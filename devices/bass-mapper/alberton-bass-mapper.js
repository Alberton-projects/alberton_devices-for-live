/*
    Alberton Bass Mapper
    ====================
    Folds any MIDI note into the bass register, C1 to C3 (36 to 60) by default, so any
    controller, clip or sequencer output lands somewhere a bass can play. The window is
    set by the Low and High dials; whatever the window, folding is by octaves, so a note
    keeps its name.

    Notes are the only thing this script touches. Everything else -- control changes,
    pitch bend, aftertouch, program changes -- passes through the patcher untouched.
    CC 120 (all sound off) and CC 123 (all notes off) also release every note this
    device has mapped, and "reset" does the same by hand.
*/

autowatch = 1;
inlets = 1;
outlets = 1;

var BASS_LOW = 36;    // C1
var BASS_HIGH = 60;   // C3

// low <n> / high <n>: the window. It stays at least an octave wide, so an octave fold
// always lands inside it; move one bound past the other and the other follows.
function low(v) {
    BASS_LOW = Math.floor(v);
    if (BASS_HIGH < BASS_LOW + 11) BASS_HIGH = BASS_LOW + 11;
}

function high(v) {
    BASS_HIGH = Math.floor(v);
    if (BASS_LOW > BASS_HIGH - 11) BASS_LOW = BASS_HIGH - 11;
}

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

function list() {
    if (arguments.length < 2) return;

    var inputPitch = Math.floor(arguments[0]);
    var vel = Math.floor(arguments[1]);

    if (vel === 0) {
        var released = noteQueueRelease(inputPitch);
        if (released >= 0) outlet(0, [released, 0]);
        return;
    }

    var outputPitch = foldToBassRange(inputPitch);
    noteQueueRemember(inputPitch, outputPitch);
    outlet(0, [outputPitch, vel]);
}

function foldToBassRange(pitch) {
    // Fold by octaves, so the note keeps its name. Folding modulo the window's width
    // was wrong: 25 is not a multiple of 12, so C4 came back as B1 instead of C3.
    while (pitch > BASS_HIGH) pitch -= 12;
    while (pitch < BASS_LOW)  pitch += 12;
    return pitch;
}

// cc <number> <value>, from the patcher: all sound off and all notes off release
// everything this device is holding, so nothing stays hanging in the instrument.
function cc(number, value) {
    if (number === 120 || number === 123) releaseAll();
}

function reset() {
    releaseAll();
}

function releaseAll() {
    var held = noteQueueFlush();
    for (var i = 0; i < held.length; i++) outlet(0, [held[i], 0]);
}

function bang() {
    post("Bass Mapper: " + BASS_LOW + "-" + BASS_HIGH + "\n");
}
