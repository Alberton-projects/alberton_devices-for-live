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
  patcher's root `parameters` table, which Max keeps as a cache of names. Whether Live restores
  a saved value under the new name is checked at the next reload of the set (the four drum
  Modes were 0, 1, 2, 3 before).

## Not yet verified

- The mappers with sound: a held and retriggered note, the sustain pedal through the Bass
  Mapper, CC 123 releasing what is held, the four Modes after the rename.

- The three Live checks the V5 design rests on (`docs/PLAN.md` §3).
