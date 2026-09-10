# Session log

Where the project stands, what changed when, and what is still open. Read this first in a
new session; it is the index, not the reasoning.

- **Durable rules** — `CLAUDE.md`
- **The plan** — `docs/PLAN.md`
- **Reasoning and verified Live/Max behaviours** — `docs/HANDOFF.md`
- **How the devices talk to each other** — `docs/PROTOCOL.md`
- **The August 2026 review, inventory and container notes** — `docs/history/`

Keep entries short. A change belongs here as one line plus its commit; the *why* goes in
HANDOFF, the design in PLAN.

---

## Current state — 2026-09-09

| | |
|---|---|
| Phase | 2, generalisation (`docs/PLAN.md` §2): 2.1 Bass Mapper and 2.3 Transpose Q done and verified; 2.2 Drum Mapper parameters done and verified; 2.4 Kit Selector V5: receiver and panel built and verified, receivers on fourteen real tracks, the twelve kits migrated; V5.1 (fx banks through the Kit FX Receiver, fx volumes per kit) built, to be placed and verified; then the switch. Phase 1 complete |
| Devices | seven, imported as installed on 2026-09-08; scripts embedded and identical to the sources beside them |
| Tools | `amxd.py`, `analyse.py` (from the August `amxd-tools`), `embed.py`, `unembed.py`, `check_embedded.py`, `install.py`, `fix_als_path.py` |
| Open | the three Live checks of PLAN §3, before V5 is built |
| Installed form | `transpose-q`, V4.3, V5 panel, `bass-mapper`, `drum-mapper`, `gamepad` and the new Kit Receiver in development form (plain device, script symlinked from here); the old PC Receiver and the Tempo Automator in release form |
| Published | **No.** Publication is the last phase. No remote is configured. |

## Log

- **2026-09-10** — Migration rerun with Live closed (idempotent: it rewrites the V5 blob from
  V4.3's): the resample bank at [64, 0…] and an fx volume per bank in every kit. Original kept as
  `.pre-migrate-20260910-140455`. Next: nine Kit FX Receivers on the set, then "Tabú" again.
- **2026-09-10** — V5.1: Alberton Kit FX Receiver built (audio effect, governs the nearest
  rack, seven tests); the panel broadcasts fx banks and fx volumes instead of finding racks by
  name, and gains a volume dial per bank; PROTOCOL.md part A describes V5. The migration adds
  the resample bank at [64, 0…] and the fx volumes from V4.3's policy.
- **2026-09-10** — The twelve V4.3 kits migrated into the V5 panel through the set file
  (`bb18efd`, `tools/migrate_kits.py`), original kept as `.pre-migrate-20260910-134708`.
  Verified on reopening: "Tabú" recalled on V5 drives the real tracks as V4.3's kit 3 did.
- **2026-09-10** — Kit Receivers on fourteen tracks of the real set, beside the old PC Receivers:
  strips 1–4 Kick, Snare, HiHat, Cymbals (Macro 1), 5–12 Bass Electric, Bass Synth, Pad 1, Pad 2,
  Piano 1, Piano 2, Lead 1, Lead 2 (Program Change), 13–14 Vocoder and Live Scratcher (None).
  Apply Volume off everywhere until the kits are migrated. The V5 panel sits on a test track
  named "V5 panel" (monitor In) and mirrors the V4.3 dials. A receiver gains a None action.
  Loading onto a track inside a folded group fails ("The given Track is invisible"): unfold,
  load, fold again.
- **2026-09-09** — V5.0 verified end to end with the owner: store, MIDI recall, re-send (HANDOFF).
  Kit grid enlarged to three rows of eleven (`f688a6b`).
- **2026-09-09** — The August "parameter is disabled" mystery solved from Live's log: four
  disabled macros on the Vocals [FX] rack, written twice per recall; both scripts skip disabled
  macros. V5 panel layout redone after a screenshot; MIDI recall verified by the owner with the
  test track armed.
- **2026-09-09** — Alberton Kit Selector V5 panel built (`54e0023`): generated patcher, seven
  tests, the bus verified end to end with two receivers on test tracks (HANDOFF).
- **2026-09-09** — Alberton Kit Receiver built (`3d5649a`): generated patcher, ten tests, every
  action verified on a test track over MCP (HANDOFF). Installed in development form; not yet
  on any of the set's tracks.
- **2026-09-09** — The three Live checks behind the V5 design passed (HANDOFF), with throwaway
  devices built by the new `tools/patcher.py`. On the way: `LiveAPI.id` of a dead path is the
  string `"0"`; every script's guards fixed (`7ae88af`).
- **2026-09-09** — Drum Mapper Phase 2 verified with sound (HANDOFF).
- **2026-09-09** — Drum Mapper Phase 2: thirteen target notes and three velocity thresholds
  as parameters with GM defaults, read back at compile time. 53 tests. Installed in
  development form.
- **2026-09-09** — Transpose Q Phase 2 verified on the set (HANDOFF): tag rule, Quantize off,
  ±24.
- **2026-09-09** — Pad firing verified by the owner. Transpose Q generalised (`36cde01`): targets
  by the `[PITCH]` tag on any track but its own, Quantize menu (bar, beat, off), ±24, the script
  renamed `alberton-transpose-q.js`. 51 tests. Installed in development form.
- **2026-09-09** — Gamepad verified: the dropdown back after the menu returned to parameter
  mode (`1bc99da`), and the chosen track survived a save and reopen. Phase 1 complete.
- **2026-09-09** — Mappers verified with sound by the owner (held notes, pedal, CC 123, the
  narrowed snare and cymbal maps). Gamepad rewritten for Phase 1 (`70e8ad2`): the chosen track
  kept by name in a blob pattr saved with the set, firing by index, tracks observer, guards.
  48 tests. Installed in development form; the reopen test is pending.
- **2026-09-09** — Drum Mapper: each mode passes through only its own target notes, the
  snare pool is the four GM snare sounds, toms pass by exact note (`f375df0`), after reading
  the set's ten kits over the bridge socket. A save recompiled the four instances and lost
  their Mode: every script now reads its controls back at compile time (`fed39de`),
  verified on the Transpose Q. 41 tests.
- **2026-09-09** — Mappers rewritten for Phase 1 (`1628c31`): shared note queue with `reset`
  and CC 120/123, every non-note message passed through, crash by pitch, hi-hat randomness
  behind a Humanize toggle, Low/High on the Bass Mapper, the drum menu named Mode. 37 tests.
  Installed in development form; the test with sound is still to do.
- **2026-09-09** — Transpose Q script rewritten for Phase 1 (`028025e`): guards, observer on
  the track list, silent downbeat; the applied value gets a visible `Current` dial, −12..12
  (`9fbf0ca`, `d9a06ea`). 33 tests. Verified on the set: nine `[PITCH]` devices follow
  Pending on the downbeat, and back (HANDOFF).
- **2026-09-09** — Kit Selector script rewritten for Phase 1 (`827d6ed`): guarded Live API
  access, caches built at refresh, self-refresh on track-count change, debug flag. 26 tests.
  Verified on the set over MCP (HANDOFF): chain write through the cache, Send with the
  volume policy, program change arriving at a receiver.
- **2026-09-08** — Development loop settled (`docs/HANDOFF.md`): the embedded script wins over
  a loose copy; a plain device loads a symlinked script and `autowatch` follows the symlink;
  a recompile resets script state. Transpose Q left installed in development form.
- **2026-09-08** — Leading space removed from the Drum Mapper's file name (`2417ea4`): the
  installed file renamed and both sets rewritten with `fix_als_path.py` while Live was
  closed; originals kept as `*.als.pre-fix-20260908-2326*` beside them.
- **2026-09-08** — Tools and first documents committed (`c97b50b`); every tool exercised dry
  against the seven devices. Development-loop test started on the installed Transpose Q: a
  marker appended to the loose `alberton-transpose-v2.js` beside the embedded device did
  not reach the running instance, so either the embedded copy is the one loaded or
  `autowatch` is inert there; the set reload decides. Marker to be removed afterwards
  (backup `_archive/backups/alberton-transpose-v2.js.pre-devloop-20260908-231203`).
- **2026-09-08** — Working folder created. History starts with the devices as they were
  before the 2026-08-04 review, then as installed today. Tools written on top of the August
  `amxd.py`. The Catalan handoff that started this lives in the MCP repository's working
  directory (`_handoff-devices/`), not here.
