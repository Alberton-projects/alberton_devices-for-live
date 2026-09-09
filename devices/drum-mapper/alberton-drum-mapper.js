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

// The target notes, General MIDI by default. Each one is a parameter on the device, so a
// kit laid out differently is a matter of turning a dial, not of editing this file. A
// mode's own sounds pass through unchanged; the rest is mapped onto them, so a kit needs
// pads only at these notes. The six GM toms pass through in SNARE mode by exact note.
var notes = {
    kick1: 35, kick2: 36,                      // acoustic bass drum, bass drum 1
    snare1: 38, snare2: 40,                    // acoustic snare, electric snare: three times as likely
    stick: 37, clap: 39,                       // side stick, hand clap
    hhclosed: 42, hhpedal: 44, hhopen: 46,     // F#1, G#1, A#1
    ride: 51, bell: 53,                        // ride cymbal 1, ride bell
    crash1: 49, crash2: 57                     // crash cymbal 1 and 2
};
var TOM_NOTES = [41, 43, 45, 47, 48, 50];

// Velocity bands, parameters too
var HIHAT_OPEN_FROM = 86;    // open hat at this velocity and above
var CYMBAL_RIDE_TO = 79;     // ride up to here
var CYMBAL_BELL_TO = 105;    // bell up to here, crash above

// Derived from the notes, rebuilt whenever one changes: the pass-through lookups, the
// weighted snare pool and the crash pair.
var KICK_NOTES, SNARE_POOL, CYMBAL_CRASH, IN_KICK, IN_SNARE, IN_HIHAT, IN_CYMBAL;

function lookup(range) {
    var set = {};
    for (var i = 0; i < range.length; i++) set[range[i]] = true;
    return set;
}

function rebuild() {
    KICK_NOTES = [notes.kick1, notes.kick2];
    SNARE_POOL = [notes.snare1, notes.snare1, notes.snare1, notes.snare2, notes.snare2, notes.snare2, notes.stick, notes.clap];
    CYMBAL_CRASH = [notes.crash1, notes.crash2];
    IN_KICK = lookup(KICK_NOTES);
    IN_SNARE = lookup([notes.snare1, notes.snare2, notes.stick, notes.clap].concat(TOM_NOTES));
    IN_HIHAT = lookup([notes.hhclosed, notes.hhpedal, notes.hhopen]);
    IN_CYMBAL = lookup([notes.crash1, notes.ride, notes.bell, notes.crash2]);
}
rebuild();

// One message per note parameter, named like the dial's scripting name
function setNote(key, v) {
    notes[key] = Math.round(v);
    rebuild();
}
function kick1(v)    { setNote("kick1", v); }
function kick2(v)    { setNote("kick2", v); }
function snare1(v)   { setNote("snare1", v); }
function snare2(v)   { setNote("snare2", v); }
function stick(v)    { setNote("stick", v); }
function clap(v)     { setNote("clap", v); }
function hhclosed(v) { setNote("hhclosed", v); }
function hhpedal(v)  { setNote("hhpedal", v); }
function hhopen(v)   { setNote("hhopen", v); }
function ride(v)     { setNote("ride", v); }
function bell(v)     { setNote("bell", v); }
function crash1(v)   { setNote("crash1", v); }
function crash2(v)   { setNote("crash2", v); }
function openfrom(v) { HIHAT_OPEN_FROM = Math.round(v); }
function rideto(v)   { CYMBAL_RIDE_TO = Math.round(v); }
function bellto(v)   { CYMBAL_BELL_TO = Math.round(v); }

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
    if (velocity >= HIHAT_OPEN_FROM) return notes.hhopen;
    if (humanizeOn) return Math.random() < 0.5 ? notes.hhclosed : notes.hhpedal;
    return (inputPitch % 2 === 0) ? notes.hhclosed : notes.hhpedal;
}

// Soft is ride, medium is bell, hard is a crash; which crash follows the pitch.
function mapCymbals(inputPitch, velocity) {
    if (IN_CYMBAL[inputPitch]) return inputPitch;
    if (velocity <= CYMBAL_RIDE_TO) return notes.ride;
    if (velocity <= CYMBAL_BELL_TO) return notes.bell;
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
        for (var key in notes) {
            var box = patcher.getnamed(key);
            if (box) notes[key] = Math.round(box.getvalueof());
        }
        var of = patcher.getnamed("openfrom"), rt = patcher.getnamed("rideto"), bt = patcher.getnamed("bellto");
        if (of) HIHAT_OPEN_FROM = Math.round(of.getvalueof());
        if (rt) CYMBAL_RIDE_TO = Math.round(rt.getvalueof());
        if (bt) CYMBAL_BELL_TO = Math.round(bt.getvalueof());
        rebuild();
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
