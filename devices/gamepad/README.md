# Alberton Gamepad

A MIDI effect that turns a game controller into a Live controller, through Max's `gamepad`
and `hi` objects. Made for a PlayStation-style pad: L1 L2 L3 and Share, the D-pad, the left
stick, R1 R2 R3 and Options, triangle, circle, cross and square, the right stick, the
touchpad (its click and two touches) and, over USB only, the gyroscope and the accelerometer.

Every control has a mode switch, **M / N / S**:

- **M — Map.** Click *Map*, then a parameter in Live, as with Live's own mapping; `Min` and
  `Max` scale the control, `Tgl` makes a button toggle instead of hold.
- **N — Note.** The control sends a MIDI note: channel, note and velocity are set beside it.
- **S — Slot.** A button fires a clip slot on the chosen track (the slot number is set beside
  it); other buttons fire scenes.

The track is chosen on the `Track` menu. The choice is kept **by name** and saved with the
set, so it survives reopening even when tracks were added or moved meanwhile; `↻` rescans the
tracks. *Sensors* unfolds the gyroscope and accelerometer controls.

The file keeps its old name, `Alberton_Gamepad_v80.amxd`, so sets that already use it keep
their mappings.

Source: `slot-fire.js` (the clip and scene firing and the track choice), embedded in the
`.amxd`; the mapping and the notes are patcher wiring.
