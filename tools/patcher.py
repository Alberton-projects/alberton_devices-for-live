#!/usr/bin/env python3
"""Build a Max for Live patcher from scratch, as the JSON text Max writes.

    from patcher import Patcher
    p = Patcher(kind="midi", width=200, height=100)
    p.numbox("obj-1", "Amount", initial=64, rect=[10, 10, 44, 15])
    p.newobj("obj-2", "prepend amount", [10, 40])
    p.js("obj-3", "my-script.js", [10, 70])
    p.line("obj-1", 0, "obj-2", 0); p.line("obj-2", 0, "obj-3", 0)
    p.write("My Device.amxd", scripts={"my-script.js": b"..."})

Only what the devices here need: live.dial / live.numbox / live.menu / live.toggle /
live.button as Live parameters, comments, plain objects, message boxes, patchlines, and
the root attributes a device carries. Coordinates are in the presentation, which is what
the device shows in Live; the patching view gets a grid layout nobody looks at.
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from devices import KINDS, build_embedded, build_plain  # noqa: E402
import amxd  # noqa: E402

MAC_EPOCH = 2082844800
AMXDTYPE = {"midi": 1835887981, "audio": 1633771873, "instrument": 1768515945}   # "mmmm", "aaaa", "iiii"


class Patcher:
    def __init__(self, kind="midi", width=300, height=169):
        assert kind in KINDS
        self.kind, self.width, self.height = kind, width, height
        self.boxes, self.lines, self.params = [], [], {}
        self._n = 0

    # ----- boxes ------------------------------------------------------------
    def _place(self, rect):
        """Presentation rect given; the patching rect is a grid below the device area."""
        self._n += 1
        col, row = (self._n - 1) % 6, (self._n - 1) // 6
        return [40.0 + 130.0 * col, 400.0 + 40.0 * row, float(rect[2]), float(rect[3])]

    def box(self, oid, maxclass, rect=None, presentation=True, **attrs):
        b = {"id": oid, "maxclass": maxclass}
        b.update(attrs)
        if rect is not None and presentation:
            b["presentation"] = 1
            b["presentation_rect"] = [float(x) for x in rect]
            b["patching_rect"] = self._place(rect)
        else:
            b["patching_rect"] = [float(x) for x in rect] if rect else self._place([0, 0, 100, 20])
        self.boxes.append(b)
        return oid

    def newobj(self, oid, text, at, n_in=1, n_out=1, outlettype=None):
        return self.box(oid, "newobj", rect=[at[0], at[1], 20 + 6.5 * len(text), 20], presentation=False,
                        text=text, numinlets=n_in, numoutlets=n_out, outlettype=outlettype or [""] * n_out)

    def message(self, oid, text, at, presentation=False, rect=None):
        return self.box(oid, "message", rect=rect or [at[0], at[1], 20 + 6.5 * len(text), 20], presentation=presentation,
                        text=text, numinlets=2, numoutlets=1, outlettype=[""])

    def comment(self, oid, text, rect, fontsize=10.0):
        return self.box(oid, "comment", rect=rect, text=text, numinlets=1, numoutlets=0, fontsize=fontsize)

    def js(self, oid, filename, at, n_in=1, n_out=1):
        return self.box(oid, "newobj", rect=[at[0], at[1], 20 + 6.5 * len(filename), 20], presentation=False,
                        text="js " + filename, numinlets=n_in, numoutlets=n_out, outlettype=[""] * n_out,
                        saved_object_attributes={"filename": filename, "parameter_enable": 0})

    def _param(self, oid, maxclass, longname, shortname, rect, valueof, varname, numoutlets, outlettype, **extra):
        v = {"parameter_longname": longname, "parameter_shortname": shortname or longname, "parameter_modmode": 0}
        v.update(valueof)
        self.params[oid] = [longname, v["parameter_shortname"], 0]
        return self.box(oid, maxclass, rect=rect, parameter_enable=1, numinlets=1, numoutlets=numoutlets,
                        outlettype=outlettype, saved_attribute_attributes={"valueof": v}, varname=varname or oid, **extra)

    def numbox(self, oid, longname, rect, initial=0, lo=0, hi=127, unit=0, shortname=None, varname=None, is_float=False):
        return self._param(oid, "live.numbox", longname, shortname, rect,
                           {"parameter_initial": [initial], "parameter_initial_enable": 1, "parameter_mmin": lo,
                            "parameter_mmax": hi, "parameter_type": 0 if is_float else 1, "parameter_unitstyle": unit},
                           varname, 2, ["", "float"])

    def dial(self, oid, longname, rect, initial=0, lo=0, hi=127, unit=0, shortname=None, varname=None, is_float=False, tiny=False):
        """tiny: the knob with its name beside it (appearance 1), 15 px high."""
        oid = self._param(oid, "live.dial", longname, shortname, rect,
                          {"parameter_initial": [initial], "parameter_initial_enable": 1, "parameter_mmin": lo,
                           "parameter_mmax": hi, "parameter_type": 0 if is_float else 1, "parameter_unitstyle": unit},
                          varname, 2, ["", "float"])
        if tiny:
            self.boxes[-1]["appearance"] = 1
        return oid

    def textbutton(self, oid, label, rect, longname=None, varname=None):
        """A live.text in momentary mode: a button that says what it does."""
        longname = longname or label
        self.params[oid] = [longname, longname, 0]
        return self.box(oid, "live.text", rect=rect, parameter_enable=1, mode=0, numinlets=1, numoutlets=2,
                        outlettype=["", ""], text=label, texton=label, transition=2, fontsize=10.0,
                        saved_attribute_attributes={"valueof": {"parameter_button_mode": "Momentary", "parameter_enum": ["val1", "val2"],
                                                                "parameter_longname": longname, "parameter_mmax": 1, "parameter_modmode": 0,
                                                                "parameter_shortname": longname, "parameter_type": 2}},
                        varname=varname or oid)

    def menu(self, oid, longname, rect, items, initial=0, shortname=None, varname=None):
        return self._param(oid, "live.menu", longname, shortname, rect,
                           {"parameter_enum": list(items), "parameter_initial": [initial], "parameter_initial_enable": 1,
                            "parameter_mmax": len(items) - 1, "parameter_type": 2},
                           varname, 3, ["", "", "float"])

    def toggle(self, oid, longname, rect, initial=0, shortname=None, varname=None):
        return self._param(oid, "live.toggle", longname, shortname, rect,
                           {"parameter_enum": ["off", "on"], "parameter_initial": [initial], "parameter_initial_enable": 1,
                            "parameter_mmax": 1, "parameter_type": 2},
                           varname, 1, [""])

    def button(self, oid, longname, rect, shortname=None, varname=None):
        return self._param(oid, "live.button", longname, shortname, rect,
                           {"parameter_enum": ["off", "on"], "parameter_mmax": 1, "parameter_type": 2},
                           varname, 1, [""])

    # ----- wiring -----------------------------------------------------------
    def line(self, src, out, dst, inlet):
        self.lines.append((src, out, dst, inlet))

    # ----- output -----------------------------------------------------------
    def json_text(self):
        now = int(time.time()) + MAC_EPOCH
        root = {
            "fileversion": 1,
            "appversion": {"major": 9, "minor": 0, "revision": 9, "architecture": "x64", "modernui": 1},
            "classnamespace": "box",
            "rect": [100.0, 100.0, 900.0, 600.0],
            "openrect": [0.0, 0.0, float(self.width), float(self.height)],
            "openinpresentation": 1,
            "default_fontsize": 10.0,
            "default_fontname": "Arial Bold",
            "gridsize": [8.0, 8.0],
            "boxanimatetime": 500,
            "devicewidth": float(self.width),
            "boxes": [{"box": b} for b in self.boxes],
            "lines": [{"patchline": {"destination": [d, i], "source": [s, o]}} for (s, o, d, i) in self.lines],
            "parameters": dict(self.params, inherited_shortname=1),
            "dependency_cache": [],
            "latency": 0, "is_mpe": 0, "external_mpe_tuning_enabled": 0,
            "minimum_live_version": "", "minimum_max_version": "", "platform_compatibility": 0,
            "project": {"version": 1, "creationdate": now, "modificationdate": now,
                        "viewrect": [0.0, 0.0, 300.0, 500.0], "autoorganize": 1, "hideprojectwindow": 1,
                        "showdependencies": 1, "autolocalize": 0, "contents": {"patchers": {}, "code": {}},
                        "layout": {}, "searchpath": {}, "detailsvisible": 0, "amxdtype": AMXDTYPE[self.kind],
                        "readonly": 0, "devpathtype": 0, "devpath": ".", "sortmode": 0, "viewmode": 0,
                        "includepackages": 0},
            "autosave": 0,
        }
        return json.dumps({"patcher": root}, indent=1)

    def write(self, path, scripts=None):
        """Write the device: plain when it has no scripts, embedded (collective) when it has."""
        text = self.json_text()
        kind = KINDS[self.kind]
        if not scripts:
            data = build_plain(text, kind)
        else:
            doc = amxd.read_amxd_bytes(build_plain(text, kind))
            name = os.path.basename(path)
            data = build_embedded(doc, name, dict(scripts), {name: time.time()}, kind=kind)
        with open(path, "wb") as f:
            f.write(data)
        return data
