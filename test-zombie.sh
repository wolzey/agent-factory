#!/bin/bash
# Deterministic zombie/tombstone test sequence
# Usage: bash test-zombie.sh

BASE="http://localhost:4242"
TS=$(date +%s)

# Avatars
A_WORKER='{"spriteIndex":2,"color":"#4a90d9","hat":null,"trail":null,"graphicDeath":true}'
A_MOURN1='{"spriteIndex":4,"color":"#ff9900","hat":null,"trail":null}'
A_MOURN2='{"spriteIndex":6,"color":"#00cc88","hat":null,"trail":null}'
A_NEW='{"spriteIndex":1,"color":"#cc33ff","hat":null,"trail":null}'

# Session IDs
WORKER="worker-$TS"
MOURN1="mourner1-$TS"
MOURN2="mourner2-$TS"
NEWGUY="newguy-$TS"

hook() {
  curl -s -o /dev/null -X POST "$BASE/api/hooks" -H 'Content-Type: application/json' -d "$1"
}

step() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  STEP $1: $2"
  echo "  EXPECT: $3"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ── Print test plan ──────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ZOMBIE / TOMBSTONE FULL TEST SEQUENCE      ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "Test plan:"
echo "  1.  Clean slate — kill all existing agents"
echo "  2.  Spawn Worker, Mourner1, Mourner2 — all go to lounge"
echo "  3.  Worker goes to workstation #1"
echo "  4.  Mourner1 goes to workstation #2"
echo "  5.  Mourner2 goes to workstation #3"
echo "  6.  Mourners stop working, go idle"
echo "  7.  Worker dies at workstation #1 — tombstone appears"
echo "  8.  Idle mourners periodically visit tombstone and place flowers"
echo "  9.  NewGuy spawns and works — gets free slot, NOT #1 (tombstone blocks)"
echo "  10. Same Worker reconnects within 30s — ZOMBIE rises from tombstone"
echo "  11. Zombie goes to work — green, slow, stagger"
echo "  12. Zombie dies again — second tombstone, mourners visit again"
echo "  13. Wait 35s for tombstone to expire"
echo "  14. Same Worker reconnects after expiry — FRESH spawn, no zombie"
echo "  15. Fresh Worker goes to work — slot is free"
echo ""

# ── Step 1: Cleanup ─────────────────────────────────
step "1/15" "Clean slate" "All existing agents removed"
EXISTING=$(curl -s "$BASE/api/state" | python3 -c "import sys,json; [print(a['sessionId']) for a in json.load(sys.stdin)['agents']]" 2>/dev/null)
for sid in $EXISTING; do
  hook "{\"hook_event_name\":\"SessionEnd\",\"session_id\":\"$sid\",\"username\":\"cleanup\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\"}"
done
sleep 5
echo "   Clean."

# ── Step 2: Spawn agents ────────────────────────────
step "2/15" "Spawn 3 agents" "Worker (blue), Mourner1 (orange), Mourner2 (green) appear at entrance, walk to lounge"
hook "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"$WORKER\",\"username\":\"Worker\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\"}"
hook "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"$MOURN1\",\"username\":\"Mourner1\",\"avatar\":$A_MOURN1,\"cwd\":\"/tmp\"}"
hook "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"$MOURN2\",\"username\":\"Mourner2\",\"avatar\":$A_MOURN2,\"cwd\":\"/tmp\"}"
sleep 4

# ── Step 3: Worker to workstation ────────────────────
step "3/15" "Worker goes to workstation #1" "Worker walks from lounge to workstation #1, machine activates"
hook "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"$WORKER\",\"username\":\"Worker\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\",\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"/tmp/code.ts\"}}"
sleep 4

# ── Step 4: Mourner1 to workstation ──────────────────
step "4/15" "Mourner1 goes to workstation #2" "Mourner1 walks to workstation #2"
hook "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"$MOURN1\",\"username\":\"Mourner1\",\"avatar\":$A_MOURN1,\"cwd\":\"/tmp\",\"tool_name\":\"Read\",\"tool_input\":{\"file_path\":\"/tmp/a.ts\"}}"
sleep 4

# ── Step 5: Mourner2 to workstation ──────────────────
step "5/15" "Mourner2 goes to workstation #3" "Mourner2 walks to workstation #3"
hook "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"$MOURN2\",\"username\":\"Mourner2\",\"avatar\":$A_MOURN2,\"cwd\":\"/tmp\",\"tool_name\":\"Read\",\"tool_input\":{\"file_path\":\"/tmp/b.ts\"}}"
sleep 4

# ── Step 6: Mourners go idle ─────────────────────────
step "6/15" "Mourners stop working, go idle" "Mourner1 and Mourner2 finish tools and walk back to lounge"
hook "{\"hook_event_name\":\"PostToolUse\",\"session_id\":\"$MOURN1\",\"username\":\"Mourner1\",\"avatar\":$A_MOURN1,\"cwd\":\"/tmp\",\"tool_name\":\"Read\"}"
hook "{\"hook_event_name\":\"PostToolUse\",\"session_id\":\"$MOURN2\",\"username\":\"Mourner2\",\"avatar\":$A_MOURN2,\"cwd\":\"/tmp\",\"tool_name\":\"Read\"}"
sleep 1
hook "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"$MOURN1\",\"username\":\"Mourner1\",\"avatar\":$A_MOURN1,\"cwd\":\"/tmp\"}"
hook "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"$MOURN2\",\"username\":\"Mourner2\",\"avatar\":$A_MOURN2,\"cwd\":\"/tmp\"}"
sleep 4

# ── Step 7: Worker dies ──────────────────────────────
step "7/15" "Worker DIES at workstation #1" "Graphic death animation, tombstone rises at workstation #1"
hook "{\"hook_event_name\":\"SessionEnd\",\"session_id\":\"$WORKER\",\"username\":\"Worker\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\"}"
sleep 8

# ── Step 8: Flowers ──────────────────────────────────
step "8/15" "Idle mourners visit tombstone" "Mourner1 and/or Mourner2 walk to tombstone, place flowers (repeats every ~5s)"
echo "   (watching for 15 seconds...)"
sleep 15

# ── Step 9: NewGuy works ─────────────────────────────
step "9/15" "NewGuy spawns and starts working" "NewGuy goes to a free workstation — NOT #1, tombstone blocks it"
hook "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"$NEWGUY\",\"username\":\"NewGuy\",\"avatar\":$A_NEW,\"cwd\":\"/tmp\"}"
sleep 1
hook "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"$NEWGUY\",\"username\":\"NewGuy\",\"avatar\":$A_NEW,\"cwd\":\"/tmp\",\"tool_name\":\"Read\",\"tool_input\":{\"file_path\":\"/tmp/x.ts\"}}"
sleep 5

# ── Step 10: Zombie rises ────────────────────────────
step "10/15" "SAME Worker reconnects — ZOMBIE RISES" "Tombstone shakes+cracks, Worker rises GREEN with skull nametag, mourners scatter"
hook "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"$WORKER\",\"username\":\"Worker\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\"}"
sleep 6

# ── Step 11: Zombie works ────────────────────────────
step "11/15" "Zombie goes to work" "Zombie shambles slowly to workstation, stays green/ugly, periodic stagger"
hook "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"$WORKER\",\"username\":\"Worker\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"brains\"}}"
sleep 6

# ── Step 12: Zombie dies again ───────────────────────
step "12/15" "Zombie dies AGAIN" "Death animation, new tombstone, mourners visit again"
hook "{\"hook_event_name\":\"SessionEnd\",\"session_id\":\"$WORKER\",\"username\":\"Worker\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\"}"
echo "   Waiting 35s for tombstone to expire..."
sleep 35

# ── Step 13: Tombstone expired ───────────────────────
step "13/15" "Tombstone has expired" "Tombstone faded and sank, workstation #1 slot is free"
sleep 2

# ── Step 14: Fresh spawn ─────────────────────────────
step "14/15" "Same Worker reconnects AFTER tombstone expired" "FRESH spawn at entrance — normal colors, normal speed, NO zombie"
hook "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"$WORKER\",\"username\":\"Worker\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\"}"
sleep 4

# ── Step 15: Fresh worker works ──────────────────────
step "15/15" "Fresh Worker goes to work" "Normal agent walks to workstation at normal speed — previously blocked slot is free"
hook "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"$WORKER\",\"username\":\"Worker\",\"avatar\":$A_WORKER,\"cwd\":\"/tmp\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"echo hello\"}}"
sleep 3

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║              TEST COMPLETE                    ║"
echo "╚══════════════════════════════════════════════╝"
