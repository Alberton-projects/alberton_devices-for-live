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
- **Development-loop test, first half.** A marker appended to the loose
  `alberton-transpose-v2.js` beside the installed (embedded) Transpose Q did not reach the
  running instance: either the embedded copy is what Max compiled, or `autowatch` is inert
  for it. The set reload decides (SESSION-LOG).

## Not yet verified

- Which copy the `js` object loads when a script is both embedded and beside the device.
- Whether `autowatch 1` follows a symlinked script inside Live. Phase 0.3 answers both.
- The three Live checks the V5 design rests on (`docs/PLAN.md` §3).
