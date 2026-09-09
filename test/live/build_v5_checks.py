#!/usr/bin/env python3
"""Three throwaway devices that settle the Kit Selector V5 design in Live (docs/PLAN.md §3).

    python3 test/live/build_v5_checks.py            # writes them into the User Library

1. Test V5 Panel (MIDI effect): two dials, Strip and Value; a change sends
   "prog <strip> <value>" and "fx <strip> v1..v8" on one Max send, ks1.
2. Test V5 FX Receiver (audio effect, to sit INSIDE an Audio Effect Rack chain): listens on
   ks1, keeps only its own strip, shows a received program on Got, and writes the eight fx
   values to macros 1-8 of the rack it lives in, found by this_device canonical_parent
   canonical_parent; Written shows how many.
3. Test V5 Kits (MIDI effect): dials A and G, autopattr @greedy 1, a pattrstorage in
   subscribe mode subscribed to A only; Store and Recall buttons with a Slot number. If G
   survives a recall, subscribe mode keeps global settings out of the kits.

Everything is driven and read over the Live Object Model; nothing needs the Max editor.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "tools"))
from patcher import Patcher  # noqa: E402

UL = os.path.expanduser("~/Music/Ableton/User Library")
MIDI_DIR = os.path.join(UL, "Presets", "MIDI Effects", "Max MIDI Effect")
AUDIO_DIR = os.path.join(UL, "Presets", "Audio Effects", "Max Audio Effect")

PANEL_JS = b"""// Test V5 Panel: one send for everything, the strip number inside the message.
inlets = 1;
outlets = 2;   // 0: the bus, 1: the strip a receiver last announced on the reply channel
var curStrip = 1;
var curValue = 0;
function strip(v) { curStrip = v; }
function who() { outlet(0, "who"); }
function bound(strip, name) { outlet(1, strip); post("panel: strip " + strip + " is '" + name + "'\\n"); }
function value(v) {
    curValue = v;
    outlet(0, "prog", curStrip, curValue);
    var m = ["fx", curStrip];
    for (var i = 0; i < 8; i++) m.push(Math.min(127, curValue + i));
    outlet(0, m);
}
"""

FXRECV_JS = b"""// Test V5 FX Receiver: keeps its own strip; writes the macros of the rack it lives in.
inlets = 1;
outlets = 2;   // 0: the program received, 1: how many macros were written
var myStrip = 1;
function fxstrip(v) { myStrip = v; }
function prog(strip, v) { if (strip === myStrip) outlet(0, v); }
function fx() {
    var a = arrayfromargs(arguments);
    if (a[0] !== myStrip) return;
    try {
        // Probe first: what does LiveAPI.id hold for a path that does not exist? A number 0
        // (code 6), the string "0" (code 7), or something else (code 5). Shown on Written
        // whenever this device is not inside a rack.
        var bad = new LiveAPI("live_set tracks 999 devices 0");
        var probe = (bad.id === 0) ? 6 : ((bad.id === "0") ? 7 : 5);
        post("fx receiver: invalid id is " + typeof bad.id + " " + bad.id + " (unquotedpath '" + bad.unquotedpath + "')\\n");
        var rack = new LiveAPI("this_device canonical_parent canonical_parent");
        var cls = String(rack.get("class_name"));
        post("fx receiver: parent is '" + rack.unquotedpath + "' (" + cls + ")\\n");
        if (cls.indexOf("Group") < 0) { outlet(1, probe); return; }
        var n = 0;
        for (var i = 1; i <= 8 && i < a.length; i++) {
            var p = new LiveAPI(rack.unquotedpath + " parameters " + i);
            if (p.id !== 0 && p.id !== "0") { p.set("value", a[i]); n++; }
        }
        outlet(1, n);
    } catch (e) {
        post("fx receiver: " + e + "\\n");
        outlet(1, -1);
    }
}
"""


def panel():
    p = Patcher("midi", 220, 70)
    p.comment("obj-t", "Test V5 Panel", [8, 4, 120, 16])
    p.comment("obj-ls", "Strip", [8, 24, 44, 14], 9.0)
    p.numbox("obj-strip", "Strip", [8, 40, 44, 15], initial=1, lo=1, hi=16, varname="strip")
    p.comment("obj-lv", "Value", [60, 24, 44, 14], 9.0)
    p.numbox("obj-value", "Value", [60, 40, 44, 15], initial=0, varname="value")
    p.comment("obj-lb", "Bound", [112, 24, 44, 14], 9.0)
    p.numbox("obj-bound", "Bound", [112, 40, 44, 15], initial=0, lo=0, hi=16, varname="bound")
    p.button("obj-who", "Who", [164, 40, 40, 15], varname="who")
    p.newobj("obj-rret", "r ks1_ret", [600, 300], n_in=0, n_out=1)
    p.newobj("obj-ps", "prepend strip", [40, 300]); p.newobj("obj-pv", "prepend value", [200, 300])
    p.js("obj-js", "v5-panel-test.js", [40, 340], n_out=2); p.newobj("obj-send", "s ks1", [40, 380], n_out=0, outlettype=[])
    p.line("obj-rret", 0, "obj-js", 0); p.line("obj-js", 1, "obj-bound", 0); p.line("obj-who", 0, "obj-js", 0)
    p.newobj("obj-in", "midiin", [400, 300], n_in=0, n_out=1); p.newobj("obj-out", "midiout", [400, 340], n_out=0, outlettype=[])
    for a, b in [("obj-strip", "obj-ps"), ("obj-ps", "obj-js"), ("obj-value", "obj-pv"), ("obj-pv", "obj-js"), ("obj-js", "obj-send"), ("obj-in", "obj-out")]:
        p.line(a, 0, b, 0)
    return p, {"v5-panel-test.js": PANEL_JS}


def fxrecv():
    p = Patcher("audio", 220, 70)
    p.comment("obj-t", "Test V5 FX Receiver", [8, 4, 160, 16])
    p.comment("obj-l1", "FX strip", [8, 24, 48, 14], 9.0)
    p.numbox("obj-strip", "FX Strip", [8, 40, 44, 15], initial=1, lo=1, hi=16, varname="fxstrip", shortname="FXStrip")
    p.comment("obj-l2", "Got", [64, 24, 44, 14], 9.0)
    p.numbox("obj-got", "Got", [64, 40, 44, 15], initial=0, varname="got")
    p.comment("obj-l3", "Written", [120, 24, 50, 14], 9.0)
    p.numbox("obj-written", "Written", [120, 40, 44, 15], initial=0, lo=-1, hi=8, varname="written")
    p.newobj("obj-recv", "r ks1", [40, 300], n_in=0, n_out=1)
    p.newobj("obj-ps", "prepend fxstrip", [300, 300])
    p.js("obj-js", "v5-fxrecv-test.js", [40, 340], n_out=2)
    p.newobj("obj-pin", "plugin~", [500, 300], n_in=0, n_out=2, outlettype=["signal", "signal"])
    p.newobj("obj-pout", "plugout~", [500, 340], n_in=2, n_out=0, outlettype=[])
    for a, o, b, i in [("obj-recv", 0, "obj-js", 0), ("obj-strip", 0, "obj-ps", 0), ("obj-ps", 0, "obj-js", 0),
                       ("obj-js", 0, "obj-got", 0), ("obj-js", 1, "obj-written", 0), ("obj-pin", 0, "obj-pout", 0), ("obj-pin", 1, "obj-pout", 1)]:
        p.line(a, o, b, i)
    return p, {"v5-fxrecv-test.js": FXRECV_JS}


def kits():
    p = Patcher("midi", 300, 80)
    p.comment("obj-t", "Test V5 Kits", [8, 4, 120, 16])
    p.dial("obj-a", "A", [8, 24, 41, 48], varname="a")
    p.dial("obj-g", "G", [56, 24, 41, 48], varname="g")
    p.comment("obj-ls", "Slot", [110, 24, 40, 14], 9.0)
    p.numbox("obj-slot", "Slot", [110, 40, 40, 15], initial=1, lo=1, hi=8, varname="slot")
    p.button("obj-store", "Store", [160, 40, 40, 15], varname="store")
    p.button("obj-recall", "Recall", [210, 40, 40, 15], varname="recall")
    p.box("obj-auto", "newobj", rect=[40, 300, 140, 20], presentation=False, text="autopattr @greedy 1",
          numinlets=1, numoutlets=4, outlettype=["", "", "", ""], varname="u_auto")
    p.box("obj-ps", "newobj", rect=[40, 340, 330, 20], presentation=False,
          text="pattrstorage kits @parameter_enable 1 @subscribemode 1", numinlets=1, numoutlets=3, outlettype=["", "", ""],
          saved_attribute_attributes={"valueof": {"parameter_invisible": 1, "parameter_longname": "kits", "parameter_modmode": 0,
                                                  "parameter_shortname": "kits", "parameter_type": 3}},
          saved_object_attributes={"parameter_enable": 1, "parameter_mappable": 0, "subscribemode": 1}, varname="kits")
    p.params["obj-ps"] = ["kits", "kits", 0]
    p.newobj("obj-lb", "loadbang", [400, 300], n_in=0); p.newobj("obj-del", "delay 200", [400, 340])
    p.message("obj-sub", "subscribe a", [400, 380])
    p.newobj("obj-fs", "f", [40, 400], n_in=2); p.newobj("obj-pst", "prepend store", [40, 440])
    p.newobj("obj-fr", "f", [200, 400], n_in=2); p.newobj("obj-prc", "prepend recall", [200, 440])
    p.newobj("obj-in", "midiin", [600, 300], n_in=0, n_out=1); p.newobj("obj-out", "midiout", [600, 340], n_out=0, outlettype=[])
    for a, o, b, i in [("obj-lb", 0, "obj-del", 0), ("obj-del", 0, "obj-sub", 0), ("obj-sub", 0, "obj-ps", 0),
                       ("obj-slot", 0, "obj-fs", 1), ("obj-slot", 0, "obj-fr", 1),
                       ("obj-store", 0, "obj-fs", 0), ("obj-fs", 0, "obj-pst", 0), ("obj-pst", 0, "obj-ps", 0),
                       ("obj-recall", 0, "obj-fr", 0), ("obj-fr", 0, "obj-prc", 0), ("obj-prc", 0, "obj-ps", 0),
                       ("obj-in", 0, "obj-out", 0)]:
        p.line(a, o, b, i)
    return p, None


def main():
    for name, folder, (p, scripts) in [("Test V5 Panel.amxd", MIDI_DIR, panel()),
                                       ("Test V5 FX Receiver.amxd", AUDIO_DIR, fxrecv()),
                                       ("Test V5 Kits.amxd", MIDI_DIR, kits())]:
        path = os.path.join(folder, name)
        data = p.write(path, scripts=scripts)
        print("  %-28s %6d bytes  %s" % (name, len(data), path))


if __name__ == "__main__":
    main()
