#!/usr/bin/env python3
"""Install the devices into the Live User Library, in development or release form.

    python3 tools/install.py --dev      [--dry-run] [<device dir or file> ...]
    python3 tools/install.py --release  [--dry-run] [<device dir or file> ...]

--dev writes each device plain (the patcher alone) and symlinks every script it uses from
this repository into the device's folder, so `autowatch 1` reloads a script edit the moment
it is saved. Patcher edits still need the set reloaded.

--release copies the .amxd exactly as it is in the repository, scripts embedded. It refuses
to run unless check_embedded.py passes, and removes our script symlinks from the folder so
that only one copy of each script exists there.

Every regular file replaced is first copied to <folder>/_archive/backups/<name>.pre-install-<stamp>.
Live only notices a replaced file when the device is next instantiated: reload the set.
Install paths come from tools/manifest.json.
"""
import os
import shutil
import subprocess
import sys
import time

from devices import HERE, amxd, build_plain, load_manifest, patcher_of, scripts_used, select


def backup(path, stamp, dry):
    """Copy a regular file aside before it is replaced. Returns where, or None."""
    if not os.path.lexists(path) or os.path.islink(path):
        return None
    bdir = os.path.join(os.path.dirname(path), "_archive", "backups")
    dst = os.path.join(bdir, os.path.basename(path) + ".pre-install-" + stamp)
    if not dry:
        os.makedirs(bdir, exist_ok=True)
        shutil.copy2(path, dst)
    return dst


def replace(path, data, stamp, dry):
    kept = backup(path, stamp, dry)
    if not dry:
        if os.path.islink(path):
            os.unlink(path)
        with open(path, "wb") as f:
            f.write(data)
    return kept


def main(argv):
    mode = "dev" if "--dev" in argv else "release" if "--release" in argv else None
    if mode is None:
        raise SystemExit(__doc__)
    dry = "--dry-run" in argv
    only = [a for a in argv if not a.startswith("--")]
    stamp = time.strftime("%Y%m%d-%H%M%S")
    entries = select(load_manifest(), only)
    if mode == "release":
        r = subprocess.run([sys.executable, os.path.join(HERE, "check_embedded.py")] + only)
        if r.returncode:
            raise SystemExit("check_embedded.py failed; nothing installed")
    print("%s INSTALL%s" % (mode.upper(), "  [dry run]" if dry else ""))
    for e in entries:
        dst, folder = e["dst"], os.path.dirname(e["dst"])
        if not os.path.isdir(folder):
            raise SystemExit("install folder does not exist: " + folder)
        doc = amxd.read_amxd(e["src"])
        wanted = scripts_used(patcher_of(doc))
        if mode == "release":
            kept = replace(dst, doc["raw"], stamp, dry)
            print("  %-40s -> %s  [embedded: %s]" % (e["file"], dst, ", ".join(wanted) or "none"))
            if kept:
                print("      kept %s" % kept)
            for s in wanted:
                link = os.path.join(folder, s)
                if os.path.islink(link):
                    print("      unlink %s" % link)
                    if not dry:
                        os.unlink(link)
        else:
            kept = replace(dst, build_plain(doc["json_text"]), stamp, dry)
            print("  %-40s -> %s  [plain]" % (e["file"], dst))
            if kept:
                print("      kept %s" % kept)
            for s in wanted:
                target = os.path.join(e["srcdir"], s)
                if not os.path.exists(target):
                    raise SystemExit("%s: %s is not in the repository" % (e["file"], s))
                link = os.path.join(folder, s)
                if os.path.islink(link) and os.readlink(link) == target:
                    print("      %s already links to the repository" % s)
                    continue
                kept = backup(link, stamp, dry)
                if not dry:
                    if os.path.lexists(link):
                        os.unlink(link)
                    os.symlink(target, link)
                print("      %s -> %s%s" % (s, target, ("  (kept %s)" % kept) if kept else ""))
    if not dry:
        print("\nReload the set so Live instantiates the new files.")


if __name__ == "__main__":
    main(sys.argv[1:])
