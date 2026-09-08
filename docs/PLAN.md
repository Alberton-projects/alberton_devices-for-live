# alberton_devices-for-live — work plan

*Drafted 2026-09-08 from the handoff document, the August review in `amxd-tools/REVIEW.md`,
the device files on disk and the loaded set; revised the same day with the owner's answers.
Nothing in this plan has been built yet. The file moves to `docs/PLAN.md` when the repository
is published, which is the last step, not the first.*

## 0. Decisions taken on 2026-09-08

| Topic | Decision |
|---|---|
| Order of work | Devices first: update, then test on the set with the audio on. The public repository comes last, once everything is verified |
| Where the work lives meanwhile | A local working folder, `~/alberton_devices-for-live/`, under git with no remote, so every change is a reversible diff. It becomes the published repository unchanged |
| Repository, when published | `github.com/Alberton-projects/alberton_devices-for-live`, MIT, English in code and docs, Catalan README beside the English one |
| Scope | The seven original devices plus a from-scratch rewrite of VisualBeat. Step Sequencer excluded: it derives from Ableton's own (`swingCalc.js`, its annotations). Kit Selector V3 and `Alberton Tempo Automation v1.3.maxpat` archived, not published |
| Generality | Every device loses the set's names from its code and gains parameters. More work is accepted; being publishable is the point |
| Shipping form | The `.amxd` carries its scripts embedded, so a user copies one file. The `.js` sits beside it in the repository as the readable source, and a check keeps the two identical |
| Drum Mapper | Deterministic by pitch everywhere except the hi-hat, where the closed/pedal choice at soft velocity stays random on purpose, behind a `Humanize` toggle. Cymbal crash choice becomes deterministic |
| File name | The leading space in `" Alberton Drum Mapper.amxd"` goes, in the repository and locally. The two sets that store the path (`Alberton Multiverse.als`, `TGHC Song.als`) are patched with Live closed |
| Kit Selector | Sixteen strips, each with program and volume, plus Main volume, all stored per kit. Strip labels come automatically from the bound track's name. FX capture/recall is used in shows, so it moves in two steps: V5.0 keeps it as today, by group name; V5.1 moves it to receivers |
| Gamepad | Track selection must survive reopening the set; clip firing by index |
| Transpose Q | Verified on the live set; targeting generalised |
| Beat Window | Replaces VisualBeat, rewritten as an original device. The floating window shows the beat number and the bar.beat position, with a flash on every beat, and its content rescales with the window |
| REVIEW §12 | Closed. V5 stores the Main level per kit as a dial, so the 0 dB constant of 2026-09-03 disappears and needs no further explanation |

Done on 2026-09-08, outside the plan: the master-volume change recorded as §12 of
`amxd-tools/REVIEW.md`; superseded versions and every dated backup moved to
`Max MIDI Effect/_archive/` and `_archive/backups/` (nothing deleted; no set references them).

## 1. Working folder, later the repository

```
alberton_devices-for-live/
├── README.md · README.ca.md · LICENSE · CLAUDE.md
├── docs/
│   ├── SESSION-LOG.md       index: state, what changed when
│   ├── HANDOFF.md           reasoning and verified Live/Max behaviours
│   ├── PROTOCOL.md          how the devices talk to each other and to Live
│   ├── INSTALL.md
│   └── PLAN.md              this file
├── devices/
│   ├── _shared/             note-queue.js, note-mapping.js  (pure, tested with Node)
│   ├── bass-mapper/         Alberton Bass Mapper.amxd · alberton-bass-mapper.js · README.md
│   ├── drum-mapper/
│   ├── transpose-q/
│   ├── kit-selector/        the panel (V5) — and kit-receiver/, kit-fx-receiver/ beside it
│   ├── gamepad/
│   ├── tempo-automator/
│   └── beat-window/         the VisualBeat rewrite
├── tools/
│   ├── amxd.py              container read/write (from amxd-tools, unchanged)
│   ├── analyse.py           dead wiring, dangling sends, missing scripts
│   ├── embed.py             fold the .js beside a device into the .amxd (rebuild, not only "add")
│   ├── unembed.py           the reverse: a plain device that loads the .js from its folder (development form)
│   ├── check_embedded.py    fails if any embedded script differs from its source
│   ├── install.py           copy the .amxd files into the User Library
│   └── fix_als_path.py      rewrite a device path inside a gzipped .als
└── test/                    node tests for the pure modules; python round-trip tests for amxd.py
```

History: the first commit holds the January originals (from `_archive/backups/*.orig-2026-08-04`),
the second holds today's state, and from then on every change is its own commit. That makes the
August and September repairs readable as diffs, and the published history starts honest.

Tooling verdict: `amxd.py` and `embed_scripts.py` are sound and verified against Max-written
files; they go in as they are, with one change — `embed` must *rebuild* the embedded copy when the
source changed, not only when it is missing (today it says "already carries" and stops).
`analyse.py` goes in as a review aid. The two Step Sequencer examples stay local (out of scope).

**Development form versus release form.** During the work each device is kept *plain*, loading
its script from the folder beside it, so `autowatch 1` picks up an edit the moment the file is
saved and the set does not need reopening for script changes. Patcher changes still need the set
reloaded. Only at release is the script embedded. The scripts in the User Library are symlinks
into the working folder, so there is one source. Phase 0 confirms this loop works before anything
else is touched.

## 2. Phases

### Phase 0 — ground, no behaviour changes

1. Create the working folder; import the January originals, then the current state; add
   `check_embedded.py`, `embed.py`, `unembed.py`.
2. `PROTOCOL.md` v1 describing the wiring *as it is today* (already read from the patchers):
   panel → `alberton_<slot>` sends → Receiver → program change; drums via the rack macro named
   "Chain Selector"; FX racks found by group name; volumes reset by name.
3. Settle the development loop with one reload of the set: a plain device with a symlinked script
   beside it, an edit to the script, and a check that the device picked it up without a reload.
   Also answer the August question: with a script both inside the `.amxd` and beside it, which one
   does the `js` object load? That decides whether shipping a loose `.js` next to a device is safe.
4. Leading space: rename the file, patch the two `.als` with `fix_als_path.py` (Live closed, backups
   first), reopen the set, confirm the four Drum Mapper instances load and keep their Mode.

### Phase 1 — safety and speed, same behaviour

| Device | Change | How it is verified |
|---|---|---|
| Kit Selector V4.3 | `try/catch` around every LiveAPI use; a `DEBUG` flag in front of every `post()`; cache the drum-chain parameter paths at `refresh` | recall a kit on the set, read the four "Chain Selector" macros and the volumes over MCP |
| Gamepad | `fire_slot` uses the known index: one LiveAPI object per fire. Track selection owned by the script and saved with the set (see §4). Comment on `tracks.length / 2` | fire a slot from the pad, watch `playing_slot` over MCP; reopen the set, the menu shows the same track |
| Transpose Q | `try/catch`; `DEBUG` flag; a LiveAPI observer on `live_set tracks` clears the cache; `bang` and `msg_int` unified | set Pending, wait for the downbeat, read the nine `[PITCH]` values over MCP, restore 0 |
| Mappers | shared `note-queue.js` with `reset` and CC 123 all-notes-off; pure `note-mapping.js`; pool built once; `isInRange` by lookup; cymbals deterministic, hi-hat random with the reason in a comment | Node tests on every mapping function; a held-note test in Live |
| All | comments in English | — |

### Phase 2 — generalisation

- **Bass Mapper**: `Low` and `High` as `live.numbox` parameters (defaults C1 36 and C3 60).
- **Drum Mapper**: velocity thresholds as parameters (open hi-hat from 86; ride to 79, bell to 105,
  crash above); GM drum map documented; `Humanize` toggle, on by default, that switches the
  hi-hat closed/pedal randomness off for reproducible renders.
- **Transpose Q**: target every Pitch device (`MidiPitcher`) whose name carries the tag `[PITCH]`,
  on any track but its own — a documented convention: rename a Pitch device to opt a track in. Add
  `Quantize` (Bar / Beat / Immediate) and a `Range` of ±24. No track names anywhere.
- **Kit Selector V5.0 + Kit Receiver**: the redesign in §3, FX still by group name.
- **Kit Selector V5.1 + Kit FX Receiver**: FX capture/recall moves to receivers, once V5.0 has
  played a show.
- **Dummy Tempo Automator** and **Gamepad**: already general; documentation only.

### Phase 3 — Beat Window (the VisualBeat rewrite)

An audio effect that passes audio through (`plugin~`/`plugout~`), counts bars and beats from
`transport`, blinks on the beat, and opens a floating window whose content is a `jsui` drawing
the beat number large, the bar.beat position beneath it, and a flash on every beat. The window
size is polled with `thispatcher` (`window getsize`) and the `jsui` box follows it, so the content
rescales with the window instead of sitting at a fixed size. Parameters: `Blink` (ms), `Flash`
(on/off), `Float` (open/close). Nothing from the downloaded `VisualBeat.amxd` is reused; both old
files go to `_archive/` when this is done.

### Phase 4 — the full test, audio on

The verification protocol in §5 runs in full on the set, with the owner playing. V4.3 and the old
Receiver are only removed from the set after V5.0 has passed it. Anything that fails goes back to
its phase; nothing is published with an open failure.

### Phase 5 — publication

Per-device README, `INSTALL.md`, top-level README in both languages, licence, the GitHub
repository created from the working folder with its history, first push.

## 3. Kit Selector V5 — design to validate before building

**Principle: the panel knows nothing about the set. It broadcasts; receivers bind tracks.**

- **Strips.** Sixteen identical strips, each with a `Program` dial (0–127) and a `Volume` dial,
  plus a `Main` volume dial. The nine FX multisliders stay in V5.0. Everything in a strip is a
  member of the kit, so a kit is one snapshot of programs, volumes and FX, recalled by number or by
  MIDI program change as today. The 150 ms program-change queue stays.
- **Labels.** Each strip shows the name of the track bound to it. Receivers announce themselves
  (`bound <strip> <track name>`) when they load and whenever the panel asks, so the labels are
  derived state, rebuilt at every load and never saved.
- **One channel per bus.** The panel sends everything on a single Max `send` named `ks<bus>`
  (`Bus` 1–4 is a device parameter, so two panels can coexist in one set):
  `prog <strip> <value>` · `vol <strip> <0..1>` · `fx <strip> <v1..v8>` · `capture` · `kit <n>` ·
  `who`. Receivers `route` on their own strip number. Replies travel on `ks<bus>_ret`.
- **Kit Receiver** (MIDI effect, one per track): `Bus`, `Strip`, `Action` = Program Change /
  Chain Selector / Macro 1–16, `Apply volume` toggle. Program changes go to the instrument through
  `midiformat` as today; Chain Selector and Macro write to the first rack on the receiver's own
  track over the LOM (`this_device canonical_parent`), so the drum tracks stop needing their names.
- **Kit FX Receiver** (audio effect, V5.1): sits *inside* the rack it controls, first in the chain,
  so placement is the binding and no rack name is needed. `Bus`, `FX strip`; applies macros 1–8 of
  its parent rack; answers `capture` with the current values; optional `Apply volume` for the
  track. Group tracks cannot host MIDI effects, which is why this is a separate audio device.
- **Storage.** Kits stay in the panel's `pattrstorage`, switched to `subscribemode 1` with explicit
  membership, so global settings (`Bus`, `MIDI Ch`) are never stored in a kit. Migration of the
  owner's 32 kits: export from V4.3 with `pattrstorage write`, rename the keys, read into V5.
- **Names.** `Alberton Kit Selector` (V5), `Alberton Kit Receiver`, `Alberton Kit FX Receiver`.

To check in Live before building, each a five-minute test: a `send`/`route` across two devices; a
LOM write to the parent rack from inside a chain; `pattrstorage` subscribe mode next to `autopattr`.

## 4. The Gamepad track-selection bug, diagnosed

The track menu (`live.menu`, `obj-47`) is a Live parameter with a range *saved in the patcher* of
four placeholder entries (`1-MIDI … 4-Audio`, `parameter_mmax 3`). On load Live restores the saved
index, the menu clamps it to that four-entry range, and only 500 ms later does `slot-fire.js` send
the real track list. A `pattr GPTrackSel @autorestore 1` also writes the value saved inside the
`.amxd` into the menu at load. Two mechanisms, both firing before the list exists.

Fix: one owner of the state. The script keeps the selected track **by name**, saved with the set
through the `js` object's parameter support (`getvalueof`/`setvalueof`, `parameter_enable 1`),
resolves it to an index after the scan, and sets the menu as a view. The menu stops being a Live
parameter and the `pattr` goes. If a track was renamed, the script says so in the Max window and
falls back to the first track.

## 5. Verification protocol on the live set

Read-only over MCP unless stated. Run in full in Phase 4, and again before a show.

| Device | Do in Live | Read over MCP |
|---|---|---|
| Kit Selector | recall two kits, then the same by program change on MIDI Ch | drum "Chain Selector" macros, strip and Main volumes, FX macros of every `[FX]` rack |
| Kit Receiver | change a strip | the instrument's program on the receiver's track; the strip label on the panel |
| Transpose Q | Pending = 2, wait a bar; Pending = 0 | the `Pitch` value of every `[PITCH]` device, and that no other Pitch device moved |
| Gamepad | fire slot and scene from the pad; save, reopen | `playing_slot` on the target track; the menu after reopening |
| Mappers | hold and retrigger the same key; send CC 123 | notes seen at the instrument (`get_notes` on a recorded clip) |
| Tempo Automator | move the dial, toggle Active | `song.tempo` |
| Beat Window | play, resize the window | none — the counter, the bar.beat and the flash follow the window |

## 6. Risks and rules

- The set is played on stage. V4.3 and the old Receiver stay installed and untouched until V5.0
  is validated on a copy of the set. New devices get new file names; the switch is one deliberate
  step, and V4.3 is not deleted, only archived.
- Every device edit leaves a dated copy beside the file, and the working folder holds the history.
- Live restores blob state after ordinary parameters: any state a script owns is reconciled after
  `live.thisdevice`, never on `loadbang`.
- `autopattr @greedy 1` in V4.3 makes every new named control a kit member; V4.3 gets no new
  controls. V5 uses subscribe mode for exactly this reason.
- MCP writes to the set only when a test needs them, and only reversible ones (a Pitch value, a
  volume), restored right after.

## 7. Answered by the owner on 2026-09-08

Sixteen strips with automatic labels. FX capture/recall is used in shows, hence the two-step move.
The Beat Window shows beat and bar.beat with a flash. The 0 dB master change needs no explanation
once V5 stores the level per kit. The `Humanize` toggle is wanted. The repository is published
last. Nothing remains open for the owner; what remains are the three Live checks listed in §3 and
the development-loop test of Phase 0.
