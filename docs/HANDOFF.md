# Handoff

Why things are the way they are, and what Live and Max were actually observed to do. The
August 2026 record is in `docs/history/`; this file carries what came after.

## Where the devices come from

Seven devices are original: Drum Mapper, Bass Mapper, PC Kit Selector Receiver, Kit Selector
V4.3, Transpose Q, Dummy Tempo Automator and Gamepad v8.0. Verified by reading every file:
the plugin names in `live_controller.js` are the plugins it controls, not foreign code.

Two devices in the same set are not, and are not published: the Step Sequencer (Ableton's
own, with its `swingCalc.js` and annotations) and VisualBeat (downloaded, then given a
floating window; licence unknown, so it is being rewritten from scratch as Beat Window).

`Alberton Tempo Automation v1.3.maxpat` is the January patcher of the Dummy Tempo Automator,
box for box; the August repairs live in the `.amxd`. Kit Selector V3 embeds an older
`live_controller.js` and is in no set. Both archived on 2026-09-08.

## Verified on 2026-09-08

- **Kits do not travel inside the Kit Selector file.** `pattrstorage alberton_kits` has
  `@parameter_enable 1`, so the saved kits and their names live in the `.als`, not in the
  `.amxd`. The only state inside the device is the `autopattr` restore of four controls.
- **The drum chain writes work by the name of a macro.** On all four drum tracks the rack's
  real `Chain Selector` (parameter 17) is disabled because it is mapped to Macro 1, and Macro 1
  is *named* "Chain Selector", so `setDrumChain`, which takes the first parameter whose name
  contains "Chain", writes the macro and succeeds. The 800-a-day "parameter is disabled"
  errors of August do not come from here; still open.
- **The Gamepad forgets its track** because the track `live.menu` is a Live parameter whose
  saved range is four placeholder items: Live restores the index, the menu clamps it, and
  `slot-fire.js` fills the real list 500 ms later. A `pattr GPTrackSel @autorestore 1` writes
  the value saved inside the `.amxd` on top. Fix in `docs/PLAN.md` §4.
- **The extraction script in the September handoff** drops the first lines of a script whose
  file does not start with a comment: `slot-fire.js` lost `autowatch`, `inlets`, `outlets`.
  The sources of record are the loose `.js` files, now in this repository.
- **The 2026-09-03 change** (`VOL_MASTER = 0.85`) was made on stage and is recorded as §12 of
  the August review, closed: V5 stores the Main level per kit and the constant goes away.

- **Both mappers pass notes only.** `midiin → midiparse` outlet 0 → script → `midiformat`
  inlet 0 → `midiout`, and nothing else is connected. Control changes, pitch bend, aftertouch
  and program changes stop at the mapper. On *Bass Electric* that means no sustain pedal and no
  pitch bend reach the Fretless Bass. Fix in Phase 1: connect the other outlets straight
  through, as the Receiver does, and feed CC 123 to the script's `reset`.
- **Transpose Q's display dial** (`live.dial[1]`, the applied value) has range 0–127, so a
  negative transposition shows as 0. `Pending` is −12..12.
- **When a script is both embedded and beside the device, Max compiles the embedded copy.**
  A marker appended to the loose `alberton-transpose-v2.js` beside the installed (embedded)
  Transpose Q reached neither the running instance nor a freshly loaded one after the set was
  reopened. So a loose `.js` next to a released device is inert, and the development form has
  to be a *plain* device. The second half settled the development form: a *plain* device with its script
  **symlinked** from the repository loads that file (dial 7 after the reload), and
  `autowatch 1` follows the symlink (dial 8 within seconds of saving, no reload). One caveat
  that matters: **a recompile resets the script's global state**, every `var` included, so a
  device whose script holds state needs its init run again after a save: `refresh` on the Kit
  Selector, `↻` on the Gamepad. Hence the rule: development form only during a work session,
  release form before a show.
- **Renaming the Drum Mapper file worked as designed.** After `fix_als_path.py` on both sets
  and the rename, the four instances loaded under the new name with their modes intact
  (Kick 0, Snare 1, HiHat 2, Cymbals 3). The instance on *Cymbals* is switched off (Device
  On off); it was not touched, and whether that is deliberate is a question for the owner.

## Verified on 2026-09-09

- **Kit Selector, Phase 1 script, on the live set.** Installed in development form and driven
  over MCP: the Kick dial set to 5 wrote 5 to the macro named "Chain Selector" on the Kick
  track through the cached path, and back to 0; pressing Send ran `sendAll`, which took the
  master from −6 dB to 0 dB (the only volume not already at its default) and left every other
  volume at its policy value, and the Receiver on Bass Synth showed PC 3 for the BassS dial at
  3, so the queue, the broadcast and the receiver all work with the guarded script. A
  `live.button` pressed over the LOM stays at 1 until written back to 0.
- The Transpose Q display dial came back as 7 after the set was reopened, so the set was
  saved at some point during the tests with the marker value in it; a display dial only,
  reset to 0.

- **Transpose Q, Phase 1 script, on the live set.** Installed in development form, driven
  over MCP with the Main muted: Pending 2, transport running, and on the next downbeat
  `Current` read 2 and every one of the nine `[PITCH]` devices read Pitch 2; Pending 0, one
  bar later, all nine back to 0. The observer on `live_set tracks` was created on the first
  application without complaint. The Live parameter list now reads `Current` and `Pend`, in
  that order: renaming the dial changed the order of the device's parameters, which anything
  addressing them by index must know.

- **Renaming a Live parameter in the patcher** (the Drum Mapper's menu `live.menu` → `Mode`,
  the Transpose Q dial → `Current`) is done in two places: the box's `valueof` and the
  patcher's root `parameters` table, which Max keeps as a cache of names. **Live does not
  restore a saved value under a new name**: after the rename the four drum Modes, which were
  0, 1, 2, 3, all came back as 0 and had to be set again over MCP. So a parameter that carries
  state in someone's set keeps its name, or the release notes say what to set again. The
  Humanize toggle, new, came up at its initial value 1 on all four, as intended.

- **The Drum Mapper's targets are General MIDI, the kits are not always.** Read over the
  bridge socket on 2026-09-09: of the ten kits in the DRUMS Selector, six Daft Punk kits and
  the Simmons kit carry exactly Crash 1 (49), Ride 1 (51), Ride Bell (53) and Crash 2 (57);
  Yellow Kit lacks 53 and 57; Latin Pop and Basic Beat Box are not drum kits in that zone. No
  kit has Splash (55), Ride 2 (59) or China (52), and the old snare pool sent hits to 47, 48,
  50 and 52, empty almost everywhere. Hence the rule now in the script: **a mode passes
  through only the notes it targets itself**, and in SNARE mode the six GM toms by exact
  note, so nothing is ever sent to a pad the mode does not target and a kit needs only
  those pads. The snare pool is the four GM snare sounds, snares three times as likely as
  side stick and clap. The kit-side gaps (Yellow Kit) are the owner's to fill or not. The
  full pad map is in the MCP working directory, `_handoff-devices/kits-drums-2026-09-09.md`,
  because it describes the set, not the devices.

- **A recompile really does lose the controls.** Saving the Drum Mapper script while the set
  was open recompiled all four instances and every one behaved as KICK: `mode` was back at 0
  and the Mode menus, still showing 1, 2 and 3, had not sent their values again. Fixed by
  nudging the three menus over MCP, and for good in every script: a Task scheduled at compile
  time reads the patcher's controls with `patcher.getnamed(varname).getvalueof()` (Mode and
  Humanize, Low and High, Pending and Current, the twelve Kit Selector dials), so a recompile
  restores the state it just lost. Harmless at a normal load. **Verified in Live the same day**
  on the Transpose Q: with the Current dial set to 5 over the LOM, a forced recompile (the
  file touched) and Pending 5, eight bars of transport changed no Pitch device, and Pending 0
  then brought Current to 0: the script had read both dials. `patcher.getnamed(varname)`
  and `Maxobj.getvalueof()` work from a Task scheduled at compile time.

- **A `live.menu` needs parameter mode to hold a list.** With `parameter_enable 0` the menu
  had no enum, printed "Something bad happened, there's no enum" on every message and vanished
  from the device. So the Gamepad's menu stays a Live parameter; the choice lives in the pattr
  by name, an int the menu emits before the first scan is ignored, and the script never sends
  it an empty list.
- **`live.thisdevice` can fire before the set's Live API answers.** At load the Kit Selector's
  refresh found `live_set` unreachable (the old script had the same branch, so this predates
  the rewrite). It now retries every half second for ten seconds, and every write builds the
  caches on first use anyway.
- **`dict: could not retrieve key 1`**, four times at load, comes from the Gamepad's own
  patcher (its `dict` objects), not from anything changed here. Noted, not chased.

- **A bare `pattr @parameter_enable 1` keeps a symbol with the set.** Verified 2026-09-09 on
  the Gamepad: the track chosen on the menu before closing the set was back after reopening.
  So a script can own a piece of state by name and have Live save it, with a `pattr` as the
  keeper and `prepend restore` feeding it back; no `live.*` object and no js parameter needed. The pad fired clips and scenes on the chosen
  track the same evening: Phase 1 is complete on every device.

- **Transpose Q, Phase 2, on the live set.** Driven over MCP with the Main muted: with Quantize
  on the bar, Pending 2 reached the same nine `[PITCH]` devices found by the tag alone, on the
  bar line; with Quantize off and the transport stopped, Pending 0 and then 20 were applied at
  once, Current following; the dials accept ±24. The Live parameter list reads Current, Pend,
  Quant.

- **Drum Mapper, Phase 2, on the live set.** After the reload every instance listed its
  nineteen parameters at the GM defaults with Mode and Humanize intact (no rename this time).
  With Open Hat From set to 127 over MCP, hard hi-hat hits stayed closed or pedal; the owner
  moved Crash 2 and a hard odd-key hit followed it. So the dials reach the script live, through
  their prepends, and the compile-time read-back covers them.

- **`LiveAPI.id` of a path that resolves to nothing is the string `"0"`.** Found with a probe
  device on 2026-09-09 (and before the API is up it is a falsy 0). `"0"` is true in JavaScript,
  so `if (!api.id)` never catches a dead path: the Phase 1 rewrites had that regression, and
  the original scripts' `!api.id || api.id == 0` was right all along. Every script now tests
  `api.id != 0` through one helper, `exists()`, and the Node stub answers `"0"` like Max, which
  is what caught the five affected paths.
- **V5 design checks 1 and 3 passed on the set**, with throwaway devices generated by
  `tools/patcher.py` (`test/live/build_v5_checks.py`) and driven over MCP: one Max `send` per
  bus carrying `prog <strip> <value>`, filtered by strip in the receiver, delivered 42 to
  `Got`; a `pattrstorage` in subscribe mode beside `autopattr @greedy 1` recalled A and left G
  alone. `Track.insert_device` and `Chain.insert_device` accept Live's own device names but
  not a Max for Live device, and the browser loads at the selected position on the track, so
  putting a device inside a rack chain over the LOM is not possible: it is a drag in Live.
- **V5 design check 2 passed too**, once the owner had dragged the FX receiver into the
  rack's chain: `this_device canonical_parent canonical_parent` is the rack, and the receiver
  wrote 52..59 into Macro 1..8 from inside; on the track the same path is the Song, which has
  no `class_name`, so a receiver must refuse to write unless its parent is a rack. After the
  drag the receiver's strip dial read 16 instead of 1, most likely a touch while dragging; a
  receiver should show its strip large and plain. The three throwaway devices are gone from
  the User Library; `test/live/build_v5_checks.py` rebuilds them.

- **Alberton Kit Receiver, on the set** (2026-09-09, a test track with a throwaway panel and
  an Instrument Rack, driven over MCP): a program for its strip went out as a program change
  and showed on Last; with Action at Macro 1 it wrote Macro 1 of the first rack on its track;
  with Action at Chain Selector it wrote the rack's chain selector; a program for another strip
  was ignored; "who" from the panel brought back "bound <strip> <track name>" into a freshly
  loaded panel, and a strip change re-announced. Devices loaded from the browser need no set
  reload, which makes this kind of test cheap. A `live.button` sends a bang, not its name:
  the panel's Who needed a `bang()`.

- **Kit Selector V5 panel with two Kit Receivers, on the set** (2026-09-09, three test tracks,
  driven over MCP): P1 66 reached Macro 1 of the rack on the track whose receiver is strip 1
  with Action Macro 1; V1 set that track's volume; P2 showed on the strip-2 receiver's Last and
  V2 set its volume. The bus channel, the strip filter, the program queue and the volume path
  all hold together end to end. The kit grid, the labels and the MIDI recall need hands and
  eyes: the owner's.

- **The 800 "parameter is disabled" errors a day, solved.** Live's `Log.txt` (which carries
  every Max window line as "Message from Max") shows bursts of eight at each kit recall. The
  Vocals track's `[FX] Alberton per Track-1` rack has four disabled macros (LP/HP FILTER,
  REPEAT, DROP REPEAT, PING PONG: mapped elsewhere, so Live refuses writes), and V4.3 applies
  every fx bank twice per recall, once from the multislider's output and once from its
  `pattr @bindto`. Four times two. Both scripts now skip a disabled macro quietly; the double
  apply is harmless and stays in V5.0.
- **A track must be armed or monitoring In for a device to receive MIDI.** The V5 panel on a
  fresh test track (monitor Auto, not armed) never saw the controller's program changes while
  V4.3 on MIDI REC (monitor In) recalled kits from them; armed, the V5 panel recalled kit 1
  from PC 0. MIDI REC is set to In for exactly that reason.
- **`live.dial` is taller than it looks in the JSON.** A tiny dial with its name shown takes
  about 30 px and two of them per strip overlapped the row below, and a 40 px multislider
  with nine bars is unusable. Strip dials now hide their names (`showname 0`), rows are 78 px
  apart, and the fx banks are 70×40 as in V4.3, in two rows.
- **`song_batch` with three appended tracks** did not leave them named in call order (track 29
  came out as "V5 B"); renamed afterwards. Name tracks after creating them one at a time, or
  read the names back before using indices.

- **V5.0 kits, end to end** (2026-09-09, test tracks): the owner stored kit 1 on the grid with
  strip 1 at 66 / 0.4; the values were changed over the LOM to 10 / 0.9, reaching the rack
  macro and the track volume; a program change 0 from the external controller, with the
  panel's track armed, recalled the kit and the macro read 66 and the volume 0.4 again, the
  other strip untouched. Store, MIDI recall, the ordered re-send and the receivers hold.

## Not yet verified


- The three Live checks the V5 design rests on (`docs/PLAN.md` §3).
