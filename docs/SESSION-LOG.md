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

## Current state — 2026-09-08

| | |
|---|---|
| Phase | 1, safety and speed (`docs/PLAN.md` §2); Phase 0 complete |
| Devices | seven, imported as installed on 2026-09-08; scripts embedded and identical to the sources beside them |
| Tools | `amxd.py`, `analyse.py` (from the August `amxd-tools`), `embed.py`, `unembed.py`, `check_embedded.py`, `install.py`, `fix_als_path.py` |
| Open | the three Live checks of PLAN §3, before V5 is built |
| Installed form | `transpose-q` in development form (plain device, script symlinked from here); every other device in release form |
| Published | **No.** Publication is the last phase. No remote is configured. |

## Log

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
