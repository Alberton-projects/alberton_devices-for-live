/*
    Alberton Kit Selector V4.3 -- Live API controller
    =================================================
    This script only talks to the Live API. The kits themselves are stored and recalled
    by pattrstorage / preset in the patcher (see docs/PROTOCOL.md).

    DRUMS    a dial per drum track writes that track's rack chain selector over the Live API
    MELODIC  a dial per melodic track becomes a program change, broadcast by the patcher to
             the PC Kit Selector Receivers -- one every 150 ms, because several at once
             crashed Analog Lab (V4.1.1)
    FX       capture and recall of nine macros of each group's [FX] rack
    VOLUMES  every track volume reset to a default on kit recall (a policy of this set)
    NAMES    a name per kit slot (V4.1)

    2026-09-08, Phase 1 of the repository plan, same behaviour:
      - every Live API access is guarded, so one bad track or parameter is reported in the
        Max window instead of stopping the whole object mid-show;
      - everything a recall writes to -- chain selectors, [FX] racks, volumes -- is found once
        at refresh and cached; the cache rebuilds itself when the track count changes, or on
        "refresh" / bang after renaming tracks;
      - post() is silent unless "debug 1" is sent; warnings are always shown.
*/

inlets = 1;
outlets = 1;   // every message leaves here with a prefix: pc, <key>_fx, current_name, ...

// ============ LOGGING ============

var DEBUG = 0;   // "debug 1" shows every step in the Max window, "debug 0" silences it again

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

// Run fn; a Live API error inside it is reported, never fatal to the object.
function guarded(what, fn) {
    try {
        return fn();
    } catch (e) {
        warn(what + " failed: " + e);
        return undefined;
    }
}

function count(obj) {
    var n = 0;
    for (var k in obj) n++;
    return n;
}

// A LiveAPI object that resolved to something. Max answers the string "0" for a path
// that resolves to nothing (and the number 0 before the API is up), so the test is a loose
// comparison, never truthiness: "0" is true in JavaScript.
function exists(api) {
    return !!api && api.id != 0;
}

// ============ PC QUEUE (V4.1.1) ============
// Program changes are spaced out; several at once crashed Analog Lab.

var PC_QUEUE_INTERVAL = 150;   // ms between program changes; "pc_interval 200" changes it
var pcQueue = [];
var pcTask = null;

function queuePC(trackKey, value) {
    pcQueue.push({ track: trackKey, value: value });
    if (!pcTask) {
        pcTask = new Task(processQueue, this);
        pcTask.interval = PC_QUEUE_INTERVAL;
        pcTask.repeat();
    }
}

function processQueue() {
    if (pcQueue.length > 0) {
        var item = pcQueue.shift();
        log("pc queue: " + item.track + " -> " + item.value + " (" + pcQueue.length + " left)");
        outlet(0, "pc", item.track, item.value);
    } else {
        if (pcTask) {
            pcTask.cancel();
            pcTask = null;
        }
        log("pc queue: done");
    }
}

function clearPCQueue() {
    pcQueue = [];
    if (pcTask) {
        pcTask.cancel();
        pcTask = null;
    }
    log("pc queue: cleared");
}

function pc_interval(ms) {
    PC_QUEUE_INTERVAL = ms;
    log("pc queue: interval " + ms + " ms");
}

// ============ WHAT THIS SET CALLS ITS TRACKS ============
// V4.3 still knows the set by name. V5 replaces this block with receivers.

var DRUM_TRACKS = {
    "kick":    "Kick",
    "snare":   "Snare",
    "hihat":   "HiHat",
    "cymbals": "Cymbals"
};

var MELODIC_TRACKS = {
    "bass_electric": { name: "Bass Electric", plugin: "Analog Lab" },
    "bass_synth":    { name: "Bass Synth",    plugin: "Analog Lab" },
    "pad1":          { name: "Pad 1",         plugin: "Analog Lab" },
    "pad2":          { name: "Pad 2",         plugin: "Analog Lab" },
    "piano1":        { name: "Piano 1",       plugin: "Pianoteq" },
    "piano2":        { name: "Piano 2",       plugin: "Mellotron V" },
    "lead1":         { name: "Lead 1",        plugin: "Analog Lab" },
    "lead2":         { name: "Lead 2",        plugin: "Analog Lab" }
};

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

// Volumes after a recall: every track to VOL_DEFAULT unless named here.
var VOL_DEFAULT = 0.70;        // -6 dB
var VOL_MASTER  = 0.85;        //  0 dB (since 2026-09-03)
var VOLUME_EXCEPTIONS = {
    "Bass Electric":  0.85,
    "Resample":       0.85,
    "Live Scratcher": 0.36,
    "Vocals":         0.625
};

// ============ PRESET NAMES (V4.1) ============

var NUM_PRESETS = 32;
var presetNames = [];
var currentPresetIndex = 0;

function initPresetNames() {
    presetNames = [];
    for (var i = 0; i < NUM_PRESETS; i++) {
        presetNames[i] = "Preset " + (i + 1);
    }
}
initPresetNames();

// preset_name <index> <words...>: the words arrive as separate arguments
function preset_name(index, name) {
    if (index >= 0 && index < NUM_PRESETS) {
        var fullName = "";
        for (var i = 1; i < arguments.length; i++) {
            if (i > 1) fullName += " ";
            fullName += arguments[i];
        }
        presetNames[index] = fullName;
        log("preset_name: [" + index + "] = '" + fullName + "'");
    }
}

function get_preset_name(index) {
    if (index >= 0 && index < NUM_PRESETS) {
        outlet(0, "name", index, presetNames[index]);
    }
}

// Called when a kit is recalled: shows its name in the textedit
function current_preset(index) {
    if (index >= 0 && index < NUM_PRESETS) {
        currentPresetIndex = index;
        outlet(0, "current_name", presetNames[index]);
    }
}

// All names as one message, "name0|name1|...", for pattr storage
function get_names_data() {
    outlet(0, "names_data", presetNames.join("|"));
}

function set_names_data() {
    var data = "";
    for (var i = 0; i < arguments.length; i++) {
        if (i > 0) data += " ";
        data += arguments[i];
    }
    if (data && data.length > 0) {
        var names = data.split("|");
        for (var j = 0; j < names.length && j < NUM_PRESETS; j++) {
            presetNames[j] = names[j].trim() || ("Preset " + (j + 1));
        }
        log("set_names_data: " + names.length + " names restored");
    }
}

function reset_names() {
    initPresetNames();
    log("reset_names: defaults restored");
}

// ============ CACHE ============
// Built by refresh(): everything a recall touches, as Live API paths.

var drumCache = {};        // key -> { index, path, name, chainPath }
var melodicCache = {};     // key -> { index, path, name, paramPath, ... }   (informational)
var fxCache = {};          // fxKey -> { index, devicePath }
var volumeTargets = [];    // [{ name, path, value }] for every track, return and the master
var cacheValid = false;
var cachedTrackCount = -1;

function loadbang() {
    log("loadbang: waiting for the Live API");
}

function bang() {
    refresh();
}

// Refresh if never done, or if the set gained or lost tracks since. Renaming a track
// does not change the count: send "refresh" by hand after that.
function ensureCache() {
    if (cacheValid) {
        var api = new LiveAPI("live_set");
        if (exists(api) && api.getcount("tracks") === cachedTrackCount) return;
        log("track count changed, refreshing");
    }
    refresh();
}

var retryTask = null;
var retriesLeft = 0;

// A fresh attempt: arm the retries, drop any pending one, scan now.
function refresh() {
    retriesLeft = 20;                      // ten seconds at 500 ms, then one warning and silence
    if (retryTask) {
        retryTask.cancel();
        retryTask = null;
    }
    attemptRefresh();
}

// live.thisdevice can fire before the set's Live API answers; then try again shortly.
function scheduleRetry() {
    if (retriesLeft-- <= 0) {
        warn("refresh: the Live API never answered; caches will be built on first use");
        return;
    }
    retryTask = new Task(function () {
        retryTask = null;
        attemptRefresh();
    }, this);
    retryTask.schedule(500);
}

function attemptRefresh() {
    drumCache = {};
    melodicCache = {};
    fxCache = {};
    volumeTargets = [];
    cacheValid = false;

    var api = new LiveAPI("live_set");
    if (!exists(api)) {
        scheduleRetry();
        return;
    }
    var trackCount = api.getcount("tracks");
    cachedTrackCount = trackCount;
    log("refresh: scanning " + trackCount + " tracks");
    if (trackCount === 0) {
        warn("refresh: no tracks found; is the device on a MIDI track?");
        return;
    }

    for (var i = 0; i < trackCount; i++) {
        scanTrack(i);
    }
    scanReturnsAndMaster(api);

    cacheValid = true;
    outlet(0, "refresh_complete");
    log("refresh: " + count(drumCache) + "/4 drums, " + count(melodicCache) + "/8 melodic, "
        + count(fxCache) + "/" + FX_ORDER.length + " fx, " + volumeTargets.length + " volumes");
}

// One track; an error here skips the track and the scan goes on.
function scanTrack(i) {
    guarded("scan of track " + i, function () {
        var trackPath = "live_set tracks " + i;
        var trackApi = new LiveAPI(trackPath);
        var trackName = trackApi.get("name").toString();
        var isGroup = trackApi.get("is_foldable") == 1;
        log("  track " + i + ": '" + trackName + "'");

        for (var key in DRUM_TRACKS) {
            if (trackName === DRUM_TRACKS[key]) {
                var chainPath = findChainParameter(trackPath);
                drumCache[key] = { index: i, path: trackPath, name: trackName, chainPath: chainPath };
                log("    -> drum " + key + (chainPath ? " [" + chainPath + "]" : " [no chain selector]"));
            }
        }

        for (var mkey in MELODIC_TRACKS) {
            if (trackName === MELODIC_TRACKS[mkey].name) {
                var presetParam = findPresetParameter(i);
                if (presetParam) {
                    melodicCache[mkey] = {
                        index: i, path: presetParam.trackPath, name: trackName,
                        paramPath: presetParam.paramPath, paramName: presetParam.name,
                        paramMax: presetParam.max, vstName: presetParam.vstName,
                        vstPath: presetParam.vstPath,
                        needsConfiguration: presetParam.needsConfiguration || false
                    };
                    log("    -> melodic " + mkey + (presetParam.needsConfiguration ? " [plugin needs configuration]" : " [" + presetParam.name + "]"));
                } else {
                    log("    -> melodic " + mkey + " (no plugin found)");
                }
            }
        }

        var nameUpper = trackName.toUpperCase();
        for (var fxKey in FX_TARGETS) {
            var target = FX_TARGETS[fxKey];
            var matches = target.isGroup
                ? (nameUpper.indexOf(target.search.toUpperCase()) >= 0 && isGroup)
                : (nameUpper === target.search.toUpperCase());
            if (matches) {
                var fxDevice = findFXDevice(i);
                if (fxDevice) {
                    fxCache[fxKey] = { index: i, devicePath: fxDevice.devicePath };
                    log("    -> fx " + fxKey + " [" + fxDevice.deviceName + "]");
                }
            }
        }

        var vol = VOL_DEFAULT;
        for (var excName in VOLUME_EXCEPTIONS) {
            if (trackName === excName) vol = VOLUME_EXCEPTIONS[excName];
        }
        volumeTargets.push({ name: trackName, path: trackPath + " mixer_device volume", value: vol });
    });
}

function scanReturnsAndMaster(api) {
    guarded("scan of returns and master", function () {
        var returnCount = api.getcount("return_tracks");
        for (var r = 0; r < returnCount; r++) {
            volumeTargets.push({ name: "return " + r, path: "live_set return_tracks " + r + " mixer_device volume", value: VOL_DEFAULT });
        }
        volumeTargets.push({ name: "master", path: "live_set master_track mixer_device volume", value: VOL_MASTER });
    });
}

// The first parameter on the track whose name contains "Chain". On this set that is
// Macro 1 of the drum rack, named "Chain Selector" and mapped to the real chain selector,
// which Live disables for that reason.
function findChainParameter(trackPath) {
    var trackApi = new LiveAPI(trackPath);
    var deviceCount = trackApi.getcount("devices");
    for (var d = 0; d < deviceCount; d++) {
        var devicePath = trackPath + " devices " + d;
        var deviceApi = new LiveAPI(devicePath);
        if (!exists(deviceApi)) continue;
        var paramCount = deviceApi.getcount("parameters");
        for (var p = 0; p < paramCount; p++) {
            var paramApi = new LiveAPI(devicePath + " parameters " + p);
            if (paramApi.get("name").toString().indexOf("Chain") >= 0) {
                return paramApi.unquotedpath;   // path itself comes back quoted
            }
        }
    }
    return null;
}

// A plugin's preset/program/patch parameter, if it exposes one. Informational:
// programs are broadcast to the receivers, never written here.
function findPresetParameter(trackIndex) {
    var trackPath = "live_set tracks " + trackIndex;
    var trackApi = new LiveAPI(trackPath);
    var deviceCount = trackApi.getcount("devices");

    var vstDeviceIndex = -1, vstDeviceName = "", vstDevicePath = "";

    for (var d = 0; d < deviceCount; d++) {
        var devicePath = trackPath + " devices " + d;
        var deviceApi = new LiveAPI(devicePath);
        if (!exists(deviceApi)) continue;

        var deviceName = deviceApi.get("name").toString();
        var deviceClass = deviceApi.get("class_name").toString();
        var paramCount = deviceApi.getcount("parameters");

        if (deviceClass.indexOf("PluginDevice") >= 0 ||
            deviceClass.indexOf("AuPluginDevice") >= 0 ||
            deviceClass.indexOf("Vst") >= 0) {
            vstDeviceIndex = d;
            vstDeviceName = deviceName;
            vstDevicePath = devicePath;
        }

        for (var i = 0; i < paramCount; i++) {
            var paramApi = new LiveAPI(devicePath + " parameters " + i);
            var paramName = paramApi.get("name").toString();
            var lowerName = paramName.toLowerCase();
            if (lowerName.indexOf("preset") >= 0 ||
                lowerName.indexOf("program") >= 0 ||
                lowerName.indexOf("patch") >= 0) {
                return {
                    trackPath: trackPath, paramPath: paramApi.unquotedpath, name: paramName,
                    max: paramApi.get("max"), deviceIndex: d, vstName: deviceName
                };
            }
        }
    }

    if (vstDeviceIndex >= 0) {
        log("      plugin without an exposed preset parameter: " + vstDeviceName
            + " (in Live, Configure the plugin and move its preset control)");
        return {
            trackPath: trackPath, paramPath: null, name: "(needs config)", max: 127,
            deviceIndex: vstDeviceIndex, vstName: vstDeviceName, vstPath: vstDevicePath,
            needsConfiguration: true
        };
    }
    return null;
}

// The first device on the track whose name contains [FX] (or [fx]).
function findFXDevice(trackIndex) {
    var trackPath = "live_set tracks " + trackIndex;
    var trackApi = new LiveAPI(trackPath);
    var deviceCount = trackApi.getcount("devices");
    for (var d = 0; d < deviceCount; d++) {
        var devicePath = trackPath + " devices " + d;
        var deviceApi = new LiveAPI(devicePath);
        if (!exists(deviceApi)) continue;
        var deviceName = deviceApi.get("name").toString();
        if (deviceName.indexOf("[FX]") >= 0 || deviceName.indexOf("[fx]") >= 0) {
            return { deviceIndex: d, devicePath: devicePath, deviceName: deviceName };
        }
    }
    return null;
}

// ============ DEBUG: LIST EVERY PARAMETER OF A TRACK ============
// "listParams 6" prints, on request, so it always posts.

function listParams(trackIndex) {
    guarded("listParams", function () {
        var trackPath = "live_set tracks " + trackIndex;
        var trackApi = new LiveAPI(trackPath);
        var deviceCount = trackApi.getcount("devices");
        post("\n=== Track " + trackIndex + ": " + trackApi.get("name") + " (" + deviceCount + " devices) ===\n");
        for (var d = 0; d < deviceCount; d++) {
            var devicePath = trackPath + " devices " + d;
            var deviceApi = new LiveAPI(devicePath);
            if (!exists(deviceApi)) continue;
            var paramCount = deviceApi.getcount("parameters");
            post("--- Device " + d + ": " + deviceApi.get("name") + " (" + deviceApi.get("class_name") + "), " + paramCount + " parameters\n");
            for (var i = 0; i < paramCount; i++) {
                var paramApi = new LiveAPI(devicePath + " parameters " + i);
                post("  [" + i + "] " + paramApi.get("name") + " = " + paramApi.get("value") + "\n");
            }
        }
    });
}

// ============ THE DIALS ============

var currentValues = {
    kick: 0, snare: 0, hihat: 0, cymbals: 0,
    bass_electric: 0, bass_synth: 0, pad1: 0, pad2: 0,
    piano1: 0, piano2: 0, lead1: 0, lead2: 0
};

function setDrumChain(trackKey, value) {
    ensureCache();
    var cache = drumCache[trackKey];
    if (!cache) {
        warn("setDrumChain: " + trackKey + " not in cache (send refresh)");
        return;
    }
    if (!cache.chainPath) {
        warn("setDrumChain: no chain selector found on '" + cache.name + "'");
        return;
    }
    guarded("setDrumChain " + trackKey, function () {
        var api = new LiveAPI(cache.chainPath);
        if (!exists(api)) {
            warn("setDrumChain: the chain selector of '" + cache.name + "' is gone (send refresh)");
            return;
        }
        api.set("value", value);
        log("setDrumChain: " + trackKey + " -> " + value);
    });
}

function setMelodicPreset(trackKey, value) {
    log("setMelodicPreset: " + trackKey + " -> pc " + value + " (queued)");
    queuePC(trackKey, value);
}

function dial(key, value) {
    currentValues[key] = value;
    if (DRUM_TRACKS[key]) setDrumChain(key, value);
    else setMelodicPreset(key, value);
}

// One function per dial: the patcher prepends the dial's key to its value.
function kick(v)          { dial("kick", v); }
function snare(v)         { dial("snare", v); }
function hihat(v)         { dial("hihat", v); }
function cymbals(v)       { dial("cymbals", v); }
function bass_electric(v) { dial("bass_electric", v); }
function bass_synth(v)    { dial("bass_synth", v); }
function pad1(v)          { dial("pad1", v); }
function pad2(v)          { dial("pad2", v); }
function piano1(v)        { dial("piano1", v); }
function piano2(v)        { dial("piano2", v); }
function lead1(v)         { dial("lead1", v); }
function lead2(v)         { dial("lead2", v); }

// After a recompile (autowatch, while developing) currentValues is back at its initial
// value, but the patcher's controls do not send theirs again. So read them: patcher
// objects answer getvalueof() with what they show. Harmless at a normal load, where the
// controls send their values anyway.
function syncFromPatcher() {
    try {
        for (var key in currentValues) {
            var dial = patcher.getnamed("dial_" + key);
            if (dial) currentValues[key] = Math.round(dial.getvalueof());
        }
    } catch (e) {
        warn("could not read the patcher's dials: " + e);
    }
}
var syncTask = new Task(syncFromPatcher, this);
syncTask.schedule(0);

// ============ SEND ALL (after every kit recall, and the Send button) ============

function sendAll() {
    ensureCache();
    log("sendAll");
    for (var key in DRUM_TRACKS) setDrumChain(key, currentValues[key]);
    for (var mkey in MELODIC_TRACKS) setMelodicPreset(mkey, currentValues[mkey]);
    resetVolumes();
    outlet(0, "sent_all");
}

// ============ FX MACROS ============

function capture_fx() {
    ensureCache();
    for (var i = 0; i < FX_ORDER.length; i++) {
        var fxKey = FX_ORDER[i];
        var cache = fxCache[fxKey];
        if (!cache) {
            outlet(0, fxKey + "_fx", 0, 0, 0, 0, 0, 0, 0, 0, 0);
            continue;
        }
        var macros = guarded("capture of " + fxKey, function () {
            var values = [];
            for (var m = 1; m <= 9; m++) {
                values.push(Math.round(new LiveAPI(cache.devicePath + " parameters " + m).get("value")));
            }
            return values;
        });
        if (macros) {
            outlet(0, fxKey + "_fx", macros[0], macros[1], macros[2], macros[3],
                   macros[4], macros[5], macros[6], macros[7], macros[8]);
        }
    }
    outlet(0, "fx_captured");
}

function applyFX(fxKey, values) {
    ensureCache();
    var cache = fxCache[fxKey];
    if (!cache) return;
    guarded("recall of " + fxKey + " fx", function () {
        for (var i = 0; i < 9 && i < values.length; i++) {
            var api = new LiveAPI(cache.devicePath + " parameters " + (i + 1));
            if (!exists(api)) {
                warn("recall of " + fxKey + " fx: the [FX] rack is gone (send refresh)");
                return;
            }
            if (api.get("is_enabled") == 0) continue;   // a hidden macro is disabled: skip it quietly
            api.set("value", values[i]);
        }
    });
}

function drums_fx()    { applyFX("drums",    arrayfromargs(arguments)); }
function bass_fx()     { applyFX("bass",     arrayfromargs(arguments)); }
function pads_fx()     { applyFX("pads",     arrayfromargs(arguments)); }
function pianos_fx()   { applyFX("pianos",   arrayfromargs(arguments)); }
function leads_fx()    { applyFX("leads",    arrayfromargs(arguments)); }
function loops_fx()    { applyFX("loops",    arrayfromargs(arguments)); }
function vocoder_fx()  { applyFX("vocoder",  arrayfromargs(arguments)); }
function vocals_fx()   { applyFX("vocals",   arrayfromargs(arguments)); }
function resample_fx() { applyFX("resample", arrayfromargs(arguments)); }

// ============ VOLUME RESET ============

function resetVolumes() {
    ensureCache();
    var resetCount = 0;
    for (var i = 0; i < volumeTargets.length; i++) {
        var t = volumeTargets[i];
        guarded("volume of " + t.name, function () {
            var api = new LiveAPI(t.path);
            if (exists(api)) {
                api.set("value", t.value);
                resetCount++;
            }
        });
    }
    log("resetVolumes: " + resetCount + " of " + volumeTargets.length);
    outlet(0, "volumes_reset");
}
