# Installing

**Requirements.** Ableton Live 12 Suite (or Live with Max for Live) and Max 9. Verified with
Live 12.4.3 and Max 9.1.4 on macOS; nothing in the devices is platform-specific.

## By hand

Each device is one `.amxd` file with its scripts embedded: copy it into your User Library and
drag it from Live's browser. The `.js` beside it in this repository is the same script, kept
there as readable source; a device does not need it.

| Device | Kind | Where in the User Library |
|---|---|---|
| Alberton Bass Mapper, Drum Mapper, Transpose Q, Kit Selector V5, Kit Receiver, Dummy Tempo Automator | MIDI effect | `Presets/MIDI Effects/Max MIDI Effect/` |
| Alberton Kit FX Receiver, Beat Window | audio effect | `Presets/Audio Effects/Max Audio Effect/` |
| Alberton_Gamepad_v80 | MIDI effect | `Max for Live/` |

On macOS the User Library is `~/Music/Ableton/User Library/`; on Windows, `Documents\Ableton\
User Library`. Any folder Live's browser can see works.

## With the tool

```bash
python3 tools/install.py --release
```

copies every device of `tools/manifest.json` into the User Library at the paths above (edit
`install_root` in the manifest if yours is elsewhere), after checking that every embedded
script equals its source. Every file it replaces is first copied to `_archive/backups/`
beside it, with a date.

**Save your set before installing over a device it uses.** Live notices a replaced `.amxd`
and re-creates every instance of it by itself, seconds to a few minutes later, with the set
open.

## What the devices expect from a set

- The **Kit Selector** panel receives program changes only when its track is armed or
  monitoring In. A **Kit Receiver** goes before the instrument of each track that follows a
  strip; a **Kit FX Receiver** goes by each rack a bank should set (the nearest rack is the
  bound one). See `PROTOCOL.md`.
- **Transpose Q** moves every device whose name contains `[PITCH]` (Live's *Pitch* effect,
  renamed).
- One **Drum Mapper** per drum track, its `Mode` set to that drum; the **Bass Mapper** before
  the bass instrument.
- The **Beat Window** and the **Dummy Tempo Automator** ask nothing of the set.

## Development form

```bash
python3 tools/install.py --dev
```

installs each device *plain* and symlinks its scripts from this repository, so a saved edit to
a `.js` compiles in the running device within seconds (`autowatch`); a patcher edit is picked
up by Live's own reload of the file. Go back to `--release` before a show. Development form
needs the repository in place: the symlinks point into it.
