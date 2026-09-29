#!/bin/bash
# SessionStart: in a cloud session Ableton Live is not reachable. Say so up front, so
# that nothing that needs Live is reported as verified. Local sessions: no output.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cat <<'JSON'
{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "Cloud session: Ableton Live and Max are NOT reachable here (they run on the owner's Mac; the MCP and the socket at 127.0.0.1:17853 do not exist in this container). What you can verify here: `npm test`, `python3 tools/check_embedded.py`, `python3 tools/sync_shared.py --check`, `python3 tools/check_rules.py`. What you cannot: tools/install.py, anything under test/live/, and the verification protocol of docs/PLAN.md section 5 (write a parameter, read it back over MCP, audio on). Any change that needs those stays 'pending live verification' in docs/SESSION-LOG.md, with what to check; never report it as verified."}}
JSON
