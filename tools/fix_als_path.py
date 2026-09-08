#!/usr/bin/env python3
"""Rewrite a device path inside a Live set (.als is gzipped XML).

    python3 tools/fix_als_path.py "<set.als>" --old "<text>" --new "<text>" [--write]

Replaces <old> with <new> wherever it appears: in the plain paths (RelativePath, Path) and
in the URL-encoded form Live keeps in BranchDeviceId, where a space is %20. Reports the
counts; writes only with --write, after copying the original to <set>.als.pre-fix-<stamp>.
Refuses to write while Live is running, because Live rewrites the set on save and would
undo the change.
"""
import gzip
import shutil
import subprocess
import sys
import time
import urllib.parse


def live_running():
    return subprocess.run(["pgrep", "-x", "Live"], capture_output=True).returncode == 0


def arg(argv, flag):
    if flag not in argv:
        raise SystemExit(__doc__)
    return argv[argv.index(flag) + 1]


def main(argv):
    if not argv or argv[0].startswith("--"):
        raise SystemExit(__doc__)
    path, old, new, write = argv[0], arg(argv, "--old"), arg(argv, "--new"), "--write" in argv
    with gzip.open(path, "rb") as f:
        text = f.read().decode("utf-8")
    forms = [(old, new), (urllib.parse.quote(old), urllib.parse.quote(new))]
    total = 0
    for o, n in forms:
        c = text.count(o)
        total += c
        print("  %3d x %r" % (c, o))
        text = text.replace(o, n)
    if not total:
        print("nothing to change")
        return
    if not write:
        print("dry run; add --write to apply")
        return
    if live_running():
        raise SystemExit("Live is running; close it first")
    stamp = time.strftime("%Y%m%d-%H%M%S")
    kept = path + ".pre-fix-" + stamp
    shutil.copy2(path, kept)
    with gzip.open(path, "wb") as f:
        f.write(text.encode("utf-8"))
    with gzip.open(path, "rb") as f:
        back = f.read().decode("utf-8")
    assert all(back.count(o) == 0 for o, _ in forms if o not in new), "old form still present"
    print("written; original kept as %s" % kept)


if __name__ == "__main__":
    main(sys.argv[1:])
