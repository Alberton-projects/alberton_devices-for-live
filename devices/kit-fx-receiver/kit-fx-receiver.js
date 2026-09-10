/*
    Alberton Kit FX Receiver
    ========================
    The audio-effect half of the Kit Selector V5: one per rack whose macros a kit should
    set. It sits on the track -- group, audio, return or MIDI -- and governs the nearest rack:
    the rack it lives inside when it sits in a chain, otherwise the first rack after it on the
    track, or failing that the last one before it. Placement is the binding; no names.

      fx <bank> <v1..v9>     nine macro values for its bank: written to macros 1-9 of the rack
      fxvol <bank> <0..1>    this track's volume, when Apply Volume is on
      capture                the panel asking every fx receiver for its rack's macros: it
                             answers "fxret <bank> <v1..v9>" on the reply channel
      who                    it answers "boundfx <bank> <track name>"

    Bus 1-4 is a global setting: the bus channel is ks<bus>, the reply channel ks<bus>_ret.
    A disabled macro (hidden, or mapped elsewhere) is skipped quietly. Audio passes through
    untouched.
*/

autowatch = 1;
inlets = 1;
outlets = 3;
// 0: the reply channel, a forward object -- "send ks<bus>_ret", then fxret / boundfx
// 1: the receive object -- "set ks<bus>"
// 2: Applied, how many macros the last fx message wrote, for the display

// ============ LOGGING ============

var DEBUG = 0;

function log(s) {
    if (DEBUG) post(s + "\n");
}

function warn(s) {
    post("Kit FX Receiver: " + s + "\n");
}

function debug(v) {
    DEBUG = v ? 1 : 0;
    warn("debug " + (DEBUG ? "on" : "off"));
}

function guarded(what, fn) {
    try {
        return fn();
    } catch (e) {
        warn(what + " failed: " + e);
        return undefined;
    }
}

// A LiveAPI object that resolved to something. Max answers the string "0" for a path
// that resolves to nothing (and the number 0 before the API is up), so the test is a loose
// comparison, never truthiness: "0" is true in JavaScript.
function exists(api) {
    return !!api && api.id != 0;
}

// ============ SETTINGS ============

var busNumber = 1;
var bankNumber = 1;
var applyVolume = 1;

function bus(v) {
    busNumber = Math.round(v);
    setChannels();
    announce();
}

function bank(v) {
    bankNumber = Math.round(v);
    announce();
}

function applyvol(v) {
    applyVolume = v ? 1 : 0;
}

function setChannels() {
    outlet(1, "set", "ks" + busNumber);            // a receive: "set" renames it
    outlet(0, "send", "ks" + busNumber + "_ret");  // a forward: "send" names its target
}

// ============ WHERE THIS DEVICE SITS ============

var trackPath = null;
var trackName = "";
var rackPath = null;

function init() {
    resolve();
    announce();
}

function refresh() {
    init();
}

function resolve() {
    trackPath = null; trackName = ""; rackPath = null;
    guarded("resolve", function () {
        var me = new LiveAPI("this_device");
        if (!exists(me)) return;
        var tokens = me.unquotedpath.split(" ");    // live_set tracks N devices D [chains C devices E ...]
        if (tokens.length < 3) return;
        trackPath = tokens.slice(0, 3).join(" ");
        var track = new LiveAPI(trackPath);
        trackName = exists(track) ? track.get("name").toString() : "";
        var chainAt = tokens.indexOf("chains");
        if (chainAt > 0) {
            rackPath = tokens.slice(0, chainAt).join(" ");       // the rack this chain belongs to
        } else {
            rackPath = nearestRack(trackPath, parseInt(tokens[4], 10));
        }
        log("on '" + trackName + "', rack " + (rackPath || "none"));
    });
}

// The first rack after position d on the track, else the last one before it.
function nearestRack(path, d) {
    var track = new LiveAPI(path);
    var n = track.getcount("devices");
    var before = null;
    for (var i = 0; i < n; i++) {
        var device = new LiveAPI(path + " devices " + i);
        if (!exists(device) || String(device.get("class_name")).indexOf("GroupDevice") < 0) continue;
        if (i > d) return device.unquotedpath;
        before = device.unquotedpath;
    }
    return before;
}

function ensureResolved() {
    if (trackPath === null) resolve();
}

function announce() {
    ensureResolved();
    if (trackName) outlet(0, "boundfx", bankNumber, trackName);
}

// ============ THE BUS ============

function who() {
    announce();
}

function prog() {}   // the MIDI receivers' business, on the same bus
function vol() {}
function kit() {}
function bound() {}

function fx() {
    var a = arrayfromargs(arguments);
    if (Math.round(a[0]) !== bankNumber) return;
    ensureResolved();
    if (!rackPath) resolve();
    if (!rackPath) {
        warn("no rack near '" + trackName + "' to write to");
        return;
    }
    var written = guarded("fx write", function () {
        var n = 0;
        for (var i = 1; i <= 9 && i < a.length; i++) {
            var p = new LiveAPI(rackPath + " parameters " + i);
            if (!exists(p)) {
                resolve();                                // the rack moved: look again, once
                p = rackPath ? new LiveAPI(rackPath + " parameters " + i) : null;
                if (!exists(p)) break;
            }
            if (p.get("is_enabled") == 0) continue;      // hidden or mapped elsewhere: skip quietly
            p.set("value", a[i]);
            n++;
        }
        return n;
    });
    outlet(2, written === undefined ? -1 : written);
    log("bank " + bankNumber + " on '" + trackName + "': " + written + " macros");
}

function capture() {
    ensureResolved();
    if (!rackPath) resolve();
    if (!rackPath) return;
    var values = guarded("capture", function () {
        var out = [];
        for (var i = 1; i <= 9; i++) {
            var p = new LiveAPI(rackPath + " parameters " + i);
            out.push(exists(p) ? Math.round(p.get("value")) : 0);
        }
        return out;
    });
    if (values) outlet(0, ["fxret", bankNumber].concat(values));
}

function fxvol(b, value) {
    if (Math.round(b) !== bankNumber || !applyVolume) return;
    ensureResolved();
    if (!trackPath) return;
    guarded("volume", function () {
        var v = new LiveAPI(trackPath + " mixer_device volume");
        if (exists(v)) v.set("value", value);
    });
}

// After a recompile (autowatch, while developing) every var above is back at its initial
// value, but the patcher's controls do not send theirs again. So read them. Harmless at a
// normal load, where the controls send their values anyway.
function syncFromPatcher() {
    try {
        var b = patcher.getnamed("bus"), k = patcher.getnamed("bank"), v = patcher.getnamed("applyvol");
        if (b) busNumber = Math.round(b.getvalueof());
        if (k) bankNumber = Math.round(k.getvalueof());
        if (v) applyVolume = Math.round(v.getvalueof());
        setChannels();
    } catch (e) {
        warn("could not read the patcher's controls: " + e);
    }
}
var syncTask = new Task(syncFromPatcher, this);
syncTask.schedule(0);
