# Alberton Dummy Tempo Automator

A MIDI effect whose one dial sets Live's tempo. Live cannot automate its tempo from a
Session clip; a dial on a device can be automated from a clip envelope, and this device
passes that dial on to the tempo. Put it on a dummy MIDI track and draw the tempo into the
clips of that track.

| Parameter | Range | What it does |
|---|---|---|
| `Tempo` | 20–999 | Live's tempo follows it while `Active` is on |
| `Active` | on/off | off, the dial is ignored; switching it on sends the dial's value again |

MIDI passes through. No script: the patcher is a dial, a gate and a `live.object`.
