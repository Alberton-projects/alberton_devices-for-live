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
           ["Program Change", "Chain Selector"] + ["Macro %d" % n for n in range(1, 17)] + ["None"], varname="action")
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


FX_KEYS = ["drums", "bass", "pads", "pianos", "leads", "loops", "vocoder", "vocals", "resample"]


def kit_selector_v5():
    folder = os.path.join(ROOT, "devices", "kit-selector")
    p = Patcher("midi", 1170, 169)
    # the sixteen strips: two rows of eight, program above volume, the track's name on top
    subscribe = []
    for n in range(1, 17):
        col, row = (n - 1) % 8, (n - 1) // 8
        x, y = 8 + 66 * col, 4 + 78 * row
        p.comment("obj-lab%d" % n, "Strip %d" % n, [x, y, 64, 12], 8.0)
        p.boxes[-1]["varname"] = "lab%d" % n
        p.dial("obj-p%d" % n, "Program %d" % n, [x, y + 14, 62, 26], initial=0, shortname="P%d" % n, varname="p%d" % n, tiny=True)
        p.boxes[-1]["showname"] = 0
        p.dial("obj-v%d" % n, "Volume %d" % n, [x, y + 44, 62, 26], initial=0.85, lo=0, hi=1, unit=1, shortname="V%d" % n, varname="v%d" % n, is_float=True, tiny=True)
        p.boxes[-1]["showname"] = 0
        p.newobj("obj-pp%d" % n, "prepend p%d" % n, [40 + 60 * col, 500 + 60 * row])
        p.newobj("obj-pv%d" % n, "prepend v%d" % n, [40 + 60 * col, 530 + 60 * row])
        p.line("obj-p%d" % n, 0, "obj-pp%d" % n, 0); p.line("obj-pp%d" % n, 0, "obj-js", 0)
        p.line("obj-v%d" % n, 0, "obj-pv%d" % n, 0); p.line("obj-pv%d" % n, 0, "obj-js", 0)
        subscribe += ["subscribe p%d" % n, "subscribe v%d" % n]
    # kits: the preset grid, the name, the recall by MIDI, and the settings
    # the kit grid: 32 kits, three rows of eleven, big enough to hit on stage
    p.box("obj-preset", "preset", rect=[548, 4, 236, 72], bubblesize=16, numinlets=1, numoutlets=5,
          outlettype=["preset", "int", "preset", "int", ""], pattrstorage="kits")
    p.box("obj-name", "textedit", rect=[548, 80, 236, 18], keymode=1, numinlets=1, numoutlets=4, outlettype=["", "int", "", ""],
          parameter_enable=0, fontsize=10.0, bgcolor=[0.2, 0.2, 0.2, 1.0], textcolor=[0.9, 0.9, 0.9, 1.0], varname="presetname")
    subscribe.append("subscribe presetname")
    p.textbutton("obj-send", "Send", [548, 102, 56, 18], longname="Send", varname="send")
    p.textbutton("obj-refresh", "Refresh", [608, 102, 56, 18], longname="Refresh", varname="refreshbtn")
    p.textbutton("obj-capture", "FX Capture", [668, 102, 70, 18], longname="FX Capture", varname="fxcapture")
    p.comment("obj-l-midich", "MIDI Ch", [548, 124, 40, 12], 8.0)
    p.numbox("obj-midich", "MIDI Ch", [548, 138, 36, 15], initial=1, lo=1, hi=16, shortname="MIDICh", varname="midich")
    p.comment("obj-l-bus", "Bus", [592, 124, 36, 12], 8.0)
    p.numbox("obj-bus", "Bus", [592, 138, 36, 15], initial=1, lo=1, hi=4, varname="bus")
    p.comment("obj-l-main", "Main", [640, 124, 60, 12], 8.0)
    p.dial("obj-vmain", "Main Volume", [640, 138, 60, 26], initial=0.85, lo=0, hi=1, unit=1, shortname="Main", varname="vmain", is_float=True, tiny=True)
    p.boxes[-1]["showname"] = 0
    subscribe.append("subscribe vmain")
    # the fx banks (V5.0: by group name), 70x40 as in V4.3, in two rows
    for i, key in enumerate(FX_KEYS):
        col, row = i % 5, i // 5
        x, y = 796 + 74 * col, 4 + 68 * row
        p.comment("obj-lfx-" + key, key, [x, y, 70, 12], 8.0)
        p.box("obj-" + key, "multislider", rect=[x, y + 14, 70, 40], parameter_enable=1, numinlets=1, numoutlets=2, outlettype=["", ""],
              saved_attribute_attributes={"valueof": {"parameter_invisible": 1, "parameter_longname": key + "_fx", "parameter_modmode": 0,
                                                      "parameter_shortname": key + "_fx", "parameter_type": 3}},
              setminmax=[0.0, 127.0], setstyle=1, size=9, varname=key + "_fx")
        p.params["obj-" + key] = [key + "_fx", key + "_fx", 0]
        p.box("obj-pattr-" + key, "newobj", rect=[900 + 60 * i, 700, 200, 20], presentation=False,
              text="pattr @bindto %s_fx @autorestore 1" % key, numinlets=1, numoutlets=3, outlettype=["", "", ""],
              saved_object_attributes={"parameter_enable": 0, "parameter_mappable": 0}, varname="pattr_" + key)
        p.newobj("obj-pfx-" + key, "prepend %s_fx" % key, [900 + 60 * i, 740])
        p.line("obj-" + key, 0, "obj-pfx-" + key, 0)            # a slider edited by hand
        p.line("obj-pattr-" + key, 0, "obj-pfx-" + key, 0)      # a slider recalled with a kit
        p.line("obj-pfx-" + key, 0, "obj-js", 0)
        p.line("obj-fxroute", i, "obj-" + key, 0)               # a slider captured from Live
        subscribe.append("subscribe %s_fx" % key)
    p.newobj("obj-fxroute", "route " + " ".join(k + "_fx" for k in FX_KEYS), [900, 660], n_out=10, outlettype=[""] * 10)
    p.message("obj-capmsg", "capture_fx", [652, 660])
    p.line("obj-capture", 0, "obj-capmsg", 0); p.line("obj-capmsg", 0, "obj-js", 0)
    # storage: subscribe mode, so nothing but the members above is ever part of a kit
    p.box("obj-auto", "newobj", rect=[40, 300, 140, 20], presentation=False, text="autopattr @greedy 1",
          numinlets=1, numoutlets=4, outlettype=["", "", "", ""], varname="u_auto")
    p.box("obj-ps", "newobj", rect=[40, 340, 330, 20], presentation=False,
          text="pattrstorage kits @parameter_enable 1 @subscribemode 1", numinlets=1, numoutlets=3, outlettype=["", "", ""],
          saved_attribute_attributes={"valueof": {"parameter_invisible": 1, "parameter_longname": "kits", "parameter_modmode": 0,
                                                  "parameter_shortname": "kits", "parameter_type": 3}},
          saved_object_attributes={"parameter_enable": 1, "parameter_mappable": 0, "subscribemode": 1}, varname="kits")
    p.params["obj-ps"] = ["kits", "kits", 0]
    p.newobj("obj-lb", "loadbang", [400, 300], n_in=0); p.newobj("obj-del", "delay 200", [400, 340])
    p.message("obj-sub", ", ".join(subscribe), [400, 380])
    p.line("obj-lb", 0, "obj-del", 0); p.line("obj-del", 0, "obj-sub", 0); p.line("obj-sub", 0, "obj-ps", 0)
    p.newobj("obj-prec", "prepend recalled", [600, 380])
    p.line("obj-preset", 1, "obj-prec", 0); p.line("obj-prec", 0, "obj-js", 0)
    # recall by MIDI program change on the chosen channel
    p.newobj("obj-in", "midiin", [1200, 300], n_in=0, n_out=1)
    p.newobj("obj-parse", "midiparse", [1200, 340], n_in=1, n_out=7, outlettype=[""] * 7)
    p.newobj("obj-eq", "== 1", [1300, 380], n_in=2)
    p.newobj("obj-gate", "gate", [1200, 420], n_in=2)
    p.newobj("obj-plus", "+ 1", [1200, 460])
    p.message("obj-recall", "recall $1", [1200, 500])
    p.newobj("obj-out", "midiout", [1400, 340], n_out=0, outlettype=[])
    for a, o, b, i in [("obj-in", 0, "obj-parse", 0), ("obj-parse", 6, "obj-eq", 0), ("obj-midich", 0, "obj-eq", 1),
                       ("obj-eq", 0, "obj-gate", 0), ("obj-parse", 3, "obj-gate", 1), ("obj-gate", 0, "obj-plus", 0),
                       ("obj-plus", 0, "obj-recall", 0), ("obj-recall", 0, "obj-ps", 0), ("obj-in", 0, "obj-out", 0)]:
        p.line(a, o, b, i)
    # the script, the bus, the buttons
    p.js("obj-js", "kit-selector.js", [40, 800], n_out=3)
    p.newobj("obj-send-obj", "s ks1", [40, 860], n_out=0, outlettype=[])
    p.newobj("obj-ret", "r ks1_ret", [200, 760], n_in=0, n_out=1)
    p.newobj("obj-this", "live.thisdevice", [40, 240], n_in=1, n_out=3, outlettype=["bang", "int", "int"])
    p.newobj("obj-delay", "delay 500", [40, 270])
    p.message("obj-init", "init", [140, 270])
    p.message("obj-sendall", "sendall", [548, 660]); p.message("obj-refreshmsg", "refresh", [600, 660])
    p.newobj("obj-pvmain", "prepend vmain", [640, 700]); p.newobj("obj-pbus", "prepend bus", [590, 700])
    for a, o, b, i in [("obj-this", 0, "obj-delay", 0), ("obj-delay", 0, "obj-init", 0), ("obj-init", 0, "obj-js", 0),
                       ("obj-js", 0, "obj-send-obj", 0), ("obj-js", 1, "obj-ret", 0), ("obj-ret", 0, "obj-js", 0),
                       ("obj-js", 2, "obj-fxroute", 0),
                       ("obj-send", 0, "obj-sendall", 0), ("obj-sendall", 0, "obj-js", 0),
                       ("obj-refresh", 0, "obj-refreshmsg", 0), ("obj-refreshmsg", 0, "obj-js", 0),
                       ("obj-vmain", 0, "obj-pvmain", 0), ("obj-pvmain", 0, "obj-js", 0),
                       ("obj-bus", 0, "obj-pbus", 0), ("obj-pbus", 0, "obj-js", 0)]:
        p.line(a, o, b, i)
    with open(os.path.join(folder, "kit-selector.js"), "rb") as f:
        script = f.read()
    path = os.path.join(folder, "Alberton Kit Selector V5.amxd")
    data = p.write(path, scripts={"kit-selector.js": script})
    print("  %-32s %6d bytes" % (os.path.basename(path), len(data)))


BUILDERS = {"kit-receiver": kit_receiver, "kit-selector-v5": kit_selector_v5}

if __name__ == "__main__":
    for name in (sys.argv[1:] or BUILDERS):
        BUILDERS[name]()
