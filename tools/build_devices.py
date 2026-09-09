#!/usr/bin/env python3
"""Build the devices whose patchers are generated rather than drawn.

    python3 tools/build_devices.py [kit-receiver ...]

Each builder lays out the presentation the user sees, wires the patcher, and writes the
.amxd into its device folder with its script embedded (the release form). Development
installs derive the plain form from it as for any other device. Edit the builder, not the
patcher: the builder is the source.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from patcher import Patcher  # noqa: E402


def kit_receiver():
    folder = os.path.join(ROOT, "devices", "kit-receiver")
    p = Patcher("midi", 270, 100)
    p.comment("obj-title", "Kit Receiver", [8, 4, 120, 16])
    # strip: large and alone, so nothing beside it is touched by accident
    p.comment("obj-l-strip", "Strip", [8, 24, 60, 14], 9.0)
    p.numbox("obj-strip", "Strip", [8, 40, 64, 34], initial=1, lo=1, hi=16, varname="strip")
    p.boxes[-1]["fontsize"] = 24.0
    p.comment("obj-l-bus", "Bus", [84, 24, 36, 14], 9.0)
    p.numbox("obj-bus", "Bus", [84, 40, 36, 15], initial=1, lo=1, hi=4, varname="bus")
    p.comment("obj-l-last", "Last", [84, 60, 36, 14], 9.0)
    p.numbox("obj-last", "Last", [84, 76, 36, 15], initial=0, varname="last")
    p.comment("obj-l-action", "Action", [130, 24, 120, 14], 9.0)
    p.menu("obj-action", "Action", [130, 40, 130, 15],
           ["Program Change", "Chain Selector"] + ["Macro %d" % n for n in range(1, 17)], varname="action")
    p.toggle("obj-applyvol", "Apply Volume", [130, 76, 15, 15], initial=1, shortname="ApplyVol", varname="applyvol")
    p.comment("obj-l-applyvol", "Apply volume", [150, 75, 110, 16], 9.0)
    # the script and what feeds it
    p.js("obj-js", "kit-receiver.js", [40, 300], n_out=4)
    p.newobj("obj-this", "live.thisdevice", [40, 240], n_in=1, n_out=3, outlettype=["bang", "int", "int"])
    p.newobj("obj-delay", "delay 300", [40, 270])
    p.message("obj-init", "init", [140, 270])
    p.newobj("obj-recv", "r ks1", [300, 240], n_in=0, n_out=1)
    p.newobj("obj-ret", "s ks1_ret", [300, 400], n_out=0, outlettype=[])
    for key in ("bus", "strip", "action", "applyvol"):
        p.newobj("obj-p-" + key, "prepend " + key, [500, 240 + 30 * ["bus", "strip", "action", "applyvol"].index(key)])
        p.line("obj-" + key, 0, "obj-p-" + key, 0)
        p.line("obj-p-" + key, 0, "obj-js", 0)
    # MIDI through, with the program change added
    p.newobj("obj-in", "midiin", [800, 240], n_in=0, n_out=1)
    p.newobj("obj-parse", "midiparse", [800, 280], n_in=1, n_out=7, outlettype=[""] * 7)
    p.newobj("obj-format", "midiformat", [800, 360], n_in=7, n_out=1)
    p.newobj("obj-out", "midiout", [800, 400], n_out=0, outlettype=[])
    for a, o, b, i in [("obj-this", 0, "obj-delay", 0), ("obj-delay", 0, "obj-init", 0), ("obj-init", 0, "obj-js", 0),
                       ("obj-recv", 0, "obj-js", 0), ("obj-js", 0, "obj-format", 3), ("obj-js", 1, "obj-last", 0),
                       ("obj-js", 2, "obj-recv", 0), ("obj-js", 3, "obj-ret", 0),
                       ("obj-in", 0, "obj-parse", 0), ("obj-format", 0, "obj-out", 0)]:
        p.line(a, o, b, i)
    for n in range(7):
        p.line("obj-parse", n, "obj-format", n)
    with open(os.path.join(folder, "kit-receiver.js"), "rb") as f:
        script = f.read()
    path = os.path.join(folder, "Alberton Kit Receiver.amxd")
    data = p.write(path, scripts={"kit-receiver.js": script})
    print("  %-32s %6d bytes" % (os.path.basename(path), len(data)))


BUILDERS = {"kit-receiver": kit_receiver}

if __name__ == "__main__":
    for name in (sys.argv[1:] or BUILDERS):
        BUILDERS[name]()
