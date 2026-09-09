/*
    Alberton Transpose Q -- transposition quantised to the bar
    ==========================================================
    A pending transposition, set by the Pending dial, is applied on the next downbeat, so
    the whole rig moves together on the bar line. The downbeat comes from plugsync~ in the
    patcher as a bang on inlet 1; the applied value leaves outlet 0 for the display dial.

    Targets: on every track whose name says it is melodic, the first device named [PITCH]
    (or of class MidiPitcher), its parameter named Pitch. They are found once and kept as
    paths, because applyTranspose runs ON THE DOWNBEAT and must not walk the set: scanning
    29 tracks and every device on each built dozens of LiveAPI objects at the exact instant
    the bar turned over. The cache clears itself when the set's track list changes (a
    LiveAPI observer on live_set tracks), when the track count differs, or on "rescan".

    2026-09-09, Phase 1 of the repository plan, same behaviour: every Live API access is
    guarded; post() is silent unless "debug 1" is sent. V5 replaces the track-name test with
    a tag on the Pitch device itself (docs/PLAN.md).
*/

autowatch = 1;
inlets = 2;    // inlet 0: pending / current / rescan / debug; inlet 1: bang on the downbeat
outlets = 1;   // the transposition just applied, for the display dial

// ============ LOGGING ============

var DEBUG = 0;

function log(s) {
    if (DEBUG) post(s + "\n");
}

function warn(s) {
    post("Transpose Q: " + s + "\n");
}

function debug(v) {
    DEBUG = v ? 1 : 0;
    warn("debug " + (DEBUG ? "on" : "off"));
}

// Run fn; a Live API error inside it is reported, never fatal to the object.
function guarded(what, fn) {
    try {
        return fn();
    } catch (e) {
        warn(what + " failed: " + e);
        return undefined;
    }
}

// ============ STATE ============

var pendingTranspose = 0;
var currentTranspose = 0;

// Tracks that carry a [PITCH] device, by name. "midi rec" is excluded because the
// transposer itself sits there. (V5 drops this list for a tag on the device.)
var melodicTracks = ["bass", "pad", "piano", "lead", "vocoder"];

// ============ MESSAGES ============

function msg_int(val) {
    if (inlet === 0) setPending(val);
    else downbeat();
}

function bang() {
    if (inlet === 1) downbeat();
}

// pending <n>: the value to apply on the next downbeat
function pending(val) {
    setPending(parseInt(val, 10));
}

// current <n>: apply at once, no waiting for the bar
function current(val) {
    pendingTranspose = parseInt(val, 10);
    apply();
}

// rescan: forget the cached targets; send it after moving [PITCH] devices about
function rescan() {
    pitchTargets = null;
    log("cache cleared");
}

function setPending(val) {
    pendingTranspose = val;
    log("pending " + pendingTranspose);
}

function downbeat() {
    if (pendingTranspose === currentTranspose) return;
    apply();
}

function apply() {
    applyTranspose(pendingTranspose);
    currentTranspose = pendingTranspose;
    outlet(0, currentTranspose);
    log("applied " + currentTranspose);
}

// After a recompile (autowatch, while developing) every var above is back at its initial
// value, but the patcher's controls do not send theirs again. So read them: patcher
// objects answer getvalueof() with what they show. Harmless at a normal load, where the
// controls send their values anyway.
function syncFromPatcher() {
    try {
        var pend = patcher.getnamed("live.dial");         // Pending
        var cur = patcher.getnamed("live.dial[1]");       // Current
        if (pend) pendingTranspose = Math.round(pend.getvalueof());
        if (cur) currentTranspose = Math.round(cur.getvalueof());
    } catch (e) {
        warn("could not read the patcher's controls: " + e);
    }
}
var syncTask = new Task(syncFromPatcher, this);
syncTask.schedule(0);

// ============ TARGETS ============

var pitchTargets = null;       // Live API paths of every Pitch parameter to write
var cachedTrackCount = -1;
var trackObserver = null;      // clears the cache when tracks are added, removed or moved

function watchTracks() {
    if (trackObserver) return;
    guarded("track observer", function () {
        trackObserver = new LiveAPI(onTracksChanged, "live_set");
        trackObserver.property = "tracks";
    });
}

function onTracksChanged() {
    if (pitchTargets !== null) {
        pitchTargets = null;
        log("tracks changed: cache cleared");
    }
}

function isMelodic(trackName) {
    var name = trackName.toLowerCase();
    if (name.indexOf("midi rec") >= 0) return false;
    for (var m = 0; m < melodicTracks.length; m++) {
        if (name.indexOf(melodicTracks[m]) >= 0) return true;
    }
    return false;
}

function buildTargets() {
    pitchTargets = [];
    var api = new LiveAPI("live_set");
    cachedTrackCount = api.getcount("tracks");
    for (var t = 0; t < cachedTrackCount; t++) {
        scanTrack(t);
    }
    log("cached " + pitchTargets.length + " [PITCH] targets");
}

// One track; an error here skips the track and the scan goes on. Group tracks match by
// name too ("6 BASS", "9 PADS") but carry no [PITCH] device, so they never get in.
function scanTrack(t) {
    guarded("scan of track " + t, function () {
        var trackPath = "live_set tracks " + t;
        var track = new LiveAPI(trackPath);
        if (!isMelodic(track.get("name").toString())) return;

        var deviceCount = track.getcount("devices");
        for (var d = 0; d < deviceCount; d++) {
            var devicePath = trackPath + " devices " + d;
            var device = new LiveAPI(devicePath);
            var isPitch = device.get("name").toString().indexOf("[PITCH]") >= 0
                       || device.get("class_name").toString() === "MidiPitcher";
            if (!isPitch) continue;

            var paramCount = device.getcount("parameters");
            for (var p = 0; p < paramCount; p++) {
                var paramPath = devicePath + " parameters " + p;
                if (new LiveAPI(paramPath).get("name").toString() === "Pitch") {
                    pitchTargets.push(paramPath);
                    break;
                }
            }
            break;   // one [PITCH] device per track
        }
    });
}

function ensureTargets() {
    // The observer first: setting its property fires the callback at once with the current
    // value, and that first call must find nothing to clear.
    watchTracks();
    if (pitchTargets === null || new LiveAPI("live_set").getcount("tracks") !== cachedTrackCount) {
        buildTargets();
    }
}

function applyTranspose(value) {
    guarded("transpose " + value, function () {
        ensureTargets();
        var written = 0;
        for (var i = 0; i < pitchTargets.length; i++) {
            var api = new LiveAPI(pitchTargets[i]);
            if (api.id) {
                api.set("value", value);
                written++;
            } else {
                warn("a [PITCH] target is gone (" + pitchTargets[i] + "); send rescan");
            }
        }
        log("transpose " + value + " -> " + written + " of " + pitchTargets.length + " targets");
    });
}
