/*
    Alberton Gamepad -- clip and scene firing (slot-fire.js)
    ========================================================
    The pad's buttons fire clip slots on one chosen track, and scenes. The track is chosen
    on a menu that this script fills with the set's track names; the choice is kept BY
    NAME and saved with the Live set through a pattr in the patcher, so it survives
    reopening the set even if tracks were added or moved meanwhile. The menu itself only
    shows the choice.

    Inlet 0:  refresh | int (the menu's choice) | list <state> <slot> | scene <state> <n>
              | restore <name...> (from the pattr) | debug <0|1>

    The menu stays a Live parameter because a live.menu only takes its list through
    _parameter_range in parameter mode. Its own saved value is never trusted: Live restores
    it against the placeholder list saved in the patcher, so it is clamped and meaningless.
    An int that arrives before the first scan is ignored; the pattr's name wins.
    Outlet 0: status -- fired <slot>, scene_fired <n>
    Outlet 1: the menu -- _parameter_range <names...>, then set <index>
    Outlet 2: the pattr -- the chosen track's name, to be saved with the set

    2026-09-09, Phase 1 of the repository plan: firing uses the chosen index, one Live API
    object per fire instead of a walk over every track; a Live API observer refreshes the
    list when tracks change; every Live API access is guarded; post() is silent unless
    "debug 1" is sent.
*/

autowatch = 1;
inlets = 1;
outlets = 3;

// ============ LOGGING ============

var DEBUG = 0;

function log(s) {
    if (DEBUG) post(s + "\n");
}

function warn(s) {
    post("Gamepad: " + s + "\n");
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

var track_names = [];          // the set's tracks, in order, as last scanned
var target_track_index = 0;    // where clip slots fire
var selected_name = "";        // the chosen track, by name: what the pattr saves

function loadbang() {
    log("slot-fire.js loaded");
}

// Called by the patcher 500 ms after live.thisdevice, and by the refresh button.
function init() {
    refresh();
}

function refresh() {
    scan_tracks();
    if (track_names.length === 0) return;   // the Live API was not ready: nothing to show yet
    update_menu();
    watchTracks();
}

// The scan is lazy after a recompile: the first thing that needs the list rebuilds it.
function ensureScanned() {
    if (track_names.length === 0) refresh();
}

function scan_tracks() {
    guarded("track scan", function () {
        var api = new LiveAPI("live_set");
        var count = api.getcount("tracks");
        var names = [];
        for (var i = 0; i < count; i++) {
            names.push(new LiveAPI("live_set tracks " + i).get("name").toString());
        }
        track_names = names;
        log(count + " tracks scanned");
    });
}

function indexOfName(name) {
    for (var i = 0; i < track_names.length; i++) {
        if (track_names[i] === name) return i;
    }
    return -1;
}

// Fill the menu with the track names, then show the chosen one without sending it back.
function update_menu() {
    outlet(1, ["_parameter_range"].concat(track_names));
    var idx = indexOfName(selected_name);
    if (idx < 0) {
        if (selected_name) warn("track '" + selected_name + "' is not in the set; using the first");
        idx = 0;
    }
    target_track_index = idx;
    outlet(1, "set", idx);
}

// ============ THE MENU ============

// An int from the menu: the user chose a track.
function msg_int(v) {
    ensureScanned();
    if (v < 0 || v >= track_names.length) return;
    target_track_index = v;
    selected_name = track_names[v];
    outlet(2, selected_name);       // the pattr keeps it with the set
    log("track = '" + selected_name + "'");
}

// restore <name...>: the pattr sends the saved name when the set loads (after Live has
// restored it) and after every change. Words arrive as separate arguments.
function restore() {
    var name = "";
    for (var i = 0; i < arguments.length; i++) {
        if (i > 0) name += " ";
        name += arguments[i];
    }
    if (!name || name === "0" || name === selected_name) return;   // "0": the pattr's empty initial value
    selected_name = name;
    if (track_names.length > 0) update_menu();   // before the first scan, init() resolves it
}

// ============ FIRING ============

// list <state> <slot>: a button; fire on press
function list() {
    var a = arrayfromargs(arguments);
    if (a.length >= 2 && parseInt(a[0], 10) === 1) fire_slot(parseInt(a[1], 10));
}

function anything() {
    if (messagename === "scene") {
        if (parseInt(arguments[0], 10) === 1) fire_scene(parseInt(arguments[1], 10));
    }
}

function fire_slot(slot) {
    ensureScanned();
    if (target_track_index < 0 || target_track_index >= track_names.length) return;
    guarded("firing slot " + slot, function () {
        var cs = new LiveAPI("live_set tracks " + target_track_index + " clip_slots " + slot);
        if (!exists(cs)) {
            warn("no clip slot " + slot + " on '" + track_names[target_track_index] + "'");
            return;
        }
        cs.call("fire");
        outlet(0, "fired", slot);
        log("slot " + slot + " on '" + track_names[target_track_index] + "'");
    });
}

function fire_scene(n) {
    guarded("firing scene " + n, function () {
        var scene = new LiveAPI("live_set scenes " + n);
        if (!exists(scene)) {
            warn("no scene " + n);
            return;
        }
        scene.call("fire");
        outlet(0, "scene_fired", n);
        log("scene " + n);
    });
}

// ============ KEEPING THE LIST FRESH ============

var trackObserver = null;
var observing = false;

function watchTracks() {
    if (trackObserver) return;
    guarded("track observer", function () {
        trackObserver = new LiveAPI(onTracksChanged, "live_set");
        trackObserver.property = "tracks";   // fires once at once: skipped below
        observing = true;
    });
}

function onTracksChanged() {
    if (!observing) return;
    scan_tracks();
    update_menu();
    log("tracks changed: list rebuilt");
}

// After a recompile (autowatch, while developing) every var above is back at its initial
// value, but the patcher's controls do not send theirs again. So read them: the pattr
// answers getvalueof() with the saved name. Harmless at a normal load, where the pattr
// sends it anyway; the track list itself is rebuilt on first use.
function syncFromPatcher() {
    try {
        var keeper = patcher.getnamed("track_sel");
        if (keeper) {
            var v = keeper.getvalueof();
            var name = (v instanceof Array) ? v.join(" ") : String(v);
            if (name && name !== "0") selected_name = name;
        }
    } catch (e) {
        warn("could not read the patcher's controls: " + e);
    }
}
var syncTask = new Task(syncFromPatcher, this);
syncTask.schedule(0);
