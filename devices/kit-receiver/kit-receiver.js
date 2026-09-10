/*
    Alberton Kit Receiver
    =====================
    One per track. Listens to a Kit Selector panel on the bus and acts on its own strip:

      prog <strip> <value>   the strip's program: sent on as a MIDI program change, or written
                             to this track's rack -- its chain selector or one of its macros --
                             as the Action menu says; or ignored when the action is None, for a
                             track that only wants its volume from the panel
      vol <strip> <0..1>     this track's volume, when Apply Volume is on
      who                    the panel asking every receiver to introduce itself

    It answers "bound <strip> <track name>" on the reply channel, at load, when its strip
    changes and when asked, so the panel can label its strips after the tracks.

    Bus 1-4 is a global setting: the bus channel is ks<bus>, the reply channel ks<bus>_ret.
    The rack it writes to is its parent rack when it sits inside a rack chain, otherwise the
    first rack on its track. Nothing about the set is assumed: no track names, no device
    names. MIDI passes through untouched; only the program change is added.
*/

autowatch = 1;
inlets = 1;
outlets = 4;
// 0: the program change, as an int for midiformat
// 1: Last, the value last received, for the display
// 2: the receive object -- "set ks<bus>"
// 3: the reply channel, a forward object -- "send ks<bus>_ret", then the messages themselves

// ============ LOGGING ============

var DEBUG = 0;

function log(s) {
    if (DEBUG) post(s + "\n");
}

function warn(s) {
    post("Kit Receiver: " + s + "\n");
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

// ============ SETTINGS (the device's parameters) ============

var busNumber = 1;
var stripNumber = 1;
var actionIndex = 0;          // 0 program change, 1 chain selector, 2.. macro (index - 1)
var applyVolume = 1;

var ACTION_PC = 0, ACTION_CHAIN = 1, ACTION_NONE = 18;   // 2..17: macro (index - 1); None: volume only

function bus(v) {
    busNumber = Math.round(v);
    setChannels();
    announce();
}

function strip(v) {
    stripNumber = Math.round(v);
    announce();
}

function action(v) {
    actionIndex = Math.round(v);
}

function applyvol(v) {
    applyVolume = v ? 1 : 0;
}

function setChannels() {
    outlet(2, "set", "ks" + busNumber);            // a receive: "set" renames it
    outlet(3, "send", "ks" + busNumber + "_ret");  // a forward: "send" names its target
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

// The track from this device's own canonical path, the rack from its position.
function resolve() {
    trackPath = null; trackName = ""; rackPath = null;
    guarded("resolve", function () {
        var me = new LiveAPI("this_device");
        if (!exists(me)) return;
        var tokens = me.unquotedpath.split(" ");          // live_set tracks N devices D [chains C devices E ...]
        if (tokens.length < 3) return;
        trackPath = tokens.slice(0, 3).join(" ");
        var track = new LiveAPI(trackPath);
        trackName = exists(track) ? track.get("name").toString() : "";
        var chainAt = tokens.indexOf("chains");
        if (chainAt > 0) {
            rackPath = tokens.slice(0, chainAt).join(" ");   // the rack this chain belongs to
        } else {
            rackPath = firstRackOn(trackPath);
        }
        log("on '" + trackName + "', rack " + (rackPath || "none"));
    });
}

function firstRackOn(path) {
    var track = new LiveAPI(path);
    var n = track.getcount("devices");
    for (var d = 0; d < n; d++) {
        var device = new LiveAPI(path + " devices " + d);
        if (exists(device) && String(device.get("class_name")).indexOf("GroupDevice") >= 0) return device.unquotedpath;
    }
    return null;
}

function ensureResolved() {
    if (trackPath === null) resolve();
}

function announce() {
    ensureResolved();
    if (trackName) outlet(3, "bound", stripNumber, trackName);
}

// ============ THE BUS ============

function who() {
    announce();
}

function kit() {
    // informational: the panel says which kit it recalled; nothing to do here
}

// the fx receivers' business, on the same bus
function fx() {}
function fxvol() {}
function capture() {}
function boundfx() {}

function fx() {
    // the FX receivers' business (V5.1); nothing to do here
}

function prog(s, value) {
    if (Math.round(s) !== stripNumber) return;
    value = Math.round(value);
    outlet(1, value);
    if (actionIndex === ACTION_NONE) return;        // this receiver is here for the volume
    if (actionIndex === ACTION_PC) {
        outlet(0, value);
        return;
    }
    ensureResolved();
    if (!rackPath) resolve();                           // a rack may have arrived since
    if (!rackPath) {
        warn("no rack on '" + trackName + "' to write to");
        return;
    }
    guarded("write to the rack", function () {
        var target = rackTarget();
        if (!exists(target)) {
            resolve();                                  // the rack moved: look again, once
            target = rackPath ? rackTarget() : null;
        }
        if (!rackPath) {
            warn("no rack on '" + trackName + "' to write to");
            return;
        }
        if (!exists(target)) {
            warn("the rack on '" + trackName + "' has no such target");
            return;
        }
        if (target.get("is_enabled") == 0) {
            warn("'" + target.get("name") + "' on '" + trackName + "' is mapped to a macro and cannot be written; choose that macro as the action");
            return;
        }
        target.set("value", value);
        log("'" + trackName + "': " + target.get("name") + " = " + value);
    });
}

function rackTarget() {
    return (actionIndex === ACTION_CHAIN) ? chainSelector() : new LiveAPI(rackPath + " parameters " + (actionIndex - 1));
}

// The rack's own chain selector: the parameter named so (the last one on a rack).
function chainSelector() {
    var rack = new LiveAPI(rackPath);
    var n = rack.getcount("parameters");
    for (var i = n - 1; i >= 0; i--) {
        var p = new LiveAPI(rackPath + " parameters " + i);
        if (String(p.get("name")) === "Chain Selector") return p;
    }
    return null;
}

function vol(s, value) {
    if (Math.round(s) !== stripNumber || !applyVolume) return;
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
        var b = patcher.getnamed("bus"), s = patcher.getnamed("strip"), a = patcher.getnamed("action"), v = patcher.getnamed("applyvol");
        if (b) busNumber = Math.round(b.getvalueof());
        if (s) stripNumber = Math.round(s.getvalueof());
        if (a) actionIndex = Math.round(a.getvalueof());
        if (v) applyVolume = Math.round(v.getvalueof());
        setChannels();
    } catch (e) {
        warn("could not read the patcher's controls: " + e);
    }
}
var syncTask = new Task(syncFromPatcher, this);
syncTask.schedule(0);
