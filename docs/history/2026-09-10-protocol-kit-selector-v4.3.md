# Kit Selector V4.3 and the PC Kit Selector Receiver: the protocol until 2026-09-10

Read out of the patchers on 2026-09-08 and kept here for the record: this is how the panel of
January 2026 and its receiver talked, until the set switched to V5 on 2026-09-10 (`docs/PROTOCOL.md`
part A). Both devices are in this repository's history (they left the tree when it was published)
and stay installed in the author's User Library, used by no set.

## Kit Selector V4.3

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

### B.4 Names the V4.3 set must provide

All of these disappear in V5.

- **Tracks:** `Kick`, `Snare`, `HiHat`, `Cymbals`, `Bass Electric`, `Bass Synth`, `Pad 1`,
  `Pad 2`, `Piano 1`, `Piano 2`, `Lead 1`, `Lead 2`; group names containing `DRUMS`, `BASS`,
  `PADS`, `PIANOS`, `LEADS`, `LOOPS`; `Vocoder`, `Vocals`, `Resample`, `Live Scratcher`; for
  the transposer, any name containing `bass`, `pad`, `piano`, `lead` or `vocoder`, with
  `MIDI REC` excluded.
- **Devices:** a name containing `[PITCH]` (or the class `MidiPitcher`), a name containing
  `[FX]`, a parameter name containing `Chain`.
