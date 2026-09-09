#!/usr/bin/env python3
"""Read and rewrite .amxd files (Max for Live devices) without opening Max.

A .amxd is a small container holding the patcher as JSON plus any files the
patcher depends on (.js, .maxpat, images).  There are two forms, told apart by
the word at offset 20 and confirmed by the "mx@c" magic at 32.

Plain (offset 20 == 1) -- a device that depends on nothing:

     0  "ampf" 04 00 00 00 "mmmm" "meta" 04 00 00 00 01 00 00 00
    24  "ptch" <uint32 LE: filelen - 32>
    32  the patcher JSON, NUL-terminated, to end of file

Collective (offset 20 == 7) -- a device with embedded dependencies:

     0  "ampf" 04 00 00 00 "mmmm" "meta" 04 00 00 00 07 00 00 00
    24  "ptch" <uint32 LE: filelen - 32>
    32  "mx@c" <uint32 BE: 16> <uint32 BE: 0> <uint32 BE: dlst offset, base 32>
    48  the patcher JSON, NUL-terminated
    ..  each embedded file, back to back
    ..  "dlst" <uint32 BE size> then one "dire" record per file:
          type fnam sz32 of32 vers flag mdat
        each as <tag><uint32 BE size incl. the 8-byte header><payload>

Two quirks that will bite you:

  * The "ptch" size at offset 28 is little-endian.  Every other size in the
    file is big-endian.
  * `of32` and the dlst offset are relative to byte 32, not to 0.  `sz32` for
    the JSON entry counts the trailing NUL.

So any edit that changes the JSON length by N must add N to four places: the
ptch size (28, LE), the dlst offset (44, BE), the JSON entry's sz32, and the
of32 of every entry that follows it.  `write_amxd` does that for you.

`mdat` is a modification date on the classic Mac epoch (1904), not a checksum,
so leaving it stale is harmless.  Nothing in the file is checksummed: Live
loads the device by path, and the OriginalFileSize/OriginalCrc a Live set
stores alongside are search hints, not validation.

Prefer editing the JSON as *text* over parsing and re-serialising it.  A
patcher is thousands of floats; one that fails to round-trip breaks a device
that cannot be opened to find out why.  `splice_into_array` does a
string-aware bracket match so you can append boxes and patchlines to the exact
array you mean, leaving every other byte alone.

Written 2026-08-04 while making Step_Sequencer_v4.amxd start silent.
"""
import json
import struct

BASE = 32
PTCH_SIZE_OFF = 28
DLST_OFF_OFF = 44


def _be(b):
    return struct.unpack(">I", b)[0]


def read_amxd(path):
    """-> dict(raw, entries, json_text, json_off, json_size, collective).

    entries[i] maps a dire tag to (value, offset_of_its_payload).  entries[0]
    is always the patcher; the rest are embedded dependencies in file order.
    A plain device has no directory, so entries is empty.
    """
    raw = open(path, "rb").read()

    if raw[BASE:BASE + 4] != b"mx@c":
        payload = raw[BASE:]
        if not payload.endswith(b"\x00"):
            raise ValueError("patcher payload is not NUL-terminated")
        return dict(raw=raw, entries=[], json_text=payload[:-1].decode("utf-8"),
                    json_off=0, json_size=len(payload), dlst=None, collective=False)

    dl = raw.index(b"dlst")
    size = _be(raw[dl + 4:dl + 8])
    pos, entries = dl + 8, []
    while pos < dl + size:
        tag, s = raw[pos:pos + 4], _be(raw[pos + 4:pos + 8])
        if tag == b"dire":
            e, sub = {}, pos + 8
            while sub < pos + s:
                t2, s2 = raw[sub:sub + 4], _be(raw[sub + 4:sub + 8])
                data = raw[sub + 8:sub + s2]
                e[t2.decode()] = (_be(data[:4]) if len(data) == 4
                                  else data.rstrip(b"\x00").decode("latin1"), sub + 8)
                sub += s2
            entries.append(e)
        pos += s

    off, sz = entries[0]["of32"][0], entries[0]["sz32"][0]
    payload = raw[BASE + off:BASE + off + sz]
    if not payload.endswith(b"\x00"):
        raise ValueError("patcher payload is not NUL-terminated")
    return dict(raw=raw, entries=entries, json_text=payload[:-1].decode("utf-8"),
                json_off=off, json_size=sz, dlst=dl, collective=True)


def write_amxd(path, doc, new_json_text, verify=True):
    """Rewrite `path` with a new patcher, fixing every size and offset."""
    raw, entries = doc["raw"], doc["entries"]
    off, size = doc["json_off"], doc["json_size"]
    new_payload = new_json_text.encode("utf-8") + b"\x00"
    delta = len(new_payload) - size

    out = bytearray(raw[:BASE + off] + new_payload + raw[BASE + off + size:])
    struct.pack_into("<I", out, PTCH_SIZE_OFF,
                     struct.unpack_from("<I", out, PTCH_SIZE_OFF)[0] + delta)
    if doc["collective"]:
        struct.pack_into(">I", out, DLST_OFF_OFF,
                         struct.unpack_from(">I", out, DLST_OFF_OFF)[0] + delta)
        # the dlst itself moved by delta, so its records are now at +delta
        struct.pack_into(">I", out, entries[0]["sz32"][1] + delta, size + delta)
        for e in entries[1:]:
            struct.pack_into(">I", out, e["of32"][1] + delta, e["of32"][0] + delta)
    out = bytes(out)

    if verify:
        back = read_amxd_bytes(out)
        assert struct.unpack_from("<I", out, PTCH_SIZE_OFF)[0] == len(out) - BASE
        assert json.loads(back["json_text"]) == json.loads(new_json_text)
        if doc["collective"]:
            assert struct.unpack_from(">I", out, DLST_OFF_OFF)[0] == back["dlst"] - BASE
            for old, new in zip(entries[1:], back["entries"][1:]):
                a = raw[BASE + old["of32"][0]:BASE + old["of32"][0] + old["sz32"][0]]
                b = out[BASE + new["of32"][0]:BASE + new["of32"][0] + new["sz32"][0]]
                assert a == b, "embedded file %s changed" % new["fnam"][0]

    open(path, "wb").write(out)
    return out


def _pad(name):
    """dlst names are NUL-padded to the next multiple of 4, always terminated."""
    b = name.encode("utf-8")
    return b + b"\x00" * (4 - len(b) % 4)


def _rec(tag, payload):
    return tag + struct.pack(">I", 8 + len(payload)) + payload


def build_collective(json_text, device_name, files, mdat=(0, 0), kind=b"mmmm"):
    """Build a collective .amxd: patcher JSON plus embedded dependencies.

    kind: the device type at offset 8 -- b"mmmm" MIDI effect, b"aaaa" audio effect,
    b"iiii" instrument (the same code sits in the patcher's project.amxdtype).

    files: [(filename, bytes, four-char type)] -- b"TEXT" for .js, b"JSON" for
    a patcher, b"mx@c" style four-char codes otherwise.  mdat is one classic-Mac
    (1904 epoch) timestamp per entry; it is metadata only, never validated.

    Use this to turn a plain device into one that carries its own scripts.
    Verified by rebuilding a Max-written collective byte for byte.
    """
    payload = json_text.encode("utf-8") + b"\x00"
    blobs, entries, off = [payload], [], 16

    def entry(name, size, offset, ftype, flag, when):
        return _rec(b"dire",
                    _rec(b"type", ftype) + _rec(b"fnam", _pad(name))
                    + _rec(b"sz32", struct.pack(">I", size))
                    + _rec(b"of32", struct.pack(">I", offset))
                    + _rec(b"vers", struct.pack(">I", 0))
                    + _rec(b"flag", struct.pack(">I", flag))
                    + _rec(b"mdat", struct.pack(">I", when)))

    entries.append(entry(device_name, len(payload), off, b"JSON", 17, mdat[0]))
    off += len(payload)
    for i, (name, data, ftype) in enumerate(files):
        blobs.append(data)
        entries.append(entry(name, len(data), off, ftype, 0,
                             mdat[i + 1] if len(mdat) > i + 1 else 0))
        off += len(data)

    dlst = _rec(b"dlst", b"".join(entries))
    body = b"mx@c" + struct.pack(">III", 16, 0, off) + b"".join(blobs) + dlst
    head = (b"ampf" + struct.pack("<I", 4) + kind
            + b"meta" + struct.pack("<II", 4, 7)
            + b"ptch" + struct.pack("<I", len(body)))
    assert len(head) == BASE
    return head + body


def read_amxd_bytes(buf):
    import tempfile
    import os
    fd, tmp = tempfile.mkstemp(suffix=".amxd")
    try:
        os.write(fd, buf)
        os.close(fd)
        return read_amxd(tmp)
    finally:
        os.path.exists(tmp) and os.unlink(tmp)


# --- text surgery on the patcher JSON ------------------------------------
def match_bracket(text, i):
    """Index just past the [ or { opening at text[i], ignoring brackets in strings."""
    open_c = text[i]
    close_c = {"[": "]", "{": "}"}[open_c]
    depth, j, in_str, esc = 0, i, False, False
    while j < len(text):
        c = text[j]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
        elif c == '"':
            in_str = True
        elif c == open_c:
            depth += 1
        elif c == close_c:
            depth -= 1
            if depth == 0:
                return j + 1
        j += 1
    raise ValueError("unbalanced bracket")


def find_array(text, key, start=0):
    """(open_index, index_just_past_close) of the array value for `key`.

    Searches forward from `start`, so to reach a nested patcher's own "boxes"
    you first locate that patcher, e.g.

        bp    = text.index('"maxclass" : "bpatcher"')
        inner = text.index('"patcher" :', bp)
        b0, b1 = find_array(text, "boxes", inner)
        l0, l1 = find_array(text, "lines", b1)   # after boxes, so not a nested one
    """
    k = text.index('"%s"' % key, start)
    b = text.index("[", k)
    return b, match_bracket(text, b)


def splice_into_array(text, bounds, rendered):
    """Append pre-rendered JSON items before an array's closing bracket.

    Splicing shifts every offset after it, so when you have several arrays to
    fill, compute all the bounds first and then splice the LAST one first --
    "lines" before "boxes", since "boxes" comes earlier in the text.
    """
    start, end = bounds
    body = text[start + 1:end - 1]
    joiner = ", " if body.strip() else ""
    return text[:end - 1].rstrip() + joiner + rendered + text[end - 1:]


def array_items(text, bounds):
    """[(start, end)] of each top-level item in a JSON array, by text span."""
    start, end = bounds
    items, i = [], start + 1
    while i < end - 1:
        if text[i] in "{[":
            j = match_bracket(text, i)
            items.append((i, j))
            i = j
        else:
            i += 1
    return items


def filter_array(text, bounds, keep):
    """Rewrite an array keeping only items for which keep(parsed_item) is true.

    Kept items are spliced back as their ORIGINAL text, so nothing that stays
    is re-serialised.  Returns (new_text, dropped_count).
    """
    kept, dropped = [], 0
    for a, b in array_items(text, bounds):
        if keep(json.loads(text[a:b])):
            kept.append(text[a:b])
        else:
            dropped += 1
    if not dropped:
        return text, 0
    start, end = bounds
    body = ("\n" + ", ".join(kept) + "\n") if kept else ""
    return text[:start] + "[" + body + "]" + text[end:], dropped


def remove_boxes(text, bounds_boxes, bounds_lines, ids):
    """Drop boxes by id and every patchline that touches them.

    Do the LINES array first when it sits after the boxes array, or pass
    bounds computed fresh; this helper handles the ordering itself.
    """
    ids = set(ids)
    assert bounds_lines[0] > bounds_boxes[1], "expected boxes before lines"
    text, nl = filter_array(text, bounds_lines,
                            lambda l: l["patchline"]["source"][0] not in ids
                            and l["patchline"]["destination"][0] not in ids)
    text, nb = filter_array(text, bounds_boxes, lambda b: b["box"]["id"] not in ids)
    return text, nb, nl


def render_box(attrs, tabs=3):
    """One patcher box.  attrs is the box dict: id, maxclass, text, ..."""
    t = "\t" * tabs
    body = ",\n".join('%s\t\t"%s" : %s' % (t, k, json.dumps(v, ensure_ascii=False))
                      for k, v in attrs.items())
    return '%s{\n%s\t"box" : \t%s{\n%s\n%s\t}\n\n%s}\n' % (t, t, t, body, t, t)


def render_line(src, src_out, dst, dst_in, tabs=3):
    t = "\t" * tabs
    return ('%s{\n%s\t"patchline" : \t%s{\n'
            '%s\t\t"destination" : [ "%s", %d ],\n'
            '%s\t\t"source" : [ "%s", %d ]\n'
            '%s\t}\n\n%s}\n' % (t, t, t, t, dst, dst_in, t, src, src_out, t, t))


if __name__ == "__main__":
    import sys
    for p in sys.argv[1:]:
        d = read_amxd(p)
        j = json.loads(d["json_text"])
        print("%s\n  %d bytes, patcher %d bytes, %d root boxes"
              % (p, len(d["raw"]), d["json_size"], len(j["patcher"]["boxes"])))
        for e in d["entries"]:
            print("    %-28s %8d bytes at %d" % (e["fnam"][0], e["sz32"][0], e["of32"][0]))
