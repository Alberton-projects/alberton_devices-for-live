# CLAUDE.md

Project rules for this repository. Read on every session; keep it short.

## Where things are written down

`docs/SESSION-LOG.md` is the index: current state, what is open, what changed when. Read it
first. The plan is `docs/PLAN.md`; reasoning and verified Live/Max behaviours go in
`docs/HANDOFF.md`; how the devices talk to each other in `docs/PROTOCOL.md`; the August 2026
review and inventory, written before this repository existed, in `docs/history/`.

## What this is

Max for Live devices written for one live set, being made general enough for anyone with
Ableton Live to use: two note mappers, a bar-quantised transposer, a kit selector with its
receivers, a gamepad controller, a tempo automator and a beat window. Sibling of
`alberton_mcp-for-live`, which is how Live is driven for verification.

## Hard rules

**No set names in code.** A device may not know a track, a device or a plugin by name.
Whatever a set must tell a device is a parameter, a documented naming convention such as
`[PITCH]`, or a receiver placed on the track.

**One file installs a device.** The published `.amxd` carries its scripts embedded. The `.js`
lives beside it in the repository as the source, and `tools/check_embedded.py` must pass
before a device is committed as released.

**Edit patchers as text.** `tools/amxd.py` splices boxes and lines into the patcher JSON
without re-serialising it. Never `json.dump` a patcher back into a device.

**The set is played on stage.** Nothing the set uses is removed or renamed without a backup and
a reload plan. A new device version gets a new file name, and the old one stays installed until
the new one has passed the verification protocol (`docs/PLAN.md` §5) with the audio on.

**Every install leaves a dated copy.** `tools/install.py` copies the replaced file into
`_archive/backups/` beside it in the User Library.

**No domain logic in this repo.** The author's own music-and-mathematics system must not
appear here: not in code, not in constants, not in comments.

**English only** in code, comments, documentation and commit messages.

## Things Live and Max do that are not obvious

- A Max for Live MIDI device without a `midiout` fed from `midiin` swallows MIDI for every
  device after it in the chain. Every MIDI device here passes MIDI through.
- Live restores blob-typed state after ordinary parameters. State a script owns is reconciled
  after `live.thisdevice`, never on `loadbang`.
- `autopattr @greedy 1` binds every named object, so a new control becomes a member of every
  saved preset; the Kit Selector's `pattrstorage` is in subscribe mode for that reason.
- Renaming a Live parameter in a patcher loses its saved value in every set that uses the
  device (verified 2026-09-09 on the Drum Mapper's Mode). Parameters that carry state keep
  their names.
- `LiveAPI.id` is the string `"0"` for a path that resolves to nothing. Test `api.id != 0`
  (the scripts' `exists()`), never truthiness.
- Live re-creates every instance of a device when its `.amxd` changes on disk, seconds to a few
  minutes later, with the set open. Save the set before any install.
- A `receive` with an argument has no inlet: to rename one from a script it must be created
  without an argument and named by `set`.
- An int parameter in Live has 256 steps at most; a wider range needs a float parameter.

## Environment (verified 2026-09-08)

- macOS, Apple Silicon. Ableton Live 12.4.3 Suite, Max 9.1.4.
- User Library: `~/Music/Ableton/User Library/`. MIDI devices in `Presets/MIDI Effects/Max MIDI
  Effect/`, audio devices in `Presets/Audio Effects/Max Audio Effect/`, the Gamepad in
  `Max for Live/`. Superseded files and dated backups in an `_archive/` folder beside them.
- The set: `~/Music/Ableton/User Library/Alberton Multiverse/Alberton Multiverse.als`, with
  `TGHC Song.als` beside it using the same devices.
- Live is driven for verification through the Alberton MCP (`mcp__alberton__*` tools) or the
  Remote Script socket at 127.0.0.1:17853.

## Development loop

Development form: `python3 tools/install.py --dev` writes each device plain into the User
Library and symlinks its scripts from this repository, so `autowatch 1` reloads a script edit
the moment it is saved (verified 2026-09-08). A recompile resets the script's global state:
every script therefore reads its controls back at compile time (`syncFromPatcher`), and any
new script-held state must be covered there too. Caches rebuild themselves on first use.
Release form: `tools/embed.py --write`, then `tools/check_embedded.py`, then
`tools/install.py --release`. **Before a show, every device is installed in release form.** Verify against the real set, not only by reading: write a
parameter, read it back over MCP, compare.
