autowatch = 1;
inlets = 1;
outlets = 2;

// Inlet 0: int (track index), list (slot fire), "scene", "refresh"
// Outlet 0: status
// Outlet 1: _parameter_range message for live.menu

var target_track_index = 0;
var track_names = [];

function loadbang() {
    post("=== slot-fire.js v8.0 loaded ===\n");
}

function init() {
    // Called from live.thisdevice when API is ready
    scan_tracks();
    update_menu();
}

function anything() {
    if (messagename === "scene") {
        var state = parseInt(arguments[0]);
        var scene_num = parseInt(arguments[1]);
        if (state == 1) fire_scene(scene_num);
    }
}

function list() {
    var a = arrayfromargs(arguments);
    if (a.length >= 2) {
        var state = parseInt(a[0]);
        var slot = parseInt(a[1]);
        if (state == 1) fire_slot(slot);
    }
}

function msg_int(v) {
    target_track_index = v;
    if (v >= 0 && v < track_names.length) {
        post("Gamepad: Track = '" + track_names[v] + "'\n");
    }
}

function refresh() {
    post("Gamepad: Refresh triggered\n");
    scan_tracks();
    update_menu();
}

function scan_tracks() {
    track_names = [];
    try {
        var api = new LiveAPI("live_set");
        var tracks = api.get("tracks");
        var count = tracks.length / 2;
        for (var i = 0; i < count; i++) {
            var t = new LiveAPI("live_set tracks " + i);
            var name = t.get("name");
            if (name) track_names.push(name.toString());
        }
        post("Gamepad: " + track_names.length + " tracks scanned\n");
    } catch(e) {
        post("Gamepad ERROR: " + e + "\n");
    }
}

function update_menu() {
    // Send _parameter_range to live.menu via outlet 1
    // Format: _parameter_range item1 item2 item3 ...
    var msg = ["_parameter_range"].concat(track_names);
    outlet(1, msg);
    post("Gamepad: Menu range updated\n");
}

function fire_slot(slot) {
    if (target_track_index < 0 || target_track_index >= track_names.length) return;
    var target_name = track_names[target_track_index];
    try {
        var api = new LiveAPI("live_set");
        var tracks = api.get("tracks");
        for (var i = 0; i < tracks.length / 2; i++) {
            var t = new LiveAPI("live_set tracks " + i);
            if (t.get("name").toString() == target_name) {
                var cs = new LiveAPI("live_set tracks " + i + " clip_slots " + slot);
                cs.call("fire");
                post("Gamepad: Slot " + slot + " on '" + target_name + "'\n");
                outlet(0, "fired", slot);
                return;
            }
        }
    } catch(e) {
        post("Gamepad ERROR: " + e + "\n");
    }
}

function fire_scene(scene_num) {
    try {
        var scene = new LiveAPI("live_set scenes " + scene_num);
        scene.call("fire");
        post("Gamepad: Scene " + scene_num + " fired\n");
        outlet(0, "scene_fired", scene_num);
    } catch(e) {
        post("Gamepad ERROR: " + e + "\n");
    }
}
