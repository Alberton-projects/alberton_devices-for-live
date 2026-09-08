# Editing Max for Live devices without Max

Worked out on 2026-08-04 fixing `Step_Sequencer_v4.amxd`, which always started with
one sequence playing. Everything here is verified against Ableton Live 12.4.3 on macOS.

- `amxd.py` — read and rewrite `.amxd` containers. Run it on a device to dump its layout.
- `examples/01_start_silent.py` — add objects to a patcher (the fix that started this).
- `examples/02_write_preset.py` — generate a `.adv` preset with musical content.

## The three things worth remembering

### 1. A `.amxd` is a container, and its size fields are inconsistent

The patcher is plain JSON inside a small wrapper, followed by any files the patcher
depends on, followed by a directory. Full layout in the `amxd.py` docstring. The traps:

- The `ptch` size at offset 28 is **little-endian**. Every other size is big-endian.
- Offsets are relative to **byte 32**, not 0. The patcher's `sz32` counts its trailing NUL.
- Change the JSON length by N and four fields need N added. `write_amxd` handles it.
- Nothing is checksummed. `mdat` is a 1904-epoch date, not a hash. The `OriginalFileSize`
  and `OriginalCrc` a Live set stores for a device are hints for finding a moved file,
  not validation — patching a device does not invalidate sets that already use it.

**Edit the JSON as text, never by re-serialising it.** A patcher is thousands of floats
and a device that fails to open gives you nothing to debug with. `find_array` +
`splice_into_array` do a string-aware bracket match so you can add boxes and patchlines
to exactly the array you mean and leave every other byte untouched.

### 2. Live restores a device's blob *after* its parameters

This is the bug class, not just one bug. A `live.*` object whose parameter is declared as
a blob — `live.step` is the usual suspect — is saved separately from the ordinary
parameters, in an `MxDBlob`, and restored later. So if the patch mirrors blob state in a
normal parameter (a toggle that says whether a lane is active, say), a set can load with
the two disagreeing, and no amount of clicking fixes it: the toggle already holds the
value you want, so it sends nothing.

The fix is always the same shape — do the reconciling once the device is genuinely ready:

    [live.thisdevice] → [deferlow] → the messages that force the state you want

`live.thisdevice`'s left outlet bangs after Live has restored everything. `deferlow`
buys one more pass in case anything lands in the same event cycle. `loadbang` is too
early and will not work.

Same reason blob content is **invisible to the Live Object Model**: it is not in
`device.parameters`, so an MCP server or any LOM client can read the knobs and not one
note of the sequence.

### 3. `live.step` stores its grid as one flat list

    [ nseq,
      (loop_length, loop_start) × nseq,
      per sequence: [active, step_ticks/10, 0, nsteps, y_min, y_max, 0, 0]
                    + nsteps × [pitch, velocity, dur_code, dur_amount, probability] ]

Four sequences of sixteen steps is 361 numbers. `active` is 0/1 — that is the flag that
was surviving load. `step_ticks/10` matches the device's own timing menu: 12 = 1/16,
18 = 1/16 dotted, 24 = 1/8, 36 = 1/8 dotted, 48 = 1/4. `y_min`/`y_max` are the editor's
display range and sit one semitone outside the pitches actually used. `probability` 127
means always. Duration is a pair: a note-value code (4 or 5 in practice) and an amount
where 100 reads as full.

A `.adv` preset carries this list as hex-encoded JSON in `<BlobSlot>`, alongside the
plain parameter values — so a preset is the way to write musical content into a device
from outside Live. Take an existing preset as the template and change only what you mean
to; copy the `<PatchSlot>` `FileRef` verbatim out of a Live set that already uses the
device rather than composing one.

## How to not break a device

1. Copy the original next to it with a dated suffix. Live ignores unknown extensions.
2. Dry-run first: build the new bytes, verify, and only then write.
3. Verify from disk with a *different* decoder than the one that wrote it.
4. Check the embedded files came through byte-identical — they carry the patcher's JS.
5. Editing a device does not update copies already open in Live. Reload the set.
