# Alberton Bass Mapper

A MIDI effect that folds every note into the bass register, by octaves, so whatever plays
into the track lands where a bass can play and keeps its note name. Put it on the bass
track, before the instrument.

| Parameter | Default | What it does |
|---|---|---|
| `Low` | C1 (36) | the bottom of the window |
| `High` | C3 (60) | the top of the window; the window stays at least an octave wide |

A note inside the window passes unchanged; a note outside is moved by whole octaves until
it is inside. Held notes are remembered per input pitch, so a note-off releases what was
actually sounding, even when the same pitch sounds twice at once (two sources into one
track, a sequencer retriggering a held note). CC 120 (all sound off) and CC 123 (all notes
off) release everything the device holds; so does the message `reset`. Everything that is
not a note (control changes, pitch bend, aftertouch, program changes) passes through.

Source: `alberton-bass-mapper.js`, embedded in the `.amxd`. The held-notes block is shared
with the Drum Mapper (`../_shared/note-queue.js`).
