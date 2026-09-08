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
| Phase | 0, ground (`docs/PLAN.md` §2) |
| Devices | seven, imported as installed on 2026-09-08; scripts embedded and identical to the sources beside them |
| Tools | `amxd.py`, `analyse.py` (from the August `amxd-tools`), `embed.py`, `unembed.py`, `check_embedded.py`, `install.py`, `fix_als_path.py` |
| Open | the development-loop test (one set reload); the leading-space rename (Live closed); the three Live checks of PLAN §3 |
| Published | **No.** Publication is the last phase. No remote is configured. |

## Log

- **2026-09-08** — Working folder created. History starts with the devices as they were
  before the 2026-08-04 review, then as installed today. Tools written on top of the August
  `amxd.py`. The Catalan handoff that started this lives in the MCP repository's working
  directory (`_handoff-devices/`), not here.
