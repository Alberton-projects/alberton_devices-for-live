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

// Store active notes for proper note-off
var activeNotes = {};

function list() {
    if (arguments.length < 2) return;
    
    var inputPitch = Math.floor(arguments[0]);
    var vel = Math.floor(arguments[1]);
    
    // Note OFF - use stored mapped pitch
    if (vel === 0) {
        if (activeNotes[inputPitch] !== undefined) {
            var outputPitch = activeNotes[inputPitch];
            delete activeNotes[inputPitch];
            outlet(0, [outputPitch, 0]);
        }
        return;
    }
    
    // Note ON - fold to bass range
    var outputPitch = foldToBassRange(inputPitch);
    
    // Store mapping for note-off
    activeNotes[inputPitch] = outputPitch;
    
    outlet(0, [outputPitch, vel]);
}

function foldToBassRange(pitch) {
    // Already in range
    if (pitch >= BASS_LOW && pitch <= BASS_HIGH) {
        return pitch;
    }
    
    // Fold into range using modulo
    var offset = (pitch - BASS_LOW) % BASS_RANGE;
    if (offset < 0) {
        offset += BASS_RANGE;
    }
    
    return BASS_LOW + offset;
}

function bang() {
    post("Bass Mapper: C1-C3 (notes 36-60)\n");
}
