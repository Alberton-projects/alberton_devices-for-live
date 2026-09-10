/*
    Alberton Kit Selector V5 -- the panel (kit-selector.js)
    ========================================================
    Sixteen strips, each a program and a volume, plus a Main volume, stored as kits by the
    pattrstorage in the patcher and recalled by the preset grid or by a MIDI program change.
    The panel knows nothing about the set: every strip is broadcast on one Max send, ks<bus>,
    and an Alberton Kit Receiver on a track decides what its strip means there.

      prog <strip> <value>    the strip's program, one every 150 ms (Analog Lab crashed when
                              several program changes arrived together)
      vol <strip> <0..1>      the strip's volume, at once
      kit <slot>              which kit was just recalled, for anyone listening
      who                     every receiver answers "bound <strip> <track name>" on ks<bus>_ret,
                              and the panel writes the name under the strip

    The nine fx banks -- nine macros each -- go the same way: "fx <bank> <v1..v9>" to the Kit
    FX Receiver sitting by the rack, "fxvol <bank> <0..1>" for that track's volume, and
    "capture" to ask every fx receiver for its rack's macros, answered as "fxret <bank>
    <v1..v9>" on the reply channel. The panel touches Live for one thing only: Main.

    Every Live API access is guarded; post() is silent unless "debug 1" is sent.
*/

autowatch = 1;
inlets = 1;
outlets = 3;
// 0: the bus send -- "set ks<bus>", then the messages
// 1: the reply receive -- "set ks<bus>_ret"
// 2: the FX banks -- "<key>_fx v1..v9" for the multisliders, and "fx_captured"

var STRIPS = 16;
var BANKS = ["drums", "bass", "pads", "pianos", "leads", "loops", "vocoder", "vocals", "resample"];

// ============ LOGGING ============

var DEBUG = 0;

function log(s) {
    if (DEBUG) post(s + "\n");
}

function warn(s) {
    post("Kit Selector: " + s + "\n");
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

// ============ STATE ============

var busNumber = 1;
var prog = [];     // 1..16
var vol = [];      // 1..16
var mainVol = 0.85;
var fxValues = [];   // 1..9, nine macros each
var fxVol = [];      // 1..9
for (var i = 0; i <= STRIPS; i++) { prog[i] = 0; vol[i] = 0.85; }
for (var b = 0; b <= BANKS.length; b++) { fxValues[b] = [0, 0, 0, 0, 0, 0, 0, 0, 0]; fxVol[b] = 0.85; }

function bankIndex(key) {
    for (var b = 0; b < BANKS.length; b++) if (BANKS[b] === key) return b + 1;
    return 0;
}

// ============ THE PROGRAM QUEUE ============

var PC_QUEUE_INTERVAL = 150;
var pcQueue = [];
var pcTask = null;

function queueProg(strip, value) {
    pcQueue.push({ strip: strip, value: value });
    if (!pcTask) {
        pcTask = new Task(processQueue, this);
        pcTask.interval = PC_QUEUE_INTERVAL;
        pcTask.repeat();
    }
}

function processQueue() {
    if (pcQueue.length > 0) {
        var item = pcQueue.shift();
        outlet(0, "prog", item.strip, item.value);
        log("prog " + item.strip + " " + item.value + " (" + pcQueue.length + " left)");
    } else if (pcTask) {
        pcTask.cancel();
        pcTask = null;
    }
}

function pc_interval(ms) {
    PC_QUEUE_INTERVAL = ms;
}

// ============ THE STRIPS ============
// p<n> <value> and v<n> <value> arrive from the dials through their prepends.

function anything() {
    var m = String(messagename);
    var a = arrayfromargs(arguments);
    var n;
    if (m.charAt(0) === "p" && (n = parseInt(m.substring(1), 10)) >= 1 && n <= STRIPS) {
        prog[n] = Math.round(a[0]);
        queueProg(n, prog[n]);
    } else if (m.charAt(0) === "v" && (n = parseInt(m.substring(1), 10)) >= 1 && n <= STRIPS) {
        vol[n] = a[0];
        outlet(0, "vol", n, vol[n]);
    } else if (m.length > 3 && m.substring(m.length - 3) === "_fx" && (n = bankIndex(m.substring(0, m.length - 3))) > 0) {
        fxValues[n] = a.slice(0, 9);
        outlet(0, ["fx", n].concat(fxValues[n]));
    } else if (m.indexOf("fxvol_") === 0 && (n = bankIndex(m.substring(6))) > 0) {
        fxVol[n] = a[0];
        outlet(0, "fxvol", n, fxVol[n]);
    } else {
        warn("unknown message " + m);
    }
}

function vmain(v) {
    mainVol = v;
    guarded("main volume", function () {
        var api = new LiveAPI("live_set master_track mixer_device volume");
        if (exists(api)) api.set("value", mainVol);
    });
}

// Everything again: after a recall, and from the Send button.
function sendall() {
    for (var n = 1; n <= STRIPS; n++) {
        outlet(0, "vol", n, vol[n]);
        queueProg(n, prog[n]);
    }
    for (var b = 1; b <= BANKS.length; b++) {
        outlet(0, "fxvol", b, fxVol[b]);
        outlet(0, ["fx", b].concat(fxValues[b]));
    }
    vmain(mainVol);
}

// From the preset grid: a kit was recalled. The dials have just received their values and
// sent them one by one; a moment later everything is sent again in order, as one recall.
var recallTask = null;

function recalled(slot) {
    if (recallTask) recallTask.cancel();
    recallTask = new Task(function () {
        recallTask = null;
        sendall();
        outlet(0, "kit", slot);
        log("kit " + slot);
    }, this);
    recallTask.schedule(50);
}

// ============ THE BUS ============

function bus(v) {
    busNumber = Math.round(v);
    setChannels();
    who();
}

function setChannels() {
    outlet(0, "set", "ks" + busNumber);
    outlet(1, "set", "ks" + busNumber + "_ret");
}

function init() {
    setChannels();
    who();
}

function refresh() {
    who();
}

function who() {
    outlet(0, "who");
}

// bound <strip> <track name...>: a receiver introducing itself; its name goes under the strip
function bound() {
    var a = arrayfromargs(arguments);
    var strip = parseInt(a[0], 10);
    if (!(strip >= 1 && strip <= STRIPS)) return;
    var name = a.slice(1).join(" ");
    guarded("label " + strip, function () {
        var label = patcher.getnamed("lab" + strip);
        if (label) label.message("set", name);
    });
    log("strip " + strip + " is '" + name + "'");
}

// boundfx <bank> <track name...>: an fx receiver introducing itself
function boundfx() {
    var a = arrayfromargs(arguments);
    log("fx bank " + a[0] + " is on '" + a.slice(1).join(" ") + "'");
}

// ============ FX BANKS ============

// The FX Capture button: every fx receiver answers with its rack's macros
function capture_fx() {
    outlet(0, "capture");
}

// fxret <bank> <v1..v9>: an fx receiver's answer, into the bank's slider
function fxret() {
    var a = arrayfromargs(arguments);
    var b = Math.round(a[0]);
    if (!(b >= 1 && b <= BANKS.length)) return;
    fxValues[b] = a.slice(1, 10);
    outlet(2, [BANKS[b - 1] + "_fx"].concat(fxValues[b]));
}

// After a recompile (autowatch, while developing) every var above is back at its initial
// value, but the patcher's controls do not send theirs again. So read them. Harmless at a
// normal load, where the controls send their values anyway.
function syncFromPatcher() {
    try {
        for (var n = 1; n <= STRIPS; n++) {
            var pd = patcher.getnamed("p" + n), vd = patcher.getnamed("v" + n);
            if (pd) prog[n] = Math.round(pd.getvalueof());
            if (vd) vol[n] = vd.getvalueof();
        }
        var vm = patcher.getnamed("vmain"), b = patcher.getnamed("bus");
        if (vm) mainVol = vm.getvalueof();
        if (b) busNumber = Math.round(b.getvalueof());
        for (var k = 1; k <= BANKS.length; k++) {
            var pt = patcher.getnamed("pattr_" + BANKS[k - 1]), fv = patcher.getnamed("fxvol_" + BANKS[k - 1]);
            if (pt) { var v = pt.getvalueof(); if (v instanceof Array && v.length >= 9) fxValues[k] = v.slice(0, 9); }
            if (fv) fxVol[k] = fv.getvalueof();
        }
        setChannels();
    } catch (e) {
        warn("could not read the patcher's controls: " + e);
    }
}
var syncTask = new Task(syncFromPatcher, this);
syncTask.schedule(0);
