#!/usr/bin/env python3
"""Fold each device's scripts into its .amxd, rebuilding whenever a source changed.

    python3 tools/embed.py [--write] [<device dir or file> ...]

Without --write it only reports. A device whose embedded copies already equal the sources
beside it is left alone; a plain device is embedded; a stale one is rebuilt. Devices with
no `js` object are skipped. Run it before committing a released device, and let
check_embedded.py be the judge.
"""
import os
import sys

from devices import (amxd, build_embedded, embedded_files, load_manifest, patcher_of,
                     read_sources, scripts_used, select)


def main(argv):
    write = "--write" in argv
    only = [a for a in argv if not a.startswith("--")]
    print("WRITING" if write else "DRY RUN")
    for e in select(load_manifest(), only):
        doc = amxd.read_amxd(e["src"])
        wanted = scripts_used(patcher_of(doc))
        if not wanted:
            print("  %-40s no scripts" % e["file"])
            continue
        sources, mtimes = read_sources(e, wanted)
        have = embedded_files(doc)
        if doc["collective"] and set(have) == set(wanted) and all(have[s] == sources[s] for s in wanted):
            print("  %-40s up to date (%s)" % (e["file"], ", ".join(wanted)))
            continue
        mtimes[e["file"]] = os.path.getmtime(e["src"])
        out = build_embedded(doc, e["file"], sources, mtimes)
        why = "stale, rebuilt" if doc["collective"] else "plain, embedded"
        print("  %-40s %s: %s  (%d -> %d bytes)%s"
              % (e["file"], why, ", ".join(wanted), len(doc["raw"]), len(out),
                 "" if write else "   [dry run]"))
        if write:
            with open(e["src"], "wb") as f:
                f.write(out)


if __name__ == "__main__":
    main(sys.argv[1:])
