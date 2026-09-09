/*
    Alberton Transpose Q -- transposition quantised to the bar
    ==========================================================
    A pending transposition, set by the Pending dial, is applied on the next bar line, or
    on the next beat, or at once, as the Quantize menu says; so the whole rig moves
    together, in time. The beat count comes from plugsync~ in the patcher as an int on
    inlet 1; the applied value leaves outlet 0 for the Current dial.

    Targets: every device in the set whose name carries the tag [PITCH], on any track but
    this device's own; its parameter named Pitch is written. Rename any Pitch device to
    [PITCH] to opt its track in. Nothing else about the set is assumed.

    The targets are found once and kept as paths, because the write runs ON THE BAR LINE
    and must not walk the set then: scanning every track and device at that instant built
    dozens of LiveAPI objects at the worst possible moment. The cache clears itself when the
    set's track list changes (a LiveAPI observer on live_set tracks), when the track count
    differs, or on "rescan".

    Every Live API access is guarded; post() is silent unless "debug 1" is sent.
*/

autowatch = 1;
inlets = 2;    // inlet 0: pending / current / quantize / rescan / debug; inlet 1: the beat count
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

var TAG = "[PITCH]";   // the opt-in: a device carrying this in its name is a target

// Quantize menu: 0 on the bar line, 1 on the beat, 2 at once
var QUANTIZE_BAR = 0, QUANTIZE_BEAT = 1, QUANTIZE_OFF = 2;
var quantizeMode = QUANTIZE_BAR;

// ============ MESSAGES ============

function msg_int(val) {
    if (inlet === 0) setPending(val);
    else beat(val);
}

// bang on inlet 1: apply now if something is pending (a manual downbeat)
function bang() {
    if (inlet === 1) downbeat();
}

// quantize <0|1|2>, from the Quantize menu
function quantize(v) {
    quantizeMode = v;
    if (quantizeMode === QUANTIZE_OFF) downbeat();   // whatever was waiting goes out now
}

// The beat count within the bar, 1-based, whenever it changes
function beat(n) {
    if (quantizeMode === QUANTIZE_BEAT || (quantizeMode === QUANTIZE_BAR && n === 1)) downbeat();
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
    if (quantizeMode === QUANTIZE_OFF) downbeat();
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
        var q = patcher.getnamed("quantize");
        if (pend) pendingTranspose = Math.round(pend.getvalueof());
        if (cur) currentTranspose = Math.round(cur.getvalueof());
        if (q) quantizeMode = Math.round(q.getvalueof());
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

function buildTargets() {
    pitchTargets = [];
    var api = new LiveAPI("live_set");
    cachedTrackCount = api.getcount("tracks");
    var ownTrackId = guarded("own track", function () { return new LiveAPI("this_device canonical_parent").id; });
    for (var t = 0; t < cachedTrackCount; t++) {
        scanTrack(t, ownTrackId);
    }
    log("cached " + pitchTargets.length + " " + TAG + " targets");
}

// One track; an error here skips the track and the scan goes on.
function scanTrack(t, ownTrackId) {
    guarded("scan of track " + t, function () {
        var trackPath = "live_set tracks " + t;
        var track = new LiveAPI(trackPath);
        if (ownTrackId && track.id === ownTrackId) return;   // never this device's own track

        var deviceCount = track.getcount("devices");
        for (var d = 0; d < deviceCount; d++) {
            var devicePath = trackPath + " devices " + d;
            var device = new LiveAPI(devicePath);
            if (device.get("name").toString().indexOf(TAG) < 0) continue;

            var paramCount = device.getcount("parameters");
            var found = false;
            for (var p = 0; p < paramCount; p++) {
                var paramPath = devicePath + " parameters " + p;
                if (new LiveAPI(paramPath).get("name").toString() === "Pitch") {
                    pitchTargets.push(paramPath);
                    found = true;
                    break;
                }
            }
            if (!found) warn("'" + device.get("name") + "' on track " + t + " carries " + TAG + " but has no Pitch parameter");
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
