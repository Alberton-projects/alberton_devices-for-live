# Shared blocks

Max's `js` object has no module system, so a block of code shared between devices is pasted
into each script verbatim, between `// --- begin shared: <name>.js ---` and `// --- end
shared: <name>.js ---` markers. The file here is the source; `python3 tools/sync_shared.py`
copies it into every script that carries the markers, and `--check` reports the ones that
drifted.

- `note-queue.js` — held notes, input pitch to the output pitches sounding for it, oldest
  first. Used by the Bass Mapper and the Drum Mapper.
