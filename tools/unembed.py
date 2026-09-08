#!/usr/bin/env python3
"""Write the plain form of a device: the patcher alone, scripts loaded from its folder.

    python3 tools/unembed.py <in.amxd> <out.amxd>

This is what install.py --dev installs. It is also the form to open in Max when you want to
edit a script beside the device rather than inside it.
"""
import sys

from devices import amxd, build_plain, patcher_of, scripts_used


def to_plain(src, dst):
    doc = amxd.read_amxd(src)
    with open(dst, "wb") as f:
        f.write(build_plain(doc["json_text"]))
    return scripts_used(patcher_of(doc))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    scripts = to_plain(sys.argv[1], sys.argv[2])
    print("plain device written; it loads from its folder: %s" % (", ".join(scripts) or "nothing"))
