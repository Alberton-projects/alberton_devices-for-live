#!/usr/bin/env python3
"""Shared helpers for the tools: repository layout, the manifest, the two container forms.

A device exists in two forms. *Plain*: the patcher alone, scripts loaded from the folder
beside it -- the development form, because `autowatch 1` then reloads a script the moment
it is saved. *Embedded* (a Max "collective"): patcher plus its scripts in one file -- the
release form, because one file installs the device. `build_plain` and `build_embedded`
convert between them; the patcher JSON is carried through untouched either way.
"""
import json
import os
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import amxd  # noqa: E402

MAC_EPOCH = 2082844800  # seconds between 1904-01-01 and 1970-01-01


def load_manifest():
    with open(os.path.join(HERE, "manifest.json")) as f:
        m = json.load(f)
    root = os.path.expanduser(m["install_root"])
    out = []
    for d in m["devices"]:
        out.append(dict(dir=d["dir"], file=d["file"], note=d.get("note", ""),
                        srcdir=os.path.join(ROOT, "devices", d["dir"]),
                        src=os.path.join(ROOT, "devices", d["dir"], d["file"]),
                        dst=os.path.join(root, d["install"])))
    return out


def select(entries, only):
    """Restrict manifest entries to the device dirs or file names named in `only`."""
    if not only:
        return entries
    keep = [e for e in entries if e["dir"] in only or e["file"] in only]
    missing = set(only) - {e["dir"] for e in keep} - {e["file"] for e in keep}
    if missing:
        raise SystemExit("not in tools/manifest.json: " + ", ".join(sorted(missing)))
    return keep


def patcher_of(doc):
    return json.loads(doc["json_text"])["patcher"]


def scripts_used(patcher):
    """Every `js <file>` referenced anywhere in the patcher, in order of appearance."""
    found = []

    def walk(p):
        for b in p.get("boxes", []):
            bb = b["box"]
            m = re.match(r'\s*js\s+(\S+)', bb.get("text") or "")
            if m and m.group(1) not in found:
                found.append(m.group(1))
            if "patcher" in bb:
                walk(bb["patcher"])
    walk(patcher)
    return found


def embedded_files(doc):
    """{name: bytes} of the dependencies a collective carries; empty for a plain device."""
    raw = doc["raw"]
    return {e["fnam"][0]: raw[amxd.BASE + e["of32"][0]:amxd.BASE + e["of32"][0] + e["sz32"][0]]
            for e in doc["entries"][1:]}


def read_sources(entry, wanted):
    """({script: bytes}, {script: mtime}) for the scripts beside the device in the repo."""
    sources, mtimes = {}, {}
    for s in wanted:
        p = os.path.join(entry["srcdir"], s)
        if not os.path.exists(p):
            raise SystemExit("%s: %s is not beside the device in the repository" % (entry["file"], s))
        with open(p, "rb") as f:
            sources[s] = f.read()
        mtimes[s] = os.path.getmtime(p)
    return sources, mtimes


def build_plain(json_text):
    """A device that depends on nothing: the 32-byte header, then the NUL-terminated patcher."""
    payload = json_text.encode("utf-8") + b"\x00"
    head = (b"ampf" + struct.pack("<I", 4) + b"mmmm"
            + b"meta" + struct.pack("<II", 4, 1)
            + b"ptch" + struct.pack("<I", len(payload)))
    assert len(head) == amxd.BASE
    out = head + payload
    back = amxd.read_amxd_bytes(out)
    assert not back["collective"] and back["json_text"] == json_text
    return out


def build_embedded(doc, name, sources, mtimes):
    """A collective from a device's patcher plus {script: bytes}, verified before it is returned.

    `name` is the device file name: Max records it as the patcher entry's own name.
    """
    files = [(s, sources[s], b"TEXT") for s in sources]
    mdat = ([int(mtimes.get(name, 0)) + MAC_EPOCH]
            + [int(mtimes.get(s, 0)) + MAC_EPOCH for s in sources])
    out = amxd.build_collective(doc["json_text"], name, files, mdat=mdat)
    back = amxd.read_amxd_bytes(out)
    assert back["collective"]
    assert json.loads(back["json_text"]) == json.loads(doc["json_text"])
    got = embedded_files(back)
    for s, data in sources.items():
        assert got[s] == data, "%s came back changed" % s
    return out
