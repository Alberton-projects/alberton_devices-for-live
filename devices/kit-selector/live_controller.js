/**
 * Alberton Kit Selector V4.3 - Live API Controller
 * 
 * Solo controla Live API. Los presets se manejan con pattrstorage/preset en Max.
 * 
 * DRUMS: Chain selector via Live API (Drum Rack)
 * MELODIC: Preset parameter via Live API (Analog Lab, Pianoteq, Mellotron V)
 * FX: Macro values capture/recall
 * VOLUMES: Reset all track volumes on preset recall
 * PRESET NAMES: Store/recall preset names (V4.1)
 * 
 * V4.1.1: Added PC Queue system to prevent VST crashes from simultaneous Program Changes
 */

inlets = 1;
outlets = 1;  // Single outlet - all messages routed via prefixes (pc, drums_fx, current_name, etc.)

// ============ PC QUEUE SYSTEM (V4.1.1) ============
// Prevents crashes by spacing out Program Changes to VSTs (especially Analog Lab)

var PC_QUEUE_INTERVAL = 150;  // ms between each Program Change (adjust if crashes persist)
var pcQueue = [];
var pcTask = null;

/**
 * Add a Program Change to the queue
 * Instead of sending immediately, PCs are queued and sent with delays
 */
function queuePC(trackKey, value) {
    pcQueue.push({track: trackKey, value: value});
    
    // Start the task if not already running
    if (!pcTask) {
        pcTask = new Task(processQueue, this);
        pcTask.interval = PC_QUEUE_INTERVAL;
        pcTask.repeat();
    }
}

/**
 * Process one item from the PC queue
 * Called repeatedly by Task until queue is empty
 */
function processQueue() {
    if (pcQueue.length > 0) {
        var item = pcQueue.shift();
        post("PC Queue: sending " + item.track + " -> " + item.value + " (remaining: " + pcQueue.length + ")\n");
        outlet(0, "pc", item.track, item.value);
    } else {
        // Queue empty, stop the task
        if (pcTask) {
            pcTask.cancel();
            pcTask = null;
        }
        post("PC Queue: complete\n");
    }
}

/**
 * Clear the PC queue (useful if needed to abort)
 */
function clearPCQueue() {
    pcQueue = [];
    if (pcTask) {
        pcTask.cancel();
        pcTask = null;
    }
    post("PC Queue: cleared\n");
}

/**
 * Set the PC queue interval (can be called from Max)
 * Usage: pc_interval 200
 */
function pc_interval(ms) {
    PC_QUEUE_INTERVAL = ms;
    post("PC Queue interval set to " + ms + "ms\n");
}

// ============ TRACK NAME MAPPINGS ============

var DRUM_TRACKS = {
    "kick": "Kick",
    "snare": "Snare", 
    "hihat": "HiHat",
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

// ============ PRESET NAMES (V4.1) ============

var NUM_PRESETS = 32;
var presetNames = [];

// Initialize preset names array
function initPresetNames() {
    presetNames = [];
    for (var i = 0; i < NUM_PRESETS; i++) {
        presetNames[i] = "Preset " + (i + 1);
    }
}
initPresetNames();

/**
 * Set a preset name
 * Called from Max: preset_name <index> <name>
 */
function preset_name(index, name) {
    if (index >= 0 && index < NUM_PRESETS) {
        // Handle multiple word names (arguments come as separate params)
        var fullName = "";
        for (var i = 1; i < arguments.length; i++) {
            if (i > 1) fullName += " ";
            fullName += arguments[i];
        }
        presetNames[index] = fullName;
        post("preset_name: [" + index + "] = '" + fullName + "'\n");
    }
}

/**
 * Get a preset name
 * Called from Max: get_preset_name <index>
 */
function get_preset_name(index) {
    if (index >= 0 && index < NUM_PRESETS) {
        outlet(0, "name", index, presetNames[index]);
    }
}

// Variable to track current preset index
var currentPresetIndex = 0;

/**
 * Called when preset is selected - sends current preset name to textedit
 */
function current_preset(index) {
    if (index >= 0 && index < NUM_PRESETS) {
        currentPresetIndex = index;
        outlet(0, "current_name", presetNames[index]);
    }
}

/**
 * Store all preset names as a single message (for pattr storage)
 * Format: names_data <name0> | <name1> | <name2> ...
 */
function get_names_data() {
    var data = presetNames.join("|");
    outlet(0, "names_data", data);
}

/**
 * Restore all preset names from stored data
 * Called from Max: set_names_data <data>
 */
function set_names_data() {
    // Combine all arguments into one string (Max sends words separately)
    var data = "";
    for (var i = 0; i < arguments.length; i++) {
        if (i > 0) data += " ";
        data += arguments[i];
    }
    
    if (data && data.length > 0) {
        var names = data.split("|");
        for (var i = 0; i < names.length && i < NUM_PRESETS; i++) {
            presetNames[i] = names[i].trim() || ("Preset " + (i + 1));
        }
        post("set_names_data: restored " + names.length + " preset names\n");
    }
}

/**
 * Reset all preset names to defaults
 */
function reset_names() {
    initPresetNames();
    post("reset_names: all preset names reset to defaults\n");
}

// ============ CACHE ============

var drumCache = {};
var melodicCache = {};
var cacheValid = false;

// ============ INIT ============

function loadbang() {
    post("loadbang - waiting for Live API...\n");
    // outputPresetList will be called by set_names_data when pattr restores
}

function bang() {
    refresh();
}

// ============ TRACK SEARCH ============

function refresh() {
    drumCache = {};
    melodicCache = {};
    cacheValid = false;
    
    post("refresh() called\n");
    
    var api = new LiveAPI();
    
    if (!api) {
        post("ERROR: Cannot create LiveAPI object\n");
        return;
    }
    
    api.path = "live_set";
    
    var apiId = api.id;
    post("LiveAPI id: " + apiId + "\n");
    
    if (!apiId || apiId == 0) {
        post("ERROR: Cannot access live_set - API not ready\n");
        return;
    }
    
    var trackCount = api.getcount("tracks");
    post("Scanning " + trackCount + " tracks...\n");
    
    if (trackCount == 0) {
        post("WARNING: No tracks found. Make sure device is on a MIDI track.\n");
        return;
    }
    
    for (var i = 0; i < trackCount; i++) {
        var trackApi = new LiveAPI();
        trackApi.path = "live_set tracks " + i;
        
        var trackName = trackApi.get("name").toString();
        post("  Track " + i + ": '" + trackName + "'\n");
        
        for (var key in DRUM_TRACKS) {
            if (trackName === DRUM_TRACKS[key]) {
                drumCache[key] = {
                    index: i,
                    path: "live_set tracks " + i,
                    name: trackName
                };
                post("    -> DRUM: " + key + "\n");
            }
        }
        
        for (var key in MELODIC_TRACKS) {
            if (trackName === MELODIC_TRACKS[key].name) {
                var presetParam = findPresetParameter(i);
                if (presetParam) {
                    melodicCache[key] = {
                        index: i,
                        path: presetParam.trackPath,
                        name: trackName,
                        paramPath: presetParam.paramPath,
                        paramName: presetParam.name,
                        paramMax: presetParam.max,
                        vstName: presetParam.vstName,
                        vstPath: presetParam.vstPath,
                        needsConfiguration: presetParam.needsConfiguration || false
                    };
                    if (presetParam.needsConfiguration) {
                        post("    -> MELODIC: " + key + " [VST needs configuration]\n");
                    } else {
                        post("    -> MELODIC: " + key + " [" + presetParam.name + "]\n");
                    }
                } else {
                    post("    -> MELODIC: " + key + " (no VST found)\n");
                }
            }
        }
    }
    
    cacheValid = true;
    outlet(0, "refresh_complete");
    
    var drumCount = 0, melodicCount = 0;
    for (var k in drumCache) drumCount++;
    for (var k in melodicCache) melodicCount++;
    post("Scan complete: " + drumCount + "/4 drums, " + melodicCount + "/8 melodic\n");
}

// ============ DEBUG: LIST ALL PARAMETERS ============

function listParams(trackIndex) {
    var trackApi = new LiveAPI();
    trackApi.path = "live_set tracks " + trackIndex;
    
    var trackName = trackApi.get("name").toString();
    var deviceCount = trackApi.getcount("devices");
    
    post("\n=== Track " + trackIndex + ": " + trackName + " ===\n");
    post("Device count: " + deviceCount + "\n\n");
    
    for (var d = 0; d < deviceCount; d++) {
        var deviceApi = new LiveAPI();
        deviceApi.path = "live_set tracks " + trackIndex + " devices " + d;
        
        if (!deviceApi.id || deviceApi.id == 0) continue;
        
        var deviceName = deviceApi.get("name").toString();
        var deviceClass = deviceApi.get("class_name").toString();
        var paramCount = deviceApi.getcount("parameters");
        
        post("--- Device " + d + ": " + deviceName + " (" + deviceClass + ") ---\n");
        post("Parameters (" + paramCount + "):\n");
        
        for (var i = 0; i < paramCount; i++) {
            var paramApi = new LiveAPI();
            paramApi.path = "live_set tracks " + trackIndex + " devices " + d + " parameters " + i;
            var paramName = paramApi.get("name").toString();
            var paramValue = paramApi.get("value");
            post("  [" + i + "] " + paramName + " = " + paramValue + "\n");
        }
        post("\n");
    }
}

// ============ FIND PRESET PARAMETER ============

function findPresetParameter(trackIndex) {
    var trackApi = new LiveAPI();
    trackApi.path = "live_set tracks " + trackIndex;
    var deviceCount = trackApi.getcount("devices");
    
    post("      Searching " + deviceCount + " devices...\n");
    
    var vstDeviceIndex = -1;
    var vstDeviceName = "";
    var vstDevicePath = "";
    
    for (var d = 0; d < deviceCount; d++) {
        var deviceApi = new LiveAPI();
        deviceApi.path = "live_set tracks " + trackIndex + " devices " + d;
        
        if (!deviceApi.id || deviceApi.id == 0) continue;
        
        var deviceName = deviceApi.get("name").toString();
        var deviceClass = deviceApi.get("class_name").toString();
        var paramCount = deviceApi.getcount("parameters");
        
        post("        Device " + d + ": " + deviceName + " (" + deviceClass + ") - " + paramCount + " params\n");
        
        if (deviceClass.indexOf("PluginDevice") >= 0 || 
            deviceClass.indexOf("AuPluginDevice") >= 0 ||
            deviceClass.indexOf("Vst") >= 0) {
            vstDeviceIndex = d;
            vstDeviceName = deviceName;
            vstDevicePath = "live_set tracks " + trackIndex + " devices " + d;
        }
        
        for (var i = 0; i < paramCount; i++) {
            var paramApi = new LiveAPI();
            paramApi.path = "live_set tracks " + trackIndex + " devices " + d + " parameters " + i;
            
            var paramName = paramApi.get("name").toString();
            var lowerName = paramName.toLowerCase();
            
            if (lowerName.indexOf("preset") >= 0 || 
                lowerName.indexOf("program") >= 0 ||
                lowerName.indexOf("patch") >= 0) {
                post("        FOUND: " + paramName + " in device " + d + "\n");
                return {
                    trackPath: "live_set tracks " + trackIndex,
                    paramPath: paramApi.path,
                    name: paramName,
                    max: paramApi.get("max"),
                    deviceIndex: d,
                    vstName: deviceName
                };
            }
        }
    }
    
    if (vstDeviceIndex >= 0) {
        post("        VST found but no preset param exposed: " + vstDeviceName + "\n");
        post("        >>> To fix: In Live, click 'Configure' on VST, then move preset knob <<<\n");
        return {
            trackPath: "live_set tracks " + trackIndex,
            paramPath: null,
            name: "(needs config)",
            max: 127,
            deviceIndex: vstDeviceIndex,
            vstName: vstDeviceName,
            vstPath: vstDevicePath,
            needsConfiguration: true
        };
    }
    
    return null;
}

// ============ SET DRUM CHAIN ============

function setDrumChain(trackKey, value) {
    if (!drumCache[trackKey]) {
        post("setDrumChain: " + trackKey + " not in cache\n");
        return;
    }
    
    var cache = drumCache[trackKey];
    
    var trackApi = new LiveAPI();
    trackApi.path = cache.path;
    var deviceCount = trackApi.getcount("devices");
    
    for (var d = 0; d < deviceCount; d++) {
        var deviceApi = new LiveAPI();
        deviceApi.path = cache.path + " devices " + d;
        
        if (!deviceApi.id || deviceApi.id == 0) continue;
        
        var deviceClass = deviceApi.get("class_name").toString();
        var paramCount = deviceApi.getcount("parameters");
        
        for (var i = 0; i < paramCount; i++) {
            var paramApi = new LiveAPI();
            paramApi.path = cache.path + " devices " + d + " parameters " + i;
            
            var paramName = paramApi.get("name").toString();
            
            if (paramName === "Chain Selector" || 
                paramName === "Chain" ||
                paramName.indexOf("Chain") >= 0) {
                post("setDrumChain: " + trackKey + " -> " + value + " (device " + d + ", param '" + paramName + "')\n");
                paramApi.set("value", value);
                return;
            }
        }
    }
    
    post("setDrumChain: " + trackKey + " - Chain Selector NOT FOUND in " + deviceCount + " devices\n");
}

// ============ SET MELODIC PRESET ============

function setMelodicPreset(trackKey, value) {
    currentValues[trackKey] = value;
    post("setMelodicPreset: " + trackKey + " -> PC " + value + " (queued)\n");
    queuePC(trackKey, value);  // Use queue instead of direct outlet
}

// ============ INDIVIDUAL SETTERS (called from pattr) ============

var currentValues = {
    kick: 0, snare: 0, hihat: 0, cymbals: 0,
    bass_electric: 0, bass_synth: 0, pad1: 0, pad2: 0,
    piano1: 0, piano2: 0, lead1: 0, lead2: 0
};

function kick(v) { 
    currentValues.kick = v;
    setDrumChain("kick", v); 
}
function snare(v) { 
    currentValues.snare = v;
    setDrumChain("snare", v); 
}
function hihat(v) { 
    currentValues.hihat = v;
    setDrumChain("hihat", v); 
}
function cymbals(v) { 
    currentValues.cymbals = v;
    setDrumChain("cymbals", v); 
}

function bass_electric(v) { 
    currentValues.bass_electric = v;
    setMelodicPreset("bass_electric", v); 
}
function bass_synth(v) { 
    currentValues.bass_synth = v;
    setMelodicPreset("bass_synth", v); 
}
function pad1(v) { 
    currentValues.pad1 = v;
    setMelodicPreset("pad1", v); 
}
function pad2(v) { 
    currentValues.pad2 = v;
    setMelodicPreset("pad2", v); 
}
function piano1(v) { 
    currentValues.piano1 = v;
    setMelodicPreset("piano1", v); 
}
function piano2(v) { 
    currentValues.piano2 = v;
    setMelodicPreset("piano2", v); 
}
function lead1(v) { 
    currentValues.lead1 = v;
    setMelodicPreset("lead1", v); 
}
function lead2(v) { 
    currentValues.lead2 = v;
    setMelodicPreset("lead2", v); 
}

// ============ SEND ALL ============

function sendAll() {
    post("sendAll called\n");
    post("  values: kick=" + currentValues.kick + " snare=" + currentValues.snare + "\n");
    
    var drumCount = 0, melodicCount = 0;
    for (var k in drumCache) drumCount++;
    for (var k in melodicCache) melodicCount++;
    post("  drumCache has " + drumCount + " entries\n");
    post("  melodicCache has " + melodicCount + " entries\n");
    
    setDrumChain("kick", currentValues.kick);
    setDrumChain("snare", currentValues.snare);
    setDrumChain("hihat", currentValues.hihat);
    setDrumChain("cymbals", currentValues.cymbals);
    
    setMelodicPreset("bass_electric", currentValues.bass_electric);
    setMelodicPreset("bass_synth", currentValues.bass_synth);
    setMelodicPreset("pad1", currentValues.pad1);
    setMelodicPreset("pad2", currentValues.pad2);
    setMelodicPreset("piano1", currentValues.piano1);
    setMelodicPreset("piano2", currentValues.piano2);
    setMelodicPreset("lead1", currentValues.lead1);
    setMelodicPreset("lead2", currentValues.lead2);
    
    resetVolumes();
    
    outlet(0, "sent_all");
}

// ============ FX MACROS ============

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
var fxCache = {};

function findFXDevice(trackIndex) {
    var trackApi = new LiveAPI();
    trackApi.path = "live_set tracks " + trackIndex;
    var deviceCount = trackApi.getcount("devices");
    
    for (var d = 0; d < deviceCount; d++) {
        var deviceApi = new LiveAPI();
        deviceApi.path = "live_set tracks " + trackIndex + " devices " + d;
        if (!deviceApi.id || deviceApi.id == 0) continue;
        
        var deviceName = deviceApi.get("name").toString();
        if (deviceName.indexOf("[FX]") >= 0 || deviceName.indexOf("[fx]") >= 0) {
            return {
                deviceIndex: d,
                devicePath: "live_set tracks " + trackIndex + " devices " + d,
                deviceName: deviceName
            };
        }
    }
    return null;
}

function scanFX() {
    fxCache = {};
    var api = new LiveAPI();
    api.path = "live_set";
    var trackCount = api.getcount("tracks");
    
    for (var i = 0; i < trackCount; i++) {
        var trackApi = new LiveAPI();
        trackApi.path = "live_set tracks " + i;
        var trackName = trackApi.get("name").toString();
        var isFoldable = trackApi.get("is_foldable") == 1;
        
        for (var fxKey in FX_TARGETS) {
            var target = FX_TARGETS[fxKey];
            var searchUpper = target.search.toUpperCase();
            var nameUpper = trackName.toUpperCase();
            
            var matches = false;
            if (target.isGroup) {
                matches = (nameUpper.indexOf(searchUpper) >= 0) && isFoldable;
            } else {
                matches = (nameUpper === searchUpper);
            }
            
            if (matches) {
                var fxDevice = findFXDevice(i);
                if (fxDevice) {
                    fxCache[fxKey] = {
                        index: i,
                        devicePath: fxDevice.devicePath
                    };
                    post("FX: " + fxKey + " -> track " + i + "\n");
                }
            }
        }
    }
}

function capture_fx() {
    if (Object.keys(fxCache).length == 0) scanFX();
    
    for (var i = 0; i < FX_ORDER.length; i++) {
        var fxKey = FX_ORDER[i];
        var cache = fxCache[fxKey];
        
        if (!cache) {
            outlet(0, fxKey + "_fx", 0, 0, 0, 0, 0, 0, 0, 0, 0);
            continue;
        }
        
        var macros = [];
        var deviceApi = new LiveAPI();
        deviceApi.path = cache.devicePath;
        
        for (var m = 1; m <= 9; m++) {
            var paramApi = new LiveAPI();
            paramApi.path = cache.devicePath + " parameters " + m;
            macros.push(Math.round(paramApi.get("value")));
        }
        
        outlet(0, fxKey + "_fx", macros[0], macros[1], macros[2], macros[3], 
               macros[4], macros[5], macros[6], macros[7], macros[8]);
    }
    outlet(0, "fx_captured");
}

function applyFX(fxKey, values) {
    if (Object.keys(fxCache).length == 0) scanFX();
    var cache = fxCache[fxKey];
    if (!cache) return;
    
    for (var i = 0; i < 9 && i < values.length; i++) {
        var paramApi = new LiveAPI();
        paramApi.path = cache.devicePath + " parameters " + (i + 1);
        paramApi.set("value", values[i]);
    }
}

function drums_fx() { applyFX("drums", arrayfromargs(arguments)); }
function bass_fx() { applyFX("bass", arrayfromargs(arguments)); }
function pads_fx() { applyFX("pads", arrayfromargs(arguments)); }
function pianos_fx() { applyFX("pianos", arrayfromargs(arguments)); }
function leads_fx() { applyFX("leads", arrayfromargs(arguments)); }
function loops_fx() { applyFX("loops", arrayfromargs(arguments)); }
function vocoder_fx() { applyFX("vocoder", arrayfromargs(arguments)); }
function vocals_fx() { applyFX("vocals", arrayfromargs(arguments)); }
function resample_fx() { applyFX("resample", arrayfromargs(arguments)); }

// ============ VOLUME RESET ============

var VOL_DEFAULT = 0.70;
var VOL_BASS_ELECTRIC = 0.85;
var VOL_RESAMPLE = 0.85;
var VOL_SCRATCHER = 0.36;
var VOL_VOCALS = 0.625;
var VOL_MASTER = 0.85;        // 0 dB; VOL_DEFAULT 0.70 = -6 dB

var VOLUME_EXCEPTIONS = {
    "Bass Electric": VOL_BASS_ELECTRIC,
    "Resample": VOL_RESAMPLE,
    "Live Scratcher": VOL_SCRATCHER,
    "Vocals": VOL_VOCALS
};

function resetVolumes() {
    var api = new LiveAPI();
    api.path = "live_set";
    
    var trackCount = api.getcount("tracks");
    var resetCount = 0;
    
    post("resetVolumes: scanning " + trackCount + " tracks...\n");
    
    for (var i = 0; i < trackCount; i++) {
        var trackApi = new LiveAPI();
        trackApi.path = "live_set tracks " + i;
        
        if (!trackApi.id || trackApi.id == 0) continue;
        
        var trackName = trackApi.get("name").toString();
        var targetVol = VOL_DEFAULT;
        
        for (var excName in VOLUME_EXCEPTIONS) {
            if (trackName === excName) {
                targetVol = VOLUME_EXCEPTIONS[excName];
                break;
            }
        }
        
        var mixerApi = new LiveAPI();
        mixerApi.path = "live_set tracks " + i + " mixer_device volume";
        
        if (mixerApi.id && mixerApi.id != 0) {
            mixerApi.set("value", targetVol);
            resetCount++;
        }
    }
    
    var returnCount = api.getcount("return_tracks");
    for (var r = 0; r < returnCount; r++) {
        var returnApi = new LiveAPI();
        returnApi.path = "live_set return_tracks " + r + " mixer_device volume";
        
        if (returnApi.id && returnApi.id != 0) {
            returnApi.set("value", VOL_DEFAULT);
            resetCount++;
        }
    }
    
    var masterApi = new LiveAPI();
    masterApi.path = "live_set master_track mixer_device volume";
    
    if (masterApi.id && masterApi.id != 0) {
        masterApi.set("value", VOL_MASTER);
        resetCount++;
    }
    
    post("resetVolumes: " + resetCount + " tracks reset\n");
    outlet(0, "volumes_reset");
}
