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
| Phase | 1, safety and speed (`docs/PLAN.md` §2): 1.1 Kit Selector, 1.3 Transpose Q and 1.4 mappers done and verified in Live; 1.2 Gamepad coded and installed, awaiting the save-and-reopen test and a session with the pad |
| Devices | seven, imported as installed on 2026-09-08; scripts embedded and identical to the sources beside them |
| Tools | `amxd.py`, `analyse.py` (from the August `amxd-tools`), `embed.py`, `unembed.py`, `check_embedded.py`, `install.py`, `fix_als_path.py` |
| Open | the three Live checks of PLAN §3, before V5 is built |
| Installed form | `transpose-q`, `kit-selector`, `bass-mapper`, `drum-mapper` and `gamepad` in development form (plain device, script symlinked from here); the Receiver and the Tempo Automator in release form |
| Published | **No.** Publication is the last phase. No remote is configured. |

## Log

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
