#!/usr/bin/env python3
"""Keep the shared script blocks identical in every device that carries them.

    python3 tools/sync_shared.py            # rewrite every block from devices/_shared/
    python3 tools/sync_shared.py --check    # exit 1 if any block differs

Max's js object has no module system, so a block shared between devices is pasted into
each script verbatim, between

    // --- begin shared: <name>.js ---
    // --- end shared: <name>.js ---

markers. The file in devices/_shared/ is the source; this tool copies it into every script
that carries the markers, or reports the ones that drifted.
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SHARED = os.path.join(ROOT, "devices", "_shared")
MARK = re.compile(r"^// --- begin shared: (\S+) ---\n.*?^// --- end shared: \1 ---\n", re.S | re.M)


def shared_block(name):
    with open(os.path.join(SHARED, name)) as f:
        text = f.read()
    m = MARK.search(text)
    if not m or m.group(1) != name:
        raise SystemExit("%s does not carry its own markers" % name)
    return m.group(0)


def scripts():
    for d in sorted(os.listdir(os.path.join(ROOT, "devices"))):
        folder = os.path.join(ROOT, "devices", d)
        if d.startswith("_") or not os.path.isdir(folder):
            continue
        for f in sorted(os.listdir(folder)):
            if f.endswith(".js"):
                yield os.path.join(folder, f)


def main(argv):
    check = "--check" in argv
    drift = 0
    for path in scripts():
        with open(path) as f:
            text = f.read()
        new = text
        for m in MARK.finditer(text):
            name = m.group(1)
            new = new.replace(m.group(0), shared_block(name))
        rel = os.path.relpath(path, ROOT)
        if new == text:
            if MARK.search(text):
                print("  ok       %s" % rel)
            continue
        drift += 1
        if check:
            print("  DRIFTED  %s" % rel)
        else:
            with open(path, "w") as f:
                f.write(new)
            print("  updated  %s" % rel)
    return 1 if (check and drift) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
