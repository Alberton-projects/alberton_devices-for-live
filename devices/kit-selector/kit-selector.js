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

    V5.0 keeps one thing from V4.3 by name: the nine FX macro banks, captured from and
    recalled into the [FX] rack of each group track found by its name. V5.1 moves that to
    receivers too; the block is marked below.

    Every Live API access is guarded; post() is silent unless "debug 1" is sent.
*/

autowatch = 1;
inlets = 1;
outlets = 3;
// 0: the bus send -- "set ks<bus>", then the messages
// 1: the reply receive -- "set ks<bus>_ret"
// 2: the FX banks -- "<key>_fx v1..v9" for the multisliders, and "fx_captured"

var STRIPS = 16;

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
for (var i = 0; i <= STRIPS; i++) { prog[i] = 0; vol[i] = 0.85; }

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
    } else if (m.length > 3 && m.substring(m.length - 3) === "_fx") {
        applyFX(m.substring(0, m.length - 3), a);
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
    fxCache = {};
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

// ============ FX BANKS (V5.0: still by group name -- the one set-specific block) ============
// A bank is nine macros of the first device named [FX] on the track. The tracks are found
// by name: group tracks whose name contains the word, or a track named exactly so.

var FX_TARGETS = {
    "drums":    { search: "DRUMS",    isGroup: true },
    "bass":     { search: "BASS",     isGroup: true },
    "pads":     { search: "PADS",     isGroup: true },
    "pianos":   { search: "PIANOS",   isGroup: true },
    "leads":    { search: "LEADS",    isGroup: true },
    "loops":    { search: "LOOPS",    isGroup: true },
    "vocoder":  { search: "Vocoder",  isGroup: false },
    "vocals":   { search: "Vocals",   isGroup: false },
    "resample": { search: "Resample", isGroup: false }
};
var FX_ORDER = ["drums", "bass", "pads", "pianos", "leads", "loops", "vocoder", "vocals", "resample"];
var fxCache = {};   // key -> device path

function scanFX() {
    fxCache = {};
    guarded("fx scan", function () {
        var api = new LiveAPI("live_set");
        if (!exists(api)) return;
        var count = api.getcount("tracks");
        for (var i = 0; i < count; i++) {
            var trackPath = "live_set tracks " + i;
            var track = new LiveAPI(trackPath);
            var name = String(track.get("name")).toUpperCase();
            var isGroup = track.get("is_foldable") == 1;
            for (var key in FX_TARGETS) {
                var t = FX_TARGETS[key];
                var matches = t.isGroup ? (name.indexOf(t.search.toUpperCase()) >= 0 && isGroup) : (name === t.search.toUpperCase());
                if (matches && !fxCache[key]) {
                    var devicePath = fxDeviceOn(trackPath);
                    if (devicePath) fxCache[key] = devicePath;
                }
            }
        }
    });
    log("fx banks: " + FX_ORDER.filter(function (k) { return !!fxCache[k]; }).join(" "));
}

function fxDeviceOn(trackPath) {
    var track = new LiveAPI(trackPath);
    var n = track.getcount("devices");
    for (var d = 0; d < n; d++) {
        var device = new LiveAPI(trackPath + " devices " + d);
        if (exists(device) && String(device.get("name")).indexOf("[FX]") >= 0) return device.unquotedpath;
    }
    return null;
}

function ensureFX() {
    var any = false;
    for (var k in fxCache) any = true;
    if (!any) scanFX();
}

function capture_fx() {
    ensureFX();
    for (var i = 0; i < FX_ORDER.length; i++) {
        var key = FX_ORDER[i];
        if (!fxCache[key]) {
            outlet(2, key + "_fx", 0, 0, 0, 0, 0, 0, 0, 0, 0);
            continue;
        }
        var values = guarded("capture of " + key, function () {
            var out = [];
            for (var m = 1; m <= 9; m++) out.push(Math.round(new LiveAPI(fxCache[key] + " parameters " + m).get("value")));
            return out;
        });
        if (values) outlet(2, [key + "_fx"].concat(values));
    }
    outlet(2, "fx_captured");
}

function applyFX(key, values) {
    if (!FX_TARGETS[key]) {
        warn("unknown fx bank " + key);
        return;
    }
    ensureFX();
    if (!fxCache[key]) return;
    guarded("recall of " + key + " fx", function () {
        for (var i = 0; i < 9 && i < values.length; i++) {
            var api = new LiveAPI(fxCache[key] + " parameters " + (i + 1));
            if (!exists(api)) {
                warn("the [FX] rack of " + key + " is gone (send refresh)");
                return;
            }
            if (api.get("is_enabled") == 0) continue;   // a hidden macro is disabled: skip it quietly
            api.set("value", values[i]);
        }
    });
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
        setChannels();
    } catch (e) {
        warn("could not read the patcher's controls: " + e);
    }
}
var syncTask = new Task(syncFromPatcher, this);
syncTask.schedule(0);
