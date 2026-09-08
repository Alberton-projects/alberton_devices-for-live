// alberton-transpose-v2.js
// Versió 2.0 - Detecció de downbeat via plugsync~
// Rep bang al inlet 1 quan es detecta el downbeat

autowatch = 1;
inlets = 2;  // inlet 0: messages (pending/current), inlet 1: bang from downbeat detector
outlets = 1;

var pendingTranspose = 0;
var currentTranspose = 0;

// Pistes melòdiques a afectar
var melodicTracks = ['bass', 'pad', 'piano', 'lead', 'vocoder'];

function msg_int(val) {
    // Integer al inlet 0 = pending value
    if (inlet == 0) {
        pendingTranspose = val;
        post("Pending transpose: " + pendingTranspose + "\n");
    } else if (inlet == 1) {
        // Bang equivalent des de inlet 1
        checkAndApply();
    }
}

function pending(val) {
    pendingTranspose = parseInt(val);
    post("Pending transpose: " + pendingTranspose + "\n");
}

function bang() {
    if (inlet == 1) {
        // Bang des del detector de downbeat
        checkAndApply();
    }
}

function checkAndApply() {
    if (pendingTranspose === currentTranspose) {
        return;
    }
    
    applyTranspose(pendingTranspose);
    currentTranspose = pendingTranspose;
    outlet(0, currentTranspose);
    post("Transpose applied at downbeat: " + currentTranspose + "\n");
}

function current(val) {
    // Override manual - aplicar immediatament
    pendingTranspose = parseInt(val);
    applyTranspose(pendingTranspose);
    currentTranspose = pendingTranspose;
    outlet(0, currentTranspose);
}

// Cache of the [PITCH] parameter on every melodic track.
// applyTranspose runs ON THE DOWNBEAT, so it must not walk the whole set:
// scanning 29 tracks and every device and parameter on each built dozens of
// LiveAPI objects at the exact instant the bar turned over. The layout only
// changes when the set does, so find it once and keep the paths.
var pitchTargets = null;
var cachedTrackCount = -1;

// Force a rescan -- send "rescan" to the object after adding or moving devices.
function rescan() {
    pitchTargets = null;
    post("Transpose: cache cleared\n");
}

function buildTargets() {
    pitchTargets = [];
    var api = new LiveAPI("live_set");
    cachedTrackCount = api.getcount("tracks");

    for (var t = 0; t < cachedTrackCount; t++) {
        var track = new LiveAPI("live_set tracks " + t);
        var trackName = track.get("name").toString().toLowerCase();

        var isMelodic = false;
        for (var m = 0; m < melodicTracks.length; m++) {
            if (trackName.indexOf(melodicTracks[m]) >= 0) {
                isMelodic = true;
                break;
            }
        }
        if (trackName.indexOf("midi rec") >= 0) {
            isMelodic = false;
        }
        if (!isMelodic) continue;

        // Group tracks match by name too ("6 BASS", "9 PADS"), but they carry no
        // [PITCH] device, so they simply never make it into the cache.
        var deviceCount = track.getcount("devices");
        for (var d = 0; d < deviceCount; d++) {
            var device = new LiveAPI("live_set tracks " + t + " devices " + d);
            var deviceName = device.get("name").toString();

            if (deviceName.indexOf("[PITCH]") >= 0 || device.get("class_name") == "MidiPitcher") {
                var paramCount = device.getcount("parameters");
                for (var p = 0; p < paramCount; p++) {
                    var path = "live_set tracks " + t + " devices " + d + " parameters " + p;
                    if (new LiveAPI(path).get("name").toString() == "Pitch") {
                        pitchTargets.push(path);
                        break;
                    }
                }
                break;
            }
        }
    }
    post("Transpose: cached " + pitchTargets.length + " [PITCH] targets\n");
}

function applyTranspose(value) {
    if (pitchTargets === null ||
        new LiveAPI("live_set").getcount("tracks") !== cachedTrackCount) {
        buildTargets();
    }

    for (var i = 0; i < pitchTargets.length; i++) {
        new LiveAPI(pitchTargets[i]).set("value", value);
    }

    post("Applied transpose " + value + " to " + pitchTargets.length + " tracks\n");
}
