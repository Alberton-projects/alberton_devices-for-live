/*
    Alberton Bass Mapper
    ====================
    Folds any MIDI note into bass range: C1-C3 (notes 36-60)
    This gives 2 full octaves + 1 note starting on C for bass lines.
    
    Install: Place in same folder as the .amxd device
    Usage: Insert on Bass Electric and Bass Synth tracks
*/

autowatch = 1;
inlets = 1;
outlets = 1;

// Bass range: C1 (36) to C3 (60) = 25 notes (2 octaves + 1)
var BASS_LOW = 36;   // C1
var BASS_HIGH = 60;  // C3
var BASS_RANGE = BASS_HIGH - BASS_LOW + 1;  // 25 semitones

// Active notes: input pitch -> queue of output pitches.
// A queue, not a single value: the same input pitch can be sounding twice at
// once (two sources into one track, or a sequencer retriggering a held note),
// and a plain map lost the first mapping and hung that note.
var activeNotes = {};

function list() {
    if (arguments.length < 2) return;
    
    var inputPitch = Math.floor(arguments[0]);
    var vel = Math.floor(arguments[1]);
    
    // Note OFF - use stored mapped pitch
    if (vel === 0) {
        var queue = activeNotes[inputPitch];
        if (queue !== undefined && queue.length > 0) {
            var released = queue.shift();
            if (queue.length === 0) delete activeNotes[inputPitch];
            outlet(0, [released, 0]);
        }
        return;
    }
    
    // Note ON - fold to bass range
    var outputPitch = foldToBassRange(inputPitch);
    
    // Remember the mapping so note-off releases the note we actually played
    if (activeNotes[inputPitch] === undefined) activeNotes[inputPitch] = [];
    activeNotes[inputPitch].push(outputPitch);
    
    outlet(0, [outputPitch, vel]);
}

function foldToBassRange(pitch) {
    // Already in range
    if (pitch >= BASS_LOW && pitch <= BASS_HIGH) {
        return pitch;
    }
    
    // Fold by OCTAVES, so the note keeps its name.
    // Folding modulo BASS_RANGE (25 semitones) was wrong: 25 is not a multiple
    // of 12, so C4 came back as B1 instead of C3. The window is wider than an
    // octave, so this always lands inside it.
    while (pitch > BASS_HIGH) pitch -= 12;
    while (pitch < BASS_LOW)  pitch += 12;
    
    return pitch;
}

function bang() {
    post("Bass Mapper: C1-C3 (notes 36-60)\n");
}
