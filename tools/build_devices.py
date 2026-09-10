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
    # no argument on purpose: a receive with an argument has no inlet (Max deletes the cord at
    # load), so the script names it with "set ks<bus>" at compile time and at every bus change
    p.newobj("obj-recv", "receive", [300, 240], n_in=1, n_out=1)
    p.newobj("obj-ret", "forward", [300, 400], n_out=0, outlettype=[])
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
    # the fx banks, 70x40 as in V4.3, in two rows, each with the volume of its track under it
    for i, key in enumerate(FX_KEYS):
        col, row = i % 5, i // 5
        x, y = 796 + 74 * col, 4 + 80 * row
        p.comment("obj-lfx-" + key, key, [x, y, 70, 12], 8.0)
        p.dial("obj-fxvol-" + key, "FX Volume " + key, [x, y + 56, 70, 20], initial=0.85, lo=0, hi=1, unit=1,
               shortname="FxV" + key[:4], varname="fxvol_" + key, is_float=True, tiny=True)
        p.boxes[-1]["showname"] = 0
        p.newobj("obj-pfxv-" + key, "prepend fxvol_" + key, [900 + 60 * i, 780])
        p.line("obj-fxvol-" + key, 0, "obj-pfxv-" + key, 0); p.line("obj-pfxv-" + key, 0, "obj-js", 0)
        subscribe.append("subscribe fxvol_" + key)
        p.box("obj-" + key, "multislider", rect=[x, y + 14, 70, 40], parameter_enable=1, numinlets=1, numoutlets=2, outlettype=["", ""],
              saved_attribute_attributes={"valueof": {"parameter_invisible": 1, "parameter_longname": key + "_fx", "parameter_modmode": 0,
                                                      "parameter_shortname": key + "_fx", "parameter_type": 3}},
              setminmax=[0.0, 127.0], setstyle=1, size=9, varname=key + "_fx")
        p.params["obj-" + key] = [key + "_fx", key + "_fx", 0]
        p.box("obj-pattr-" + key, "newobj", rect=[900 + 60 * i, 700, 200, 20], presentation=False,
              text="pattr pattr_%s @bindto %s_fx @autorestore 1" % (key, key), numinlets=1, numoutlets=3, outlettype=["", "", ""],
              saved_object_attributes={"parameter_enable": 0, "parameter_mappable": 0}, varname="pattr_" + key)
        p.newobj("obj-pfx-" + key, "prepend %s_fx" % key, [900 + 60 * i, 740])
        p.line("obj-" + key, 0, "obj-pfx-" + key, 0)            # a slider edited by hand
        p.line("obj-pattr-" + key, 0, "obj-pfx-" + key, 0)      # a slider recalled with a kit
        p.line("obj-pfx-" + key, 0, "obj-js", 0)
        p.line("obj-fxroute", i, "obj-" + key, 0)               # a slider captured from Live
        subscribe.append("subscribe pattr_" + key)   # the pattr is the kit member; a parameter-enabled multislider is not a pattrstorage client
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
    p.newobj("obj-send-obj", "forward", [40, 860], n_out=0, outlettype=[])
    p.newobj("obj-ret", "receive", [200, 760], n_in=1, n_out=1)   # unnamed until the script's "set": with an argument it has no inlet
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


def kit_fx_receiver():
    folder = os.path.join(ROOT, "devices", "kit-fx-receiver")
    p = Patcher("audio", 270, 100)
    p.comment("obj-title", "Kit FX Receiver", [8, 4, 120, 16])
    p.comment("obj-l-bank", "Bank", [8, 24, 60, 14], 9.0)
    p.numbox("obj-bank", "Bank", [8, 40, 64, 34], initial=1, lo=1, hi=9, varname="bank")
    p.boxes[-1]["fontsize"] = 24.0
    p.comment("obj-l-bus", "Bus", [84, 24, 36, 14], 9.0)
    p.numbox("obj-bus", "Bus", [84, 40, 36, 15], initial=1, lo=1, hi=4, varname="bus")
    p.comment("obj-l-applied", "Applied", [84, 60, 50, 14], 9.0)
    p.numbox("obj-applied", "Applied", [84, 76, 36, 15], initial=0, lo=-1, hi=9, varname="applied")
    p.toggle("obj-applyvol", "Apply Volume", [130, 40, 15, 15], initial=1, shortname="ApplyVol", varname="applyvol")
    p.comment("obj-l-applyvol", "Apply volume", [150, 39, 110, 16], 9.0)
    p.comment("obj-hint", "governs the nearest rack", [130, 60, 130, 14], 8.0)
    p.js("obj-js", "kit-fx-receiver.js", [40, 300], n_out=3)
    p.newobj("obj-this", "live.thisdevice", [40, 240], n_in=1, n_out=3, outlettype=["bang", "int", "int"])
    p.newobj("obj-delay", "delay 300", [40, 270])
    p.message("obj-init", "init", [140, 270])
    # no argument on purpose: a receive with an argument has no inlet (Max deletes the cord at
    # load), so the script names it with "set ks<bus>" at compile time and at every bus change
    p.newobj("obj-recv", "receive", [300, 240], n_in=1, n_out=1)
    p.newobj("obj-ret", "forward", [300, 400], n_out=0, outlettype=[])
    for key in ("bus", "bank", "applyvol"):
        p.newobj("obj-p-" + key, "prepend " + key, [500, 240 + 30 * ["bus", "bank", "applyvol"].index(key)])
        p.line("obj-" + key, 0, "obj-p-" + key, 0)
        p.line("obj-p-" + key, 0, "obj-js", 0)
    p.newobj("obj-pin", "plugin~", [800, 240], n_in=0, n_out=2, outlettype=["signal", "signal"])
    p.newobj("obj-pout", "plugout~", [800, 300], n_in=2, n_out=0, outlettype=[])
    for a, o, b, i in [("obj-this", 0, "obj-delay", 0), ("obj-delay", 0, "obj-init", 0), ("obj-init", 0, "obj-js", 0),
                       ("obj-recv", 0, "obj-js", 0), ("obj-js", 0, "obj-ret", 0), ("obj-js", 1, "obj-recv", 0),
                       ("obj-js", 2, "obj-applied", 0), ("obj-pin", 0, "obj-pout", 0), ("obj-pin", 1, "obj-pout", 1)]:
        p.line(a, o, b, i)
    with open(os.path.join(folder, "kit-fx-receiver.js"), "rb") as f:
        script = f.read()
    path = os.path.join(folder, "Alberton Kit FX Receiver.amxd")
    data = p.write(path, scripts={"kit-fx-receiver.js": script})
    print("  %-32s %6d bytes" % (os.path.basename(path), len(data)))


def beat_window():
    """An audio effect that shows the beat in a floating, resizable window.

    The device passes audio through and, every 33 ms, banging `transport` reads the bar and beat
    (a bang polls; it never starts Live's transport). Those go to a `jsui` inside a subpatcher
    whose own `thispatcher` makes its window float and grow and, by polling `window getsize`,
    resizes the `jsui` box to the window so the drawing rescales. `pcontrol` opens and closes
    that window from the Float toggle. Blink (ms) and Flash (on/off) are passed to the drawing.
    """
    folder = os.path.join(ROOT, "devices", "beat-window")
    p = Patcher("audio", 244, 128)
    # the device face: the three controls
    p.comment("obj-title", "Beat Window", [8, 4, 140, 16])
    p.toggle("obj-flash", "Flash", [8, 30, 18, 18], initial=1, varname="flash")
    p.comment("obj-l-flash", "Flash", [30, 32, 60, 14], 9.0)
    p.numbox("obj-blink", "Blink", [8, 58, 52, 16], initial=120, lo=10, hi=1000, shortname="Blink", varname="blink")
    p.comment("obj-l-blink", "Blink (ms)", [64, 60, 80, 14], 9.0)
    p.toggle("obj-float", "Float Window", [8, 86, 18, 18], initial=1, shortname="Float", varname="float")
    p.comment("obj-l-float", "Window", [30, 88, 80, 14], 9.0)

    # audio straight through, so the device is silent to the signal but does not break the chain
    p.newobj("obj-pin", "plugin~", [520, 200], n_in=0, n_out=2, outlettype=["signal", "signal"])
    p.newobj("obj-pout", "plugout~", [520, 260], n_in=2, n_out=0, outlettype=[])
    p.line("obj-pin", 0, "obj-pout", 0)
    p.line("obj-pin", 1, "obj-pout", 1)

    # timing: a metro (gated by Float) bangs transport; a bang polls, it does not start Live
    p.newobj("obj-metro", "metro 33", [40, 200])
    p.newobj("obj-transport", "transport", [40, 232], n_in=2, n_out=9, outlettype=[""] * 9)
    p.newobj("obj-pack", "pack 0 0", [40, 264], n_in=2)
    p.newobj("obj-prep-beat", "prepend beat", [40, 296])
    p.line("obj-metro", 0, "obj-transport", 0)
    p.line("obj-transport", 0, "obj-pack", 0)     # Bars (fires last) triggers
    p.line("obj-transport", 1, "obj-pack", 1)     # Beats (fires first) sets the cold inlet
    p.line("obj-pack", 0, "obj-prep-beat", 0)

    # Float toggle: run the metro, and open/close the window through pcontrol
    p.newobj("obj-sel", "sel 0 1", [240, 168], n_out=3, outlettype=["", "", ""])
    p.message("obj-close", "close", [240, 200])
    p.message("obj-open", "open", [290, 200])
    p.newobj("obj-pctl", "pcontrol", [240, 232], n_out=1)
    p.line("obj-float", 0, "obj-metro", 0)
    p.line("obj-float", 0, "obj-sel", 0)
    p.line("obj-sel", 0, "obj-close", 0)
    p.line("obj-sel", 1, "obj-open", 0)
    p.line("obj-close", 0, "obj-pctl", 0)
    p.line("obj-open", 0, "obj-pctl", 0)

    # Flash and Blink to the drawing
    p.newobj("obj-prep-flash", "prepend flash", [120, 296])
    p.newobj("obj-prep-blink", "prepend blink", [180, 296])
    p.line("obj-flash", 0, "obj-prep-flash", 0)
    p.line("obj-blink", 0, "obj-prep-blink", 0)

    # push the controls to the drawing and open the window once, after Live restores the params
    p.newobj("obj-load", "loadbang", [400, 140], n_in=0)
    p.newobj("obj-ld", "delay 500", [400, 168])
    p.newobj("obj-lt", "t b b b", [400, 200], n_in=1, n_out=3, outlettype=["bang", "bang", "bang"])
    p.line("obj-load", 0, "obj-ld", 0)
    p.line("obj-ld", 0, "obj-lt", 0)
    p.line("obj-lt", 2, "obj-flash", 0)     # bang re-outputs each control's current value
    p.line("obj-lt", 1, "obj-blink", 0)
    p.line("obj-lt", 0, "obj-float", 0)

    # the floating window: a subpatcher holding the jsui and its own window management
    JS = "beat-window.js"
    sub = [
        {"id": "s-inctl", "maxclass": "inlet", "index": 1, "comment": "open/close (pcontrol)",
         "numinlets": 0, "numoutlets": 1, "outlettype": [""], "patching_rect": [20, 360, 24, 24]},
        {"id": "s-indata", "maxclass": "inlet", "index": 2, "comment": "beat / flash / blink",
         "numinlets": 0, "numoutlets": 1, "outlettype": [""], "patching_rect": [60, 360, 24, 24]},
        {"id": "s-load", "maxclass": "newobj", "text": "loadbang", "numinlets": 1, "numoutlets": 1,
         "outlettype": [""], "patching_rect": [120, 360, 60, 20]},
        {"id": "s-setup", "maxclass": "message",
         "text": "title Beat, window flags float, window exec, window grow",
         "numinlets": 2, "numoutlets": 1, "outlettype": [""], "patching_rect": [120, 392, 320, 20]},
        {"id": "s-metro", "maxclass": "newobj", "text": "metro 250 @active 1", "numinlets": 2, "numoutlets": 1,
         "outlettype": [""], "patching_rect": [120, 424, 120, 20]},
        {"id": "s-getsize", "maxclass": "message", "text": "window getsize", "numinlets": 2, "numoutlets": 1,
         "outlettype": [""], "patching_rect": [120, 456, 100, 20]},
        {"id": "s-tp", "maxclass": "newobj", "text": "thispatcher", "numinlets": 1, "numoutlets": 2,
         "outlettype": ["", ""], "patching_rect": [120, 520, 80, 20]},
        {"id": "s-rw", "maxclass": "newobj", "text": "route window", "numinlets": 2, "numoutlets": 2,
         "outlettype": ["", ""], "patching_rect": [300, 456, 90, 20]},
        {"id": "s-rs", "maxclass": "newobj", "text": "route size", "numinlets": 2, "numoutlets": 2,
         "outlettype": ["", ""], "patching_rect": [300, 484, 80, 20]},
        {"id": "s-un", "maxclass": "newobj", "text": "unpack 0 0 0 0", "numinlets": 1, "numoutlets": 4,
         "outlettype": ["", "", "", ""], "patching_rect": [300, 512, 100, 20]},
        {"id": "s-ew", "maxclass": "newobj", "text": "expr $i3 - $i1", "numinlets": 3, "numoutlets": 1,
         "outlettype": [""], "patching_rect": [300, 540, 100, 20]},
        {"id": "s-eh", "maxclass": "newobj", "text": "expr $i3 - $i1", "numinlets": 3, "numoutlets": 1,
         "outlettype": [""], "patching_rect": [410, 540, 100, 20]},
        {"id": "s-sp", "maxclass": "newobj", "text": "sprintf script size beatui %ld %ld", "numinlets": 2,
         "numoutlets": 1, "outlettype": [""], "patching_rect": [300, 568, 220, 20]},
        # the drawing surface, last so it paints on top of the plumbing; sized to the window
        {"id": "s-ui", "maxclass": "jsui", "filename": JS, "varname": "beatui", "parameter_enable": 0,
         "numinlets": 1, "numoutlets": 1, "outlettype": [""], "patching_rect": [0, 0, 244, 220]},
    ]
    sub_lines = [
        ("s-indata", 0, "s-ui", 0),
        ("s-load", 0, "s-setup", 0), ("s-setup", 0, "s-tp", 0),
        ("s-metro", 0, "s-getsize", 0), ("s-getsize", 0, "s-tp", 0),
        ("s-tp", 0, "s-rw", 0), ("s-rw", 0, "s-rs", 0), ("s-rs", 0, "s-un", 0),
        ("s-un", 0, "s-ew", 0), ("s-un", 2, "s-ew", 2),      # width  = right - left
        ("s-un", 1, "s-eh", 0), ("s-un", 3, "s-eh", 2),      # height = bottom - top
        ("s-ew", 0, "s-sp", 0), ("s-eh", 0, "s-sp", 1),      # width triggers (fires last), height is cold
        ("s-sp", 0, "s-tp", 0),
    ]
    p.subpatcher("obj-disp", "display", [240, 296], sub, sub_lines, openrect=[80, 80, 244, 220], n_in=2)
    p.line("obj-pctl", 0, "obj-disp", 0)          # pcontrol identifies the window
    p.line("obj-prep-beat", 0, "obj-disp", 1)
    p.line("obj-prep-flash", 0, "obj-disp", 1)
    p.line("obj-prep-blink", 0, "obj-disp", 1)

    with open(os.path.join(folder, JS), "rb") as f:
        script = f.read()
    path = os.path.join(folder, "Alberton Beat Window.amxd")
    data = p.write(path, scripts={JS: script})
    print("  %-32s %6d bytes" % (os.path.basename(path), len(data)))


BUILDERS = {"kit-receiver": kit_receiver, "kit-selector-v5": kit_selector_v5,
            "kit-fx-receiver": kit_fx_receiver, "beat-window": beat_window}

if __name__ == "__main__":
    for name in (sys.argv[1:] or BUILDERS):
        BUILDERS[name]()
