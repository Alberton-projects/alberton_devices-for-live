# Alberton Transpose Q

A MIDI effect that transposes a whole rig together, in time: a pending transposition is
applied on the next bar line, on the next beat or at once, to every device in the set whose
name carries the tag `[PITCH]`.

| Parameter | Range | What it does |
|---|---|---|
| `Pending` | −24..24 | the transposition to apply next, in semitones |
| `Current` | −24..24 | the transposition applied now (a display) |
| `Quantize` | Bar / Beat / Off | when Pending is applied |

**The convention.** On every track that should follow, put a device with a parameter named
`Pitch` (Live's own *Pitch* MIDI effect) and rename it so its name contains `[PITCH]`. Any
track but the transposer's own is a target; nothing else about the set is assumed. The
targets are found once and kept as paths, because the write happens on the bar line and
must not walk the set then; the cache clears itself when tracks are added or removed, or on
the message `rescan`.

Put it on any MIDI track; it reads the beat from Live's transport and writes through the
Live API, so the track needs no MIDI input. MIDI passes through. `debug 1` makes it talk in
the Max window.

Source: `alberton-transpose-q.js`, embedded in the `.amxd`.
