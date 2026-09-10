# Protocol

How the devices talk to each other and to Live. Part A is the Kit Selector V5 with its
receivers; Part B the other devices. The protocol of the retired V4.3 panel and its receiver
is kept in `docs/history/2026-09-10-protocol-kit-selector-v4.3.md`.

## A. Kit Selector V5

**Principle: the panel knows nothing about the set. It broadcasts; receivers on the tracks
decide what each message means there.** Every message travels on one Max `send` per bus,
`ks<bus>` (Bus 1–4, a setting on every device, never part of a kit); answers travel on
`ks<bus>_ret`. Max send names are global to the Live set, so a device on any track hears them.
In the patchers the sending side is a `forward` object (a `send` would relay the `set` that
names it) and the listening side a `receive` with no argument, named by the script with
`set ks<bus>` at compile time and on every bus change: a `receive` with an argument has no
inlet, so it could never be renamed.

### A.1 On the bus, from the panel

| Message | When | Meaning |
|---|---|---|
| `prog <strip> <value>` | a program dial moves, and on every recall, one every 150 ms | the strip's program, 0–127 |
| `vol <strip> <0..1>` | a volume dial moves, and on every recall, at once | the strip's track volume, in Live's mixer units (0.85 = 0 dB) |
| `fx <bank> <v1 … v9>` | an fx slider changes, and on every recall | nine macro values, 0–127, for the bank's rack |
| `fxvol <bank> <0..1>` | an fx volume dial moves, and on every recall | the bank's track volume |
| `capture` | the FX Capture button | every fx receiver answers with its rack's macros |
| `kit <slot>` | after a recall, once everything above has been sent | which kit it was, for anything that listens |
| `who` | at load, on Refresh, when the bus changes | every receiver introduces itself |

Sixteen strips, each a program and a volume; nine fx banks in the panel's order (drums, bass,
pads, pianos, leads, loops, vocoder, vocals, resample), each nine macros and a volume; and
Main, the one thing the panel writes to Live itself (`live_set master_track mixer_device
volume`). A kit is the whole of that: it is stored in the panel's `pattrstorage` in subscribe
mode, so Bus and MIDI Ch are never inside a kit. Recall by the grid, or by a MIDI program
change on MIDI Ch: program n recalls kit n + 1. A recall lets the dials settle, then sends
everything again in order, then `kit`.

### A.2 On the reply channel, from the receivers

| Message | From | Meaning |
|---|---|---|
| `bound <strip> <track name>` | a Kit Receiver, at load, when its strip changes, on `who` | the panel writes the name under the strip |
| `boundfx <bank> <track name>` | a Kit FX Receiver, likewise | logged |
| `fxret <bank> <v1 … v9>` | a Kit FX Receiver, answering `capture` | into the bank's slider |

### A.3 Alberton Kit Receiver (MIDI effect, one per track)

`Bus`, `Strip` 1–16, `Action`, `Apply Volume`, and `Last`, the value last received.
It learns its track from its own path. On `prog` for its strip it either sends a MIDI program
change on to the instrument (Action *Program Change*), or writes the track's rack — the rack
it sits inside, else the first rack on the track: its `Chain Selector` (Action *Chain
Selector*; a selector mapped to a macro is refused with the advice to choose that macro), or
`Macro n` (Actions *Macro 1–16*) — or does nothing (Action *None*, for a track that only
needs its volume). `vol` for its strip sets the track's volume when Apply Volume is on. MIDI
passes through; only the program change is added.

### A.4 Alberton Kit FX Receiver (audio effect, one per rack)

`Bus`, `Bank` 1–9, `Apply Volume`, and `Applied`, how many macros the last `fx` wrote. It
governs the nearest rack: the rack it sits inside when it is in a chain, else the first rack
after it on the track, else the last one before it — so a receiver dropped at the end of a
track takes the track's last rack. `fx` for its bank writes macros 1–9, skipping a disabled
one quietly; `capture` answers `fxret`; `fxvol` sets the track's volume when Apply Volume is
on. Audio passes through untouched. It fits any track: groups, audio, returns, MIDI.

### A.5 What the set must provide

Nothing by name. A receiver per track that should follow a strip, an fx receiver by each rack
that should follow a bank, and a MIDI track for the panel that is armed or monitoring In so
program changes reach it.

## B. The other devices

### B.1 Transpose Q to Live

- **Input:** `Pending` (`live.dial`, int) → `pending $1` → script. **Downbeat:** `plugsync~`
  outlet 2 → `change` → `sel 1` → a bang into the script's inlet 1, so it arrives when the
  beat count becomes 1. **Output:** the applied value on outlet 0 into an unnamed `live.dial`
  that shows the current transposition.
- **Targets (since Phase 2):** every device in the set whose name carries `[PITCH]`, on any
  track but the transposer's own; its parameter named `Pitch`. Rename a Pitch device to opt a
  track in. Cached as paths on first use, cleared by an observer on the track list, by a
  track-count change or by `rescan`. `Quantize` chooses the bar line, the beat or at once;
  Pending and Current run −24..24. In the set that is nine devices.
- **MIDI thru:** `midiin → midiout`.

### B.2 Dummy Tempo Automator to Live

`Tempo` (`live.dial`, float) → a `gate` opened by `Active` → `set tempo $1` → `live.object`
at `live_set`. Switching `Active` on re-sends the dial's value (`t i i` → `sel 1` → `f`).
`loadbang` sets the path. MIDI thru; the root `inlet → outlet` pair is inert. Automate the dial
from a clip envelope on the dummy track and Live's tempo follows.

### B.3 Gamepad

- Physical controls → 32 `live.map` / `live.remote~` pairs: Live's own mapping, no protocol.
- **Clip firing:** buttons → `pack i i` (state, slot) → `s slotFire` → `r slotFire` → the
  script's `list` → `fire_slot` on the target track, found by *name* among the scanned tracks.
  `scene <state> <n>` → `fire_scene`. **Track choice:** the `live.menu` → `s trackIdx` →
  `r trackIdx` → `msg_int`. **Init:** `live.thisdevice → delay 500 → refresh` → `scan_tracks`
  and `update_menu`, which sends `_parameter_range <names…>` from outlet 1 into the menu.
  **Outlet 0 status:** `fired <slot>`, `scene_fired <n>`.

### B.4 Mappers

Pure note transforms on the note lists `midiin` delivers. The Drum Mapper's `Mode` menu
(0 Kick, 1 Snare, 2 HiHat, 3 Cymbals) goes straight into the script's `msg_int`. Nothing is
exchanged between devices.

