# Protocol

How the devices talk to each other and to Live. Part A is the Kit Selector V5 with its
receivers (2026-09-10); Part B is V4.3 with the PC Kit Selector Receiver of January 2026,
read out of the patchers on 2026-09-08 and still installed until the switch.

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

## B. Kit Selector V4.3 (until the switch)

### B.1 Kit Selector to Receiver: eight named channels

The panel never patches a cable to a receiver. It broadcasts on Max `send` names, which are
global to the Live set, and each receiver listens to one of them.

| Channel (send / receive name) | Dial on the panel | Receiver `Track ID` item |
|---|---|---|
| `alberton_bass_e` | BassE | 0 `bass_e` |
| `alberton_bass_s` | BassS | 1 `bass_s` |
| `alberton_pad1` | Pad1 | 2 `pad1` |
| `alberton_pad2` | Pad2 | 3 `pad2` |
| `alberton_piano1` | Piano1 | 4 `piano1` |
| `alberton_piano2` | Piano2 | 5 `piano2` |
| `alberton_lead1` | Lead1 | 6 `lead1` |
| `alberton_lead2` | Lead2 | 7 `lead2` |

**Payload:** one int, the dial's value, 0–127. Sent whenever the dial changes, by hand or by
kit recall, and once more for every dial on `sendAll`. The panel does not send at once:
`live_controller.js` queues each value (`queuePC`) and emits `pc <key> <value>` from its outlet
one every 150 ms (`PC_QUEUE_INTERVAL`), because Analog Lab crashed when several program
changes arrived together; `route pc` and then `route bass_electric … lead2` dispatch each key
to its `send`.

**Receiver:** `Track ID` (a `live.menu`, saved with the set) → `+ 1` → the control inlet of
`switch 8`; the eight `receive` objects feed inlets 1–8 in the table's order; the chosen value
goes to `midiformat`'s program-change inlet and to the `PC Display` numbox. `midiformat` emits
it as a program change on the channel of the last MIDI message that passed through the receiver
(`midiparse` outlet 6 into `midiformat`'s channel inlet), channel 1 before any has. The
instrument after the receiver sees an ordinary MIDI program change.

**MIDI thru:** `midiin → midiparse → midiformat → midiout` re-formats notes, polyphonic
aftertouch, control changes, channel aftertouch and pitch bend. Incoming program changes are
*not* carried (`midiparse` outlet 3 is unconnected), so one arriving from outside is dropped
and only the receiver's own goes out. System exclusive is not carried. The root `inlet →
outlet` pair is inert: a Max for Live device's MIDI goes through `midiin`/`midiout`.

Several receivers may listen to one channel, so two tracks can follow one dial. A channel with
no receiver is simply unheard. `analyse.py` reports the eight receives as "receive with no
send" when it reads the receiver alone; that is the expected shape of a broadcast pair.

### B.2 Kit Selector to Live: what the script writes

| What | Trigger | How the target is found |
|---|---|---|
| Drum chain | the `Kick`, `Snare`, `HiHat`, `Cymbals` dials | the track whose name is exactly `Kick` / `Snare` / `HiHat` / `Cymbals`; on it, the first device parameter whose name contains `Chain`; the dial value 0–127 is written to it. In the set that is Macro 1 of the `Alberton DRUMS Selector` rack, named "Chain Selector" and mapped to the real chain selector, which is disabled for that reason |
| Melodic programs | the eight melodic dials | not written to Live: broadcast as in §1 |
| FX macros | the nine `multislider`s of nine values | tracks whose name contains `DRUMS`, `BASS`, `PADS`, `PIANOS`, `LEADS` or `LOOPS` **and** are group tracks (`is_foldable`), or whose name is exactly `Vocoder`, `Vocals` or `Resample`; on each, the first device whose name contains `[FX]`; its parameters 1–9, which in Live 12 are Macro 1 to Macro 9 |
| Volumes | every kit recall and the Send button | every track's `mixer_device volume` set to 0.70 (−6 dB), except by exact name `Bass Electric` 0.85, `Resample` 0.85, `Live Scratcher` 0.36, `Vocals` 0.625; both returns 0.70; the master 0.85 (0 dB, since 2026-09-03) |

`refresh` runs at `live.thisdevice` and on `bang`. It walks every track once, caching the drum
tracks and, for the melodic ones, the plugin's preset parameter when it exposes one named
`preset`, `program` or `patch` (`findPresetParameter`). That melodic cache is informational:
`setMelodicPreset` never reads it and always broadcasts.

### B.3 Kits: storing and recalling

- **Storage.** `pattrstorage alberton_kits @parameter_enable 1 @paraminitmode 1`, with
  `autopattr @greedy 1` binding every named object and a `pattr <key>` per dial. Members of a
  kit: the twelve dials, the nine FX multisliders, the kit name (`textedit presetname` through
  `pattr presetname`), `MIDI Ch`, and the FX Capture, Send and delete buttons. The kits are
  saved with the Live set, because the pattrstorage is a Live parameter, not inside the `.amxd`.
- **Recall by hand:** the `preset` object's slots. **Recall by MIDI:** `midiin → midiparse`;
  the channel (outlet 6) compared with `MIDI Ch` opens a `gate`; the program (outlet 3) →
  `+ 1` → `recall <n>` → pattrstorage. **Program change n recalls kit n + 1.**
- **After a recall:** `preset` reports the slot → `delay 50` → `sendAll` → the script re-sends
  the four drum chains, queues the eight programs, resets the volumes (§2) and emits
  `sent_all`. The FX values are pushed by each `pattr @bindto <key>_fx @autorestore 1` →
  `prepend <key>_fx` → `applyFX`. The resample slider's pattr binds to `vocals_fx[1]`, the
  varname it kept when it was cloned (`history/2026-08-04-review.md` §2).
- **Kit names:** slot → `- 1` → `current_preset <i>` → script → `current_name <name>` → `set`
  on the textedit. Typing a name → `route text` → `t b s` → `pak <i> <name>` →
  `preset_name <i> <words…>` → script.
- **Script outlet.** Everything leaves outlet 0 and is dispatched by `route pc drums_fx bass_fx
  pads_fx pianos_fx leads_fx loops_fx vocoder_fx vocals_fx resample_fx current_name`:
  `pc <key> <v>`; `<key>_fx v1 … v9` from `capture_fx`; `current_name <s>`; and unrouted status
  words `refresh_complete`, `sent_all`, `fx_captured`, `volumes_reset`, `name <i> <s>`,
  `names_data <s>`.
- `prepend goto_part` still exists, unfed, and the script has no `goto_part`
  (`history/2026-08-04-review.md` §9).

## C. The other devices

### C.1 Transpose Q to Live

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

### C.2 Dummy Tempo Automator to Live

`Tempo` (`live.dial`, float) → a `gate` opened by `Active` → `set tempo $1` → `live.object`
at `live_set`. Switching `Active` on re-sends the dial's value (`t i i` → `sel 1` → `f`).
`loadbang` sets the path. MIDI thru; the root `inlet → outlet` pair is inert. Automate the dial
from a clip envelope on the dummy track and Live's tempo follows.

### C.3 Gamepad

- Physical controls → 32 `live.map` / `live.remote~` pairs: Live's own mapping, no protocol.
- **Clip firing:** buttons → `pack i i` (state, slot) → `s slotFire` → `r slotFire` → the
  script's `list` → `fire_slot` on the target track, found by *name* among the scanned tracks.
  `scene <state> <n>` → `fire_scene`. **Track choice:** the `live.menu` → `s trackIdx` →
  `r trackIdx` → `msg_int`. **Init:** `live.thisdevice → delay 500 → refresh` → `scan_tracks`
  and `update_menu`, which sends `_parameter_range <names…>` from outlet 1 into the menu.
  **Outlet 0 status:** `fired <slot>`, `scene_fired <n>`.

### C.4 Mappers

Pure note transforms on the note lists `midiin` delivers. The Drum Mapper's `Mode` menu
(0 Kick, 1 Snare, 2 HiHat, 3 Cymbals) goes straight into the script's `msg_int`. Nothing is
exchanged between devices.

### B.4 Names the V4.3 set must provide

All of these disappear in V5.

- **Tracks:** `Kick`, `Snare`, `HiHat`, `Cymbals`, `Bass Electric`, `Bass Synth`, `Pad 1`,
  `Pad 2`, `Piano 1`, `Piano 2`, `Lead 1`, `Lead 2`; group names containing `DRUMS`, `BASS`,
  `PADS`, `PIANOS`, `LEADS`, `LOOPS`; `Vocoder`, `Vocals`, `Resample`, `Live Scratcher`; for
  the transposer, any name containing `bass`, `pad`, `piano`, `lead` or `vocoder`, with
  `MIDI REC` excluded.
- **Devices:** a name containing `[PITCH]` (or the class `MidiPitcher`), a name containing
  `[FX]`, a parameter name containing `Chain`.
