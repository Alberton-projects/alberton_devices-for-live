#!/usr/bin/env python3
"""Move the kits of an Alberton Kit Selector V4.3 into an Alberton Kit Selector V5, inside a Live set.

    python3 tools/migrate_kits.py "<set.als>" [--write]

Both devices must be in the set, saved. Kits live in the set as the device's blob: one JSON
text per device, hex-encoded, NUL-terminated, holding every blob-typed parameter -- the
pattrstorage with its slots, and the fx multisliders. This reads V4.3's blob, translates
each slot into the V5 panel's names, and replaces the V5 device's blob. Live must be closed
to write; the original set is kept beside it as <set>.als.pre-migrate-<stamp>.

    V4.3 slot                        V5 slot
    kick .. lead2 (12 pattrs)   ->   p1 .. p12          (p13-p16 stay 0)
    volume policy of V4.3       ->   v1 .. v16          (0.70; Bass Electric 0.85; Live Scratcher 0.36; free strips 0.85)
    the master                  ->   vmain 0.85
    presetname[1]               ->   presetname
    pattr @bindto <bank>_fx     ->   pattr_<bank>       (found by reading V4.3's patcher)

V4.3 never stored its resample bank (its pattr binds to an object that does not exist), so
migrated kits carry no resample values: capture them again in V5 where they matter.
"""
import gzip
import json
import os
import re
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import amxd  # noqa: E402

V43_FILE = "Alberton_Kit_Selector_V4.3.amxd"
V5_FILE = "Alberton Kit Selector V5.amxd"
STRIPS = ["kick", "snare", "hihat", "cymbals", "bass_electric", "bass_synth", "pad1", "pad2", "piano1", "piano2", "lead1", "lead2"]
VOLUMES = {n: 0.70 for n in range(1, 15)}
VOLUMES.update({5: 0.85, 14: 0.36, 15: 0.85, 16: 0.85})   # V4.3's resetVolumes policy, by strip
BANKS = ["drums", "bass", "pads", "pianos", "leads", "loops", "vocoder", "vocals", "resample"]


def bank_clients():
    """{pattr varname in V4.3: bank}, read from the V4.3 patcher's `pattr @bindto <x>_fx` boxes."""
    path = os.path.join(HERE, "..", "devices", "kit-selector", V43_FILE)
    pat = json.loads(amxd.read_amxd(path)["json_text"])["patcher"]
    out = {}
    for b in pat["boxes"]:
        bx = b["box"]
        m = re.match(r"pattr @bindto (\w+)_fx(\[1\])? @autorestore", str(bx.get("text", "")))
        if m:
            bank = m.group(1)
            if m.group(2):          # the clone that binds to "vocals_fx[1]" is the resample bank's
                bank = "resample"
            out[bx["varname"]] = bank
    return out


def device_window(x, name):
    i = x.find(name)
    if i < 0:
        raise SystemExit("%s is not in the set" % name)
    return x.rfind("<MxDeviceMidiEffect", 0, i), x.find("</MxDeviceMidiEffect>", i)


BLOB = re.compile(r'(<MxDBlob Id="\d+">\s*<Blob>)(\s*)([0-9A-Fa-f\s]*?)(\s*</Blob>)')


def read_blob(x, start, end):
    m = BLOB.search(x, start, end)
    text = bytes.fromhex(re.sub(r"\s+", "", m.group(3))).decode("utf-8").rstrip("\x00")
    return m, json.loads(text)


def wrap_hex(hexs, indent):
    return "\n".join(indent + hexs[i:i + 80] for i in range(0, len(hexs), 80))


def translate(v43, clients):
    slots = v43["alberton_kits"][0]["pattrstorage"]["slots"]
    out = {}
    for sid, slot in slots.items():
        d = slot["data"]
        nd = {}
        for n, key in enumerate(STRIPS, 1):
            nd["p%d" % n] = [float(d.get(key, [0])[0])]
        for n in range(13, 17):
            nd["p%d" % n] = [0.0]
        for n in range(1, 17):
            nd["v%d" % n] = [VOLUMES[n]]
        nd["vmain"] = [0.85]
        nd["presetname"] = [str(d.get("presetname[1]", d.get("presetname", [""]))[0])]
        for varname, bank in clients.items():
            if varname in d and len(d[varname]) == 9:
                nd["pattr_" + bank] = [float(v) for v in d[varname]]
        out[sid] = {"id": int(sid), "data": nd}
    return out


def main(argv):
    if not argv:
        raise SystemExit(__doc__)
    path, write = argv[0], "--write" in argv
    with gzip.open(path, "rb") as f:
        x = f.read().decode("utf-8")
    s43, e43 = device_window(x, V43_FILE)
    s5, e5 = device_window(x, V5_FILE)
    _, v43 = read_blob(x, s43, e43)
    m5, v5 = read_blob(x, s5, e5)
    clients = bank_clients()
    slots = translate(v43, clients)
    print("V4.3 kits found: %d (%s)" % (len(slots), ", ".join(sorted(slots, key=int))))
    print("fx bank clients: %s" % ", ".join("%s->%s" % kv for kv in sorted(clients.items())))
    for sid in sorted(slots, key=int):
        d = slots[sid]["data"]
        print("  kit %2s %-24r programs %s  banks %s" % (sid, d["presetname"][0], [int(d["p%d" % n][0]) for n in range(1, 13)],
                                                    [b for b in BANKS if "pattr_" + b in d]))
    v5["kits"][0]["pattrstorage"]["slots"] = slots
    for bank in BANKS:                       # the sliders' current values, so the panel shows what V4.3 shows
        src = v43.get(bank + "_fx", v43.get(bank + "_fx[1]"))
        if src is not None:
            v5[bank + "_fx"] = src
    text = json.dumps(v5, indent=4) + "\x00"
    hexs = text.encode("utf-8").hex().upper()
    indent = re.match(r"\s*", m5.group(2)).group(0).split("\n")[-1] if "\n" in m5.group(2) else m5.group(2)
    new_blob = m5.group(1) + m5.group(2) + wrap_hex(hexs, indent).lstrip() + m5.group(4)
    x2 = x[:m5.start()] + new_blob + x[m5.end():]   # m5 was matched in x, so its positions are absolute
    print("V5 blob: %d -> %d bytes of JSON" % (len(json.dumps(v5)), len(text)))
    if not write:
        print("dry run; add --write to apply (Live must be closed)")
        return
    if subprocess.run(["pgrep", "-x", "Live"], capture_output=True).returncode == 0:
        raise SystemExit("Live is running; close it first")
    kept = path + ".pre-migrate-" + time.strftime("%Y%m%d-%H%M%S")
    shutil.copy2(path, kept)
    with gzip.open(path, "wb") as f:
        f.write(x2.encode("utf-8"))
    with gzip.open(path, "rb") as f:
        back = f.read().decode("utf-8")
    s5b, e5b = device_window(back, V5_FILE)
    _, check = read_blob(back, s5b, e5b)
    assert len(check["kits"][0]["pattrstorage"]["slots"]) == len(slots)
    print("written; original kept as %s" % kept)


if __name__ == "__main__":
    main(sys.argv[1:])
