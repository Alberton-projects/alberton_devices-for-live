#!/usr/bin/env python3
"""Fail unless every device carries its scripts embedded and identical to the sources beside it.

    python3 tools/check_embedded.py [<device dir or file> ...]

Exit status 1 on any difference, so it can gate an install or a release.
"""
import sys

from devices import amxd, embedded_files, load_manifest, patcher_of, read_sources, scripts_used, select


def main(argv):
    ok = True
    for e in select(load_manifest(), argv):
        doc = amxd.read_amxd(e["src"])
        wanted = scripts_used(patcher_of(doc))
        if not wanted:
            print("  ok    %-40s no scripts" % e["file"])
            continue
        if not doc["collective"]:
            print("  FAIL  %-40s plain: %s not embedded" % (e["file"], ", ".join(wanted)))
            ok = False
            continue
        try:
            sources, _ = read_sources(e, wanted)
        except SystemExit as err:
            print("  FAIL  %-40s %s" % (e["file"], err))
            ok = False
            continue
        have = embedded_files(doc)
        for s in wanted:
            if s not in have:
                print("  FAIL  %-40s %s referenced but not embedded" % (e["file"], s))
                ok = False
            elif have[s] != sources[s]:
                print("  FAIL  %-40s %s differs from the source (run embed.py --write)" % (e["file"], s))
                ok = False
            else:
                print("  ok    %-40s %s (%d bytes)" % (e["file"], s, len(have[s])))
        for s in sorted(set(have) - set(wanted)):
            print("  warn  %-40s %s embedded but no js object references it" % (e["file"], s))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main([a for a in sys.argv[1:] if not a.startswith("--")]))
