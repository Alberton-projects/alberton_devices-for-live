# Alberton Drum Mapper

A MIDI effect that maps any note onto one drum's sounds, following the General MIDI drum
map. It is meant for a rig where each drum voice is its own track with a GM-mapped kit: one
Drum Mapper per track, its `Mode` set to that drum, and anything can play into it: a
keyboard, a clip, a sequencer. Nothing is ever sent to a pad the mode does not target, so a
kit needs only those pads.

| Mode | The sounds it targets | How a note is chosen |
|---|---|---|
| `KICK` | Kick 1, Kick 2 | by pitch (odd or even) |
| `SNARE` | Snare 1, Snare 2, Side Stick, Clap; the six GM toms pass by exact note | by pitch, the two snares taking six pitches in eight |
| `HIHAT` | Hat Closed, Hat Pedal, Hat Open | by velocity: `Open Hat From` and above is open; below, closed or pedal |
| `CYMBALS` | Ride, Ride Bell, Crash 1, Crash 2 | by velocity: up to `Ride Up To` is ride, up to `Bell Up To` is bell, above is a crash, which one by pitch |

A note that already names one of the mode's own sounds passes through unchanged.

**Deterministic by design**: the same input gives the same drum, so a clip sounds the same
every night. The one exception is the hi-hat below the open velocity, where closed or pedal
is chosen at random, like a foot that does not fall the same way twice; `Humanize` off makes
that choice by pitch instead, for a reproducible render.

| Parameter | Default (GM) |
|---|---|
| `Kick 1`, `Kick 2` | 35, 36 |
| `Snare 1`, `Snare 2`, `Side Stick`, `Clap` | 38, 40, 37, 39 |
| `Hat Closed`, `Hat Pedal`, `Hat Open` | 42, 44, 46 |
| `Ride`, `Ride Bell`, `Crash 1`, `Crash 2` | 51, 53, 49, 57 |
| `Open Hat From` (velocity) | 86 |
| `Ride Up To`, `Bell Up To` (velocity) | 79, 105 |

Held notes are remembered per input pitch, so a note-off releases what was actually
sounding. CC 120 and CC 123 release everything the device holds; so does the message
`reset`. Everything that is not a note passes through.

Source: `alberton-drum-mapper.js`, embedded in the `.amxd`. The held-notes block is shared
with the Bass Mapper (`../_shared/note-queue.js`).
