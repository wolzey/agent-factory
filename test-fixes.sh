#!/bin/bash
# Consolidated test for PR fixes:
#   1. Zombie slot claiming — tombstone slot claimed on zombie rise, no stealing
#   2. Zombie subagents — inherit zombie visuals from parent
#   3. Tombstone reservation — non-zombies routed away from tombstone slots
#   4. Zombie loitering — idle zombies go to another agent's grave (not flowers)
#   5. Zombie returns to lounge when tombstone expires
#
# Usage: bash test-fixes.sh
# Requires: dev server on localhost:4242, browser open to localhost:5173

BASE="http://localhost:4242"
TS=$(date +%s)
PASS=0
FAIL=0

A_WORKER='{"spriteIndex":2,"color":"#4a90d9","hat":null,"trail":null,"graphicDeath":true}'
A_OTHER='{"spriteIndex":4,"color":"#ff9900","hat":null,"trail":null,"graphicDeath":true}'
A_IDLE='{"spriteIndex":6,"color":"#00cc88","hat":null,"trail":null}'

WORKER="fix-worker-$TS"
OTHER="fix-other-$TS"
IDLE="fix-idle-$TS"
STEALER="fix-stealer-$TS"

hook() {
  curl -s -o /dev/null -X POST "$BASE/api/hooks" -H 'Content-Type: application/json' -d "$1"
}

state() { curl -s "$BASE/api/state"; }

agent_exists() {
  state | python3 -c "import sys,json; agents=json.load(sys.stdin)['agents']; sys.exit(0 if any(a['sessionId']=='$1' for a in agents) else 1)" 2>/dev/null
}

agent_activity() {
  state | python3 -c "import sys,json; agents=json.load(sys.stdin)['agents']; matches=[a for a in agents if a['sessionId']=='$1']; print(matches[0]['activity'] if matches else 'MISSING')" 2>/dev/null
}

agent_subagent_count() {
  state | python3 -c "import sys,json; agents=json.load(sys.stdin)['agents']; matches=[a for a in agents if a['sessionId']=='$1']; print(len(matches[0]['subagents']) if matches else 0)" 2>/dev/null
}

check() {
  local desc="$1" result="$2"
  if [ "$result" -eq 0 ]; then
    echo "  ✅ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $desc"
    FAIL=$((FAIL + 1))
  fi
}

cleanup() {
  EXISTING=$(state | python3 -c "import sys,json; [print(a['sessionId']) for a in json.load(sys.stdin)['agents']]" 2>/dev/null)
  for sid in $EXISTING; do
    hook "{\"hook_event_name\":\"SessionEnd\",\"session_id\":\"$sid\",\"username\":\"cleanup\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\"}"
  done
  sleep 5
}

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   PR FIX VERIFICATION TESTS                      ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Cleaning up existing agents..."
cleanup

# ══════════════════════════════════════════════════════════
# TEST 1: Zombie slot claiming on rise
# ══════════════════════════════════════════════════════════
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 1: Zombie slot claiming on rise"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Worker gets slot #1
hook "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"$WORKER\",\"username\":\"Worker\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\"}"
sleep 1
hook "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"$WORKER\",\"username\":\"Worker\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\",\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"/tmp/a.ts\"}}"
sleep 2
check "Worker is writing at workstation" "$([ "$(agent_activity "$WORKER")" = "writing" ] && echo 0 || echo 1)"

# Kill Worker — tombstone reserves slot #1
hook "{\"hook_event_name\":\"SessionEnd\",\"session_id\":\"$WORKER\",\"username\":\"Worker\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\"}"
sleep 4
agent_exists "$WORKER"
check "Worker removed after death" "$([ $? -ne 0 ] && echo 0 || echo 1)"
echo "  📋 VISUAL: Tombstone at workstation #1"

# Other agent works — should NOT get slot #1
hook "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"$OTHER\",\"username\":\"Other\",\"avatar\":$A_OTHER,\"cwd\":\"/tmp\"}"
sleep 1
hook "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"$OTHER\",\"username\":\"Other\",\"avatar\":$A_OTHER,\"cwd\":\"/tmp\",\"tool_name\":\"Read\",\"tool_input\":{\"file_path\":\"/tmp/b.ts\"}}"
sleep 2
check "Other is reading (got a workstation)" "$([ "$(agent_activity "$OTHER")" = "reading" ] && echo 0 || echo 1)"
echo "  📋 VISUAL: Other at slot #2+ — NOT slot #1 (tombstone)"

# Zombie rises — reclaims slot #1
hook "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"$WORKER\",\"username\":\"Worker\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\"}"
sleep 1
agent_exists "$WORKER"
check "Zombie Worker re-appears in state" "$([ $? -eq 0 ] && echo 0 || echo 1)"
echo "  📋 VISUAL: Zombie rises green with skull nametag at slot #1"

# During 3s rise, spawn Stealer — must NOT steal slot #1
sleep 1
hook "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"$STEALER\",\"username\":\"Stealer\",\"avatar\":$A_IDLE,\"cwd\":\"/tmp\"}"
sleep 0.5
hook "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"$STEALER\",\"username\":\"Stealer\",\"avatar\":$A_IDLE,\"cwd\":\"/tmp\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"ls\"}}"
sleep 2
check "Stealer got a workstation (not blocked)" "$([ "$(agent_activity "$STEALER")" = "running" ] && echo 0 || echo 1)"
echo "  📋 VISUAL: Stealer at slot #3+ — NOT zombie's slot #1"

# Zombie works at its original slot
hook "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"$WORKER\",\"username\":\"Worker\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"brains\"}}"
sleep 3
echo "  📋 VISUAL: Zombie shambles to slot #1 (green, slow, stagger)"

# ══════════════════════════════════════════════════════════
# TEST 2: Zombie subagents inherit zombie visuals
# ══════════════════════════════════════════════════════════
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 2: Zombie subagent visuals"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

hook "{\"hook_event_name\":\"SubagentStart\",\"session_id\":\"$WORKER\",\"username\":\"Worker\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\",\"agent_id\":\"sub-z1\",\"agent_type\":\"Explore\"}"
sleep 1
hook "{\"hook_event_name\":\"SubagentStart\",\"session_id\":\"$WORKER\",\"username\":\"Worker\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\",\"agent_id\":\"sub-z2\",\"agent_type\":\"Plan\"}"
sleep 1
check "Zombie has 2 subagents" "$([ "$(agent_subagent_count "$WORKER")" -eq 2 ] && echo 0 || echo 1)"
echo "  📋 VISUAL: Zombie subagents have green tint, ☠ nametags, dark bg"

# Normal subagent for comparison
hook "{\"hook_event_name\":\"SubagentStart\",\"session_id\":\"$OTHER\",\"username\":\"Other\",\"avatar\":$A_OTHER,\"cwd\":\"/tmp\",\"agent_id\":\"sub-n1\",\"agent_type\":\"Explore\"}"
sleep 1
check "Normal agent has 1 subagent" "$([ "$(agent_subagent_count "$OTHER")" -eq 1 ] && echo 0 || echo 1)"
echo "  📋 VISUAL: Normal subagent has distinct color (purple/mint), NO skulls"
sleep 3

# Cleanup subagents
hook "{\"hook_event_name\":\"SubagentStop\",\"session_id\":\"$WORKER\",\"username\":\"Worker\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\",\"agent_id\":\"sub-z1\"}"
hook "{\"hook_event_name\":\"SubagentStop\",\"session_id\":\"$WORKER\",\"username\":\"Worker\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\",\"agent_id\":\"sub-z2\"}"
hook "{\"hook_event_name\":\"SubagentStop\",\"session_id\":\"$OTHER\",\"username\":\"Other\",\"avatar\":$A_OTHER,\"cwd\":\"/tmp\",\"agent_id\":\"sub-n1\"}"
sleep 1

# ══════════════════════════════════════════════════════════
# TEST 3: Tombstone reservation (non-zombies routed away)
# ══════════════════════════════════════════════════════════
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 3: Tombstone reservation & routing"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Kill zombie, kill Other — two tombstones
hook "{\"hook_event_name\":\"SessionEnd\",\"session_id\":\"$WORKER\",\"username\":\"Worker\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\"}"
sleep 1
hook "{\"hook_event_name\":\"SessionEnd\",\"session_id\":\"$OTHER\",\"username\":\"Other\",\"avatar\":$A_OTHER,\"cwd\":\"/tmp\"}"
sleep 4
echo "  📋 VISUAL: Two tombstones at slots #1 and #2"

# Make Stealer idle (normal agent)
hook "{\"hook_event_name\":\"PostToolUse\",\"session_id\":\"$STEALER\",\"username\":\"Stealer\",\"avatar\":$A_IDLE,\"cwd\":\"/tmp\",\"tool_name\":\"Bash\"}"
sleep 1
hook "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"$STEALER\",\"username\":\"Stealer\",\"avatar\":$A_IDLE,\"cwd\":\"/tmp\"}"
sleep 1

# Spawn idle agent for flower duty
hook "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"$IDLE\",\"username\":\"Idler\",\"avatar\":$A_IDLE,\"cwd\":\"/tmp\"}"
sleep 1
echo "  📋 VISUAL: Idle agents should visit tombstones + place flowers (wait ~10s)"
sleep 10

# Newcomer must not get tombstone slots
NEWCOMER="fix-newcomer-$TS"
hook "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"$NEWCOMER\",\"username\":\"Newcomer\",\"avatar\":$A_IDLE,\"cwd\":\"/tmp\"}"
sleep 1
hook "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"$NEWCOMER\",\"username\":\"Newcomer\",\"avatar\":$A_IDLE,\"cwd\":\"/tmp\",\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"/tmp/new.ts\"}}"
sleep 2
check "Newcomer is writing (got a workstation)" "$([ "$(agent_activity "$NEWCOMER")" = "writing" ] && echo 0 || echo 1)"
echo "  📋 VISUAL: Newcomer at slot #3+ — NOT tombstone slots #1 or #2"

# ══════════════════════════════════════════════════════════
# TEST 4: Zombie loiters at another agent's grave
# ══════════════════════════════════════════════════════════
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 4: Zombie loiters at grave (no flowers)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Reconnect Worker as zombie — Other's tombstone is still there
hook "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"$WORKER\",\"username\":\"Worker\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\"}"
sleep 4
# Re-send idle to trigger routing after rise animation
hook "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"$WORKER\",\"username\":\"Worker\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\"}"
sleep 1

agent_exists "$WORKER"
check "Zombie Worker risen" "$([ $? -eq 0 ] && echo 0 || echo 1)"

echo "  📋 VISUAL: Zombie walks to Other's tombstone and loiters"
echo "  📋 VISUAL: Zombie plays a creepy emote (sleep/dizzy/rage) on arrival"
echo "  📋 VISUAL: Zombie does NOT place any flowers"
echo ""
echo "  Watching for 15s..."
sleep 15

# ══════════════════════════════════════════════════════════
# TEST 5: Zombie returns to lounge when tombstone expires
# ══════════════════════════════════════════════════════════
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TEST 5: Zombie returns to lounge on tombstone expiry"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "  Waiting for tombstone to expire (~20s remaining)..."
sleep 20

echo "  📋 VISUAL: Tombstone faded/sank — zombie walks back to lounge"
echo "  📋 VISUAL: Zombie should now be in the lounge area with other idle agents"

agent_exists "$WORKER"
check "Zombie still alive after tombstone expired" "$([ $? -eq 0 ] && echo 0 || echo 1)"
sleep 5

# ══════════════════════════════════════════════════════════
# Results
# ══════════════════════════════════════════════════════════
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
if [ "$FAIL" -gt 0 ]; then
  echo "  ⚠️  Some checks failed!"
else
  echo "  All server-side checks passed."
fi
echo "  Review 📋 VISUAL checkpoints in the browser."
echo ""

echo "Cleaning up..."
cleanup
echo "Done."
