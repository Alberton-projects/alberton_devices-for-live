/*
    Alberton Drum Mapper
    ====================
    Maps any MIDI note onto one drum's sounds, following the General MIDI drum map, in
    one of four modes chosen by the Mode menu: KICK, SNARE, HIHAT, CYMBALS. A note that
    names one of the mode's own sounds passes through unchanged -- so nothing is ever sent
    to a pad the mode does not target, and a kit needs only those pads. Anything else is
    mapped: by pitch for the kick and the snare, by velocity for the hi-hat and the
    cymbals, because on the drums *how hard* should choose the sound. In SNARE mode the
    six General MIDI toms also pass through, by exact note only.

    Deterministic by design: the same input gives the same drum, so a clip sounds the
    same every night. The one exception is the hi-hat below the open-hat velocity, where
    closed or pedal is chosen at random, like a foot that does not fall the same way
    twice. The Humanize toggle turns that off for a reproducible render.

    Notes are the only thing this script touches. Everything else -- control changes,
    pitch bend, aftertouch, program changes -- passes through the patcher untouched.
    CC 120 (all sound off) and CC 123 (all notes off) also release every note this
    device has mapped, and "reset" does the same by hand.
*/

autowatch = 1;
inlets = 1;
outlets = 1;

// Modes: 0 KICK, 1 SNARE, 2 HIHAT, 3 CYMBALS (the menu sends an int)
var mode = 0;
var humanizeOn = 1;   // not named like the function below: in js a var would shadow it

// General MIDI drum map. A mode's own sounds pass through unchanged; the rest is mapped
// onto them, so a kit needs pads only at these notes.
var KICK_NOTES = [35, 36];                     // acoustic bass drum, bass drum 1
var SNARE_NOTES_COMMON = [38, 40];             // acoustic snare, electric snare: three times as likely
var SNARE_NOTES_RARE = [37, 39];               // side stick, hand clap
var TOM_NOTES = [41, 43, 45, 47, 48, 50];      // pass through in SNARE mode, by exact note only
var HIHAT_CLOSED = 42;   // F#1
var HIHAT_PEDAL = 44;    // G#1
var HIHAT_OPEN = 46;     // A#1
var CYMBAL_RIDE = 51;    // D#2, ride cymbal 1
var CYMBAL_BELL = 53;    // F2, ride bell
var CYMBAL_CRASH = [49, 57];   // C#2 crash 1, A2 crash 2

var KICK_RANGE   = KICK_NOTES;
var SNARE_RANGE  = SNARE_NOTES_COMMON.concat(SNARE_NOTES_RARE, TOM_NOTES);
var HIHAT_RANGE  = [HIHAT_CLOSED, HIHAT_PEDAL, HIHAT_OPEN];
var CYMBAL_RANGE = [CYMBAL_CRASH[0], CYMBAL_RIDE, CYMBAL_BELL, CYMBAL_CRASH[1]];

// Velocity bands
var HIHAT_OPEN_FROM = 86;    // open hat at this velocity and above
var CYMBAL_RIDE_TO = 79;     // ride up to here
var CYMBAL_BELL_TO = 105;    // bell up to here, crash above

// Built once, not per note: the weighted snare pool and the pass-through lookups.
var SNARE_POOL = [];
for (var c = 0; c < SNARE_NOTES_COMMON.length; c++) {
    SNARE_POOL.push(SNARE_NOTES_COMMON[c], SNARE_NOTES_COMMON[c], SNARE_NOTES_COMMON[c]);
}
for (var r = 0; r < SNARE_NOTES_RARE.length; r++) {
    SNARE_POOL.push(SNARE_NOTES_RARE[r]);
}

function lookup(range) {
    var set = {};
    for (var i = 0; i < range.length; i++) set[range[i]] = true;
    return set;
}
var IN_KICK = lookup(KICK_RANGE);
var IN_SNARE = lookup(SNARE_RANGE);
var IN_HIHAT = lookup(HIHAT_RANGE);
var IN_CYMBAL = lookup(CYMBAL_RANGE);

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

// The Mode menu, connected straight to the script
function msg_int(v) {
    if (v >= 0 && v <= 3) mode = v;
}

// humanize <0|1>, from the Humanize toggle
function humanize(v) {
    humanizeOn = v ? 1 : 0;
}

function list() {
    if (arguments.length < 2) return;

    var inputPitch = Math.floor(arguments[0]);
    var vel = Math.floor(arguments[1]);

    if (vel === 0) {
        var released = noteQueueRelease(inputPitch);
        if (released >= 0) outlet(0, [released, 0]);
        return;
    }

    var outputPitch;
    switch (mode) {
        case 0:  outputPitch = mapKick(inputPitch); break;
        case 1:  outputPitch = mapSnare(inputPitch); break;
        case 2:  outputPitch = mapHihat(inputPitch, vel); break;
        case 3:  outputPitch = mapCymbals(inputPitch, vel); break;
        default: outputPitch = inputPitch;
    }

    noteQueueRemember(inputPitch, outputPitch);
    outlet(0, [outputPitch, vel]);
}

function mapKick(inputPitch) {
    if (IN_KICK[inputPitch]) return inputPitch;
    return KICK_NOTES[inputPitch % KICK_NOTES.length];
}

// The pitch picks the sound, so a key always gives the same snare sound; toms pass only
// when the note is exactly theirs.
function mapSnare(inputPitch) {
    if (IN_SNARE[inputPitch]) return inputPitch;
    return SNARE_POOL[inputPitch % SNARE_POOL.length];
}

// Hard hits open the hat. Softer ones are closed or pedal: at random while Humanize is
// on, by pitch parity when it is off.
function mapHihat(inputPitch, velocity) {
    if (IN_HIHAT[inputPitch]) return inputPitch;
    if (velocity >= HIHAT_OPEN_FROM) return HIHAT_OPEN;
    if (humanizeOn) return Math.random() < 0.5 ? HIHAT_CLOSED : HIHAT_PEDAL;
    return (inputPitch % 2 === 0) ? HIHAT_CLOSED : HIHAT_PEDAL;
}

// Soft is ride, medium is bell, hard is a crash; which crash follows the pitch.
function mapCymbals(inputPitch, velocity) {
    if (IN_CYMBAL[inputPitch]) return inputPitch;
    if (velocity <= CYMBAL_RIDE_TO) return CYMBAL_RIDE;
    if (velocity <= CYMBAL_BELL_TO) return CYMBAL_BELL;
    return CYMBAL_CRASH[inputPitch % CYMBAL_CRASH.length];
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

// After a recompile (autowatch, while developing) every var above is back at its initial
// value, but the patcher's controls do not send theirs again. So read them: patcher
// objects answer getvalueof() with what they show. Harmless at a normal load, where the
// controls send their values anyway.
function syncFromPatcher() {
    try {
        var menu = patcher.getnamed("live.menu");     // the Mode menu
        if (menu) msg_int(Math.round(menu.getvalueof()));
        var toggle = patcher.getnamed("humanize");
        if (toggle) humanize(Math.round(toggle.getvalueof()));
    } catch (e) {
        post("Drum Mapper: could not read the patcher's controls: " + e + "\n");
    }
}
var syncTask = new Task(syncFromPatcher, this);
syncTask.schedule(0);

function bang() {
    var modeNames = ["KICK", "SNARE", "HIHAT", "CYMBALS"];
    post("Drum Mapper: mode " + modeNames[mode] + ", humanize " + (humanizeOn ? "on" : "off") + "\n");
}
