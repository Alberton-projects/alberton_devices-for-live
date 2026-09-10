# alberton_devices-for-live

Max for Live devices that grew inside one live set and were then made general: none of them
knows a track, a device or a plugin by name. Whatever a set must tell a device is a
parameter, a documented convention such as a `[PITCH]` tag, or a receiver placed on the
track. Together they make one instrument, distributed over a set: a panel that recalls
whole kits over a bus, receivers that bind it to tracks and racks, two note mappers, a
transposer quantised to the bar, a game controller, a tempo automator and a beat window.

| Device | Kind | What it does |
|---|---|---|
| [Kit Selector](devices/kit-selector/) | MIDI effect | sixteen strips of program and volume, nine fx banks, Main; kits on a grid or by program change; broadcasts on a bus |
| [Kit Receiver](devices/kit-receiver/) | MIDI effect | one per track: a strip becomes a program change, a chain selector, a macro, or a volume |
| [Kit FX Receiver](devices/kit-fx-receiver/) | audio effect | one per rack: a bank sets its macros; captures them back |
| [Drum Mapper](devices/drum-mapper/) | MIDI effect | any note onto one drum's General MIDI sounds: kick, snare, hi-hat or cymbals |
| [Bass Mapper](devices/bass-mapper/) | MIDI effect | folds every note into the bass register, by octaves |
| [Transpose Q](devices/transpose-q/) | MIDI effect | transposes every `[PITCH]` device on the next bar line, beat, or at once |
| [Gamepad](devices/gamepad/) | MIDI effect | a PlayStation-style pad maps parameters, sends notes, fires clips and scenes |
| [Dummy Tempo Automator](devices/tempo-automator/) | MIDI effect | a dial that sets Live's tempo, so a clip envelope can |
| [Beat Window](devices/beat-window/) | audio effect | the beat, large, in a floating resizable window, with a ring that lights on it |

Each folder holds the device, its script as readable source and a README. Installing is one
file per device: [`docs/INSTALL.md`](docs/INSTALL.md). How the kit devices talk to each
other, and the others to Live: [`docs/PROTOCOL.md`](docs/PROTOCOL.md).

Verified with Ableton Live 12.4.3 and Max 9.1.4 on macOS.

## Working on the devices

```bash
npm test                              # the scripts, under Node, against a stub of Max
python3 tools/check_embedded.py       # every embedded script equals its source
python3 tools/install.py --dev        # plain devices, scripts symlinked, edits compile live
python3 tools/install.py --release    # the embedded devices, before a show
```

Patchers are edited as text (`tools/amxd.py`) or generated (`tools/build_devices.py` for the
kit devices and the Beat Window), never re-serialised. `docs/HANDOFF.md` records what Live
and Max were actually observed to do along the way, `docs/SESSION-LOG.md` where the work
stands, `docs/PLAN.md` how it was planned, and `docs/history/` the review that started it.

The history is honest: the first two commits hold the devices as they were before the
review of August 2026 and as installed on 2026-09-08; every change since is its own commit.
The devices were verified on the set they came from, with the audio on, through the sibling
project [`alberton_mcp-for-live`](https://github.com/Alberton-projects/alberton_mcp-for-live),
which drives Live from an LLM.

Also in Catalan: [README.ca.md](README.ca.md).

## Licence

MIT, © 2026 Albert Burcet. See [LICENSE](LICENSE).
