#!/usr/bin/env python3
"""Mechanical review of a Max for Live patcher: dead wiring, orphans, missing deps."""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import amxd

UI = {"comment", "panel", "live.comment", "fpic", "live.line", "bpatcher"}
# these do their job by binding, not by patchcord, so no cord is not a defect
NO_CORD = re.compile(r'^\s*(autopattr|pattr\w*|preset|mira\.\w+|jsui|universal|'
                     r'live\.banks|inlet|outlet)\b')
NO_INPUT_NEEDED = re.compile(
    r'^\s*(loadbang|live\.thisdevice|inlet|key|keyup|metro|qmetro|notein|midiin|ctlin|'
    r'bendin|pgmin|touchin|polyin|sysexin|r\b|receive\b|v\b|value\b|plugin~|adc~|'
    r'live\.path|live\.observer|mousestate|mira\.|jit\.grab|hi\b|serial|udpreceive|'
    r'thispatcher|patcherargs|route|select|sel)\b')


def walk(pat, path="", out=None):
    """Yield (path, patcher_dict) for the patcher and every subpatcher."""
    out = out if out is not None else []
    out.append((path or "root", pat))
    for b in pat.get("boxes", []):
        bb = b["box"]
        if "patcher" in bb:
            nm = bb.get("name") or (bb.get("text") or bb.get("maxclass") or "")
            walk(bb["patcher"], "%s/%s" % (path, str(nm)[:34]), out)
    return out


def analyse(path):
    doc = amxd.read_amxd(path)
    root = json.loads(doc["json_text"])["patcher"]
    scopes = walk(root)

    sends, recvs, values_w, values_r = {}, {}, {}, {}
    js_refs, params, orphans, boxes_total = set(), [], [], 0
    lom = set()

    for scope, pat in scopes:
        lines = pat.get("lines", [])
        touched = set()
        for l in lines:
            p = l["patchline"]
            touched.add(p["source"][0])
            touched.add(p["destination"][0])
        for b in pat.get("boxes", []):
            bb = b["box"]
            boxes_total += 1
            mc, txt, bid = bb.get("maxclass"), (bb.get("text") or ""), bb.get("id")
            w = txt.split()
            if w:
                if w[0] in ("s", "send") and len(w) > 1:
                    sends.setdefault(w[1], []).append(scope)
                if w[0] in ("r", "receive") and len(w) > 1:
                    recvs.setdefault(w[1], []).append(scope)
                if w[0] in ("v", "value") and len(w) > 1:
                    (values_w if len(w) > 2 else values_r).setdefault(w[1], []).append(scope)
                if w[0] == "js" and len(w) > 1:
                    js_refs.add(w[1])
                if w[0] in ("live.object", "live.path", "live.observer", "live.remote~"):
                    lom.add(scope)
            sa = bb.get("saved_attribute_attributes", {}).get("valueof", {})
            if "parameter_longname" in sa:
                params.append((sa["parameter_longname"], sa.get("parameter_type"),
                               sa.get("parameter_initial"), bb.get("maxclass")))
            if mc not in UI and bid not in touched and not NO_CORD.match(txt):
                orphans.append((scope, bid, mc, txt[:60]))

    deps = {e["fnam"][0] for e in doc["entries"][1:]}
    return dict(path=path, boxes=boxes_total, scopes=len(scopes), root_boxes=len(root.get("boxes", [])),
                sends=sends, recvs=recvs, values_w=values_w, values_r=values_r,
                js_refs=js_refs, deps=deps, params=params, orphans=orphans, lom=sorted(lom),
                dangling_send=sorted(set(sends) - set(recvs)),
                dangling_recv=sorted(set(recvs) - set(sends)),
                missing_js=sorted(js_refs - deps),
                # only .js dependencies are detectable; .maxpat abstractions and
                # images are referenced in ways this does not parse
                unused_dep=sorted(d for d in deps - js_refs if d.endswith(".js")))


if __name__ == "__main__":
    for p in sys.argv[1:]:
        a = analyse(p)
        print("\n" + "=" * 78)
        print(p.split("/")[-1])
        print("=" * 78)
        print("  %d boxes across %d patchers (%d at root)" % (a["boxes"], a["scopes"], a["root_boxes"]))
        if a["params"]:
            print("  parameters: " + ", ".join(sorted(p[0] for p in a["params"])))
        if a["lom"]:
            print("  touches the LOM in: " + ", ".join(a["lom"][:6]))
        print("  embedded files: %s" % (", ".join(sorted(a["deps"])) or "none"))
        for k, label in [("dangling_send", "send with no receive"),
                         ("dangling_recv", "receive with no send"),
                         ("missing_js", "js referenced but NOT embedded"),
                         ("unused_dep", "embedded but never referenced")]:
            if a[k]:
                print("  !! %s: %s" % (label, ", ".join(a[k])))
        if a["orphans"]:
            print("  !! %d unconnected object(s):" % len(a["orphans"]))
            for s, i, mc, t in a["orphans"][:14]:
                print("       %-34s %-12s %r" % (s, mc, t))
            if len(a["orphans"]) > 14:
                print("       … %d more" % (len(a["orphans"]) - 14))
