// alberton-drum-mapper.js
// Mapea cualquier nota MIDI a drums según el modo seleccionado
// v1.1 - Si la nota ya está en el rango válido, la deja pasar sin modificar

autowatch = 1;
inlets = 1;
outlets = 1;

// Modos: 0=KICK, 1=SNARE, 2=HIHAT, 3=CYMBALS
var mode = 0;

// Rangos válidos por instrumento (notas que pasan sin modificar)
var KICK_RANGE = [35, 36];  // B0, C1
var SNARE_RANGE = [37, 38, 39, 40, 41, 43, 45, 47, 48, 50, 52];  // C#1 a E3 (articulaciones snare)
var HIHAT_RANGE = [42, 44, 46];  // F#1, G#1, A#1
var CYMBAL_RANGE = [49, 51, 53, 55, 57, 59];  // Crashes, rides, bells

// Notas destino para mapeo
var KICK_NOTES = [35, 36];
var SNARE_NOTES_COMMON = [38, 39, 40, 41]; // Triple probabilidad
var SNARE_NOTES_RARE = [37, 43, 45, 47, 48, 50, 52];
var HIHAT_CLOSED = 42;  // F#1
var HIHAT_PEDAL = 44;   // G#1
var HIHAT_OPEN = 46;    // A#1
var CYMBAL_RIDE = 51;   // D#2
var CYMBAL_BELL = 53;   // F2
var CYMBAL_CRASH = [49, 57];  // C#2, A2

// Almacenar mapeo de notas activas (para note-off)
var activeNotes = {};

// Helper: comprobar si nota está en array
function isInRange(note, rangeArray) {
    for (var i = 0; i < rangeArray.length; i++) {
        if (rangeArray[i] === note) return true;
    }
    return false;
}

// Captura modo desde live.menu (conectar directo, sin message box)
function msg_int(v) {
    if (v >= 0 && v <= 3) {
        mode = v;
    }
}

function list() {
    if (arguments.length < 2) return;
    
    var inputPitch = Math.floor(arguments[0]);
    var vel = Math.floor(arguments[1]);
    
    var outputPitch;
    
    // Note OFF - usar nota almacenada
    if (vel === 0) {
        if (activeNotes[inputPitch] !== undefined) {
            outputPitch = activeNotes[inputPitch];
            delete activeNotes[inputPitch];
            outlet(0, [outputPitch, 0]);
        }
        return;
    }
    
    // Note ON - calcular nota destino
    switch (mode) {
        case 0: // KICK
            outputPitch = mapKick(inputPitch);
            break;
        case 1: // SNARE
            outputPitch = mapSnare(inputPitch);
            break;
        case 2: // HIHAT
            outputPitch = mapHihat(inputPitch, vel);
            break;
        case 3: // CYMBALS
            outputPitch = mapCymbals(inputPitch, vel);
            break;
        default:
            outputPitch = inputPitch;
    }
    
    // Almacenar mapeo para note-off
    activeNotes[inputPitch] = outputPitch;
    
    outlet(0, [outputPitch, vel]);
}

function mapKick(inputPitch) {
    // Si ya está en rango válido, dejar pasar
    if (isInRange(inputPitch, KICK_RANGE)) {
        return inputPitch;
    }
    // Fold a rango 35-36 (B0-C1)
    var idx = inputPitch % KICK_NOTES.length;
    return KICK_NOTES[idx];
}

function mapSnare(inputPitch) {
    // Si ya está en rango válido, dejar pasar
    if (isInRange(inputPitch, SNARE_RANGE)) {
        return inputPitch;
    }
    
    // COMMON (38,39,40,41) tienen triple probabilidad
    // Pool: 38x3, 39x3, 40x3, 41x3, 37, 43, 45, 47, 48, 50, 52
    var pool = [];
    for (var i = 0; i < SNARE_NOTES_COMMON.length; i++) {
        pool.push(SNARE_NOTES_COMMON[i]);
        pool.push(SNARE_NOTES_COMMON[i]);
        pool.push(SNARE_NOTES_COMMON[i]); // Triple
    }
    for (var j = 0; j < SNARE_NOTES_RARE.length; j++) {
        pool.push(SNARE_NOTES_RARE[j]);
    }
    
    // Usar input pitch como seed para pseudo-random consistente
    var idx = inputPitch % pool.length;
    return pool[idx];
}

function mapHihat(inputPitch, velocity) {
    // Si ya está en rango válido, dejar pasar
    if (isInRange(inputPitch, HIHAT_RANGE)) {
        return inputPitch;
    }
    
    // Velocity 86-127: Open Hi-Hat
    if (velocity >= 86) {
        return HIHAT_OPEN;
    }
    // Velocity 1-85: Random entre Closed y Pedal
    var options = [HIHAT_CLOSED, HIHAT_PEDAL];
    var idx = Math.floor(Math.random() * options.length);
    return options[idx];
}

function mapCymbals(inputPitch, velocity) {
    // Si ya está en rango válido, dejar pasar
    if (isInRange(inputPitch, CYMBAL_RANGE)) {
        return inputPitch;
    }
    
    // Velocity 1-79: Ride
    if (velocity <= 79) {
        return CYMBAL_RIDE;
    }
    // Velocity 80-105: Bell
    if (velocity <= 105) {
        return CYMBAL_BELL;
    }
    // Velocity 106-127: Random crash
    var idx = Math.floor(Math.random() * CYMBAL_CRASH.length);
    return CYMBAL_CRASH[idx];
}

function bang() {
    var modeNames = ["KICK", "SNARE", "HIHAT", "CYMBALS"];
    post("Drum Mapper v1.1 mode: " + modeNames[mode] + "\n");
    post("  - Notes in valid range pass through unchanged\n");
    post("  - Notes outside range are mapped by velocity\n");
}
