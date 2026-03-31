#!/bin/bash
# Comprehensive Agent Factory Demo
# Exercises every activity, emote, lifecycle event, and API endpoint
# Usage: bash test-demo.sh
# Prerequisites: server running on localhost:4242 (pnpm dev)

BASE="http://localhost:4242"
TS=$(date +%s)

# Avatars
A_ALICE='{"spriteIndex":0,"color":"#4a90d9","hat":null,"trail":null}'
A_BOB='{"spriteIndex":2,"color":"#ff6b6b","hat":null,"trail":null}'
A_CHARLIE='{"spriteIndex":4,"color":"#51cf66","hat":null,"trail":null}'

# Session IDs
ALICE="alice-$TS"
BOB="bob-$TS"
CHARLIE="charlie-$TS"

hook() {
  curl -s -o /dev/null -X POST "$BASE/api/hooks" -H 'Content-Type: application/json' -d "$1"
}

emote() {
  curl -s -o /dev/null -X POST "$BASE/api/emote" -H 'Content-Type: application/json' -d "$1"
}

chat() {
  curl -s -o /dev/null -X POST "$BASE/api/chat" -H 'Content-Type: application/json' -d "$1"
}

context() {
  curl -s -o /dev/null -X POST "$BASE/api/context" -H 'Content-Type: application/json' -d "$1"
}

vortex() {
  curl -s -o /dev/null -X POST "$BASE/api/vortex"
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
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         AGENT FACTORY — FULL DEMO SEQUENCE               ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Agents: Alice (blue), Bob (red), Charlie (green)"
echo ""
echo "ACT I:   Setup & Spawn"
echo "  1.  Health check + cleanup"
echo "  2.  Spawn Alice"
echo "  3.  Spawn Bob"
echo ""
echo "ACT II:  Activities Tour"
echo "  4.  Alice reads (Read → reading)"
echo "  5.  Alice finishes reading (PostToolUse → thinking)"
echo "  6.  Alice writes (Write → writing)"
echo "  7.  Alice runs bash (Bash → running)"
echo "  8.  Bob searches (WebSearch → searching)"
echo "  9.  Alice greps (Grep → reading)"
echo "  10. Alice enters plan mode (EnterPlanMode → planning)"
echo "  11. Alice exits plan, uses Agent tool (→ chatting)"
echo "  12. Bob uses MCP tool (mcp__* → running)"
echo ""
echo "ACT III: Lifecycle Events"
echo "  13. User prompt for Alice (UserPromptSubmit)"
echo "  14. Spawn subagent on Alice (SubagentStart)"
echo "  15. Despawn subagent (SubagentStop)"
echo "  16. Permission request for Bob (PermissionRequest → waiting)"
echo "  17. Tool failure for Alice (PostToolUseFailure → error)"
echo "  18. Alice compacts (PreCompact → compacting)"
echo "  19. Alice finishes compact (PostCompact → thinking)"
echo ""
echo "ACT IV:  Chat, Context & Info"
echo "  20. Alice chats"
echo "  21. Bob chats back"
echo "  22. Update Alice task context"
echo "  23. Spawn Charlie"
echo "  24. Notification + TaskCompleted for Alice"
echo ""
echo "ACT V:   Emote Showcase"
echo "  25. Alice emotes: dance, jump, guitar, gun, laugh, wave"
echo "  26. Bob emotes: sleep, explode, dizzy, flex, rage, fart"
echo ""
echo "ACT VI:  Advanced Features"
echo "  27. Elicitation for Charlie (→ waiting)"
echo "  28. ElicitationResult for Charlie (→ thinking)"
echo "  29. Stop for Alice (→ idle)"
echo "  30. VORTEX! (global effect)"
echo ""
echo "ACT VII: Shutdown"
echo "  31. Charlie ends session"
echo "  32. Bob ends session"
echo "  33. Alice ends session"
echo "  34. Verify clean state"
echo ""
echo "Estimated runtime: ~2 minutes"
echo ""
read -p "Press Enter to start demo (make sure server is running)..."

# ═══════════════════════════════════════════════════════
# ACT I: Setup & Spawn
# ═══════════════════════════════════════════════════════

step "1/34" "Health check + cleanup" "Server responds OK, all existing agents removed"
HEALTH=$(curl -s "$BASE/api/health")
echo "   Health: $HEALTH"
EXISTING=$(curl -s "$BASE/api/state" | python3 -c "import sys,json; [print(a['sessionId']) for a in json.load(sys.stdin)['agents']]" 2>/dev/null)
for sid in $EXISTING; do
  hook "{\"hook_event_name\":\"SessionEnd\",\"session_id\":\"$sid\",\"username\":\"cleanup\",\"avatar\":$A_ALICE,\"cwd\":\"/tmp\"}"
done
sleep 4
echo "   Clean."

step "2/34" "Spawn Alice" "Alice (blue) appears at entrance, walks to lounge"
hook "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\"}"
sleep 3

step "3/34" "Spawn Bob" "Bob (red) appears at entrance, walks to lounge"
hook "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"$BOB\",\"username\":\"Bob\",\"avatar\":$A_BOB,\"cwd\":\"/home/bob/project\"}"
sleep 3

# ═══════════════════════════════════════════════════════
# ACT II: Activities Tour
# ═══════════════════════════════════════════════════════

step "4/34" "Alice reads" "Alice walks to workstation, magnifier icon, activity=reading"
hook "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\",\"tool_name\":\"Read\",\"tool_input\":{\"file_path\":\"/src/index.ts\"}}"
sleep 3

step "5/34" "Alice finishes reading" "Green sparks, thought bubble, activity=thinking"
hook "{\"hook_event_name\":\"PostToolUse\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\",\"tool_name\":\"Read\"}"
sleep 2

step "6/34" "Alice writes" "Pencil icon, activity=writing"
hook "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\",\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"/src/auth.ts\"}}"
sleep 3

step "7/34" "Alice runs bash" "PostToolUse then PreToolUse(Bash), terminal icon, activity=running"
hook "{\"hook_event_name\":\"PostToolUse\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\",\"tool_name\":\"Write\"}"
sleep 0.5
hook "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"npm test\"}}"
sleep 3

step "8/34" "Bob searches" "Bob walks to workstation, globe icon, activity=searching"
hook "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"$BOB\",\"username\":\"Bob\",\"avatar\":$A_BOB,\"cwd\":\"/home/bob/project\",\"tool_name\":\"WebSearch\",\"tool_input\":{\"query\":\"fastify websocket docs\"}}"
sleep 3

step "9/34" "Alice uses Grep" "Magnifier icon (reading tools), activity=reading"
hook "{\"hook_event_name\":\"PostToolUse\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\",\"tool_name\":\"Bash\"}"
sleep 0.5
hook "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\",\"tool_name\":\"Grep\",\"tool_input\":{\"pattern\":\"TODO\"}}"
sleep 2

step "10/34" "Alice enters plan mode" "Clipboard visual, activity=planning, sessionName=Planning"
hook "{\"hook_event_name\":\"PostToolUse\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\",\"tool_name\":\"Grep\"}"
sleep 0.5
hook "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\",\"tool_name\":\"EnterPlanMode\"}"
sleep 3

step "11/34" "Alice exits plan, uses Agent tool" "Chat icon, activity=chatting"
hook "{\"hook_event_name\":\"PostToolUse\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\",\"tool_name\":\"ExitPlanMode\"}"
sleep 1
hook "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\",\"tool_name\":\"Agent\",\"tool_input\":{\"prompt\":\"Research auth patterns\"}}"
sleep 3

step "12/34" "Bob uses MCP tool" "Terminal icon, activity=running (MCP maps to running)"
hook "{\"hook_event_name\":\"PostToolUse\",\"session_id\":\"$BOB\",\"username\":\"Bob\",\"avatar\":$A_BOB,\"cwd\":\"/home/bob/project\",\"tool_name\":\"WebSearch\"}"
sleep 0.5
hook "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"$BOB\",\"username\":\"Bob\",\"avatar\":$A_BOB,\"cwd\":\"/home/bob/project\",\"tool_name\":\"mcp__slack__send_message\",\"tool_input\":{\"channel\":\"general\"}}"
sleep 2

# ═══════════════════════════════════════════════════════
# ACT III: Lifecycle Events
# ═══════════════════════════════════════════════════════

step "13/34" "User prompt for Alice" "Activity=thinking, cyan sparks, prompt stored"
hook "{\"hook_event_name\":\"PostToolUse\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\",\"tool_name\":\"Agent\"}"
sleep 0.5
hook "{\"hook_event_name\":\"UserPromptSubmit\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\",\"user_prompt\":\"Fix the login bug in auth middleware\"}"
sleep 2

step "14/34" "Spawn subagent on Alice" "Purple sparks, mini orbiting sprite appears"
hook "{\"hook_event_name\":\"SubagentStart\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\",\"agent_id\":\"sub-research-1\",\"agent_type\":\"research\"}"
sleep 3

step "15/34" "Despawn subagent" "Sub-sprite vanishes with despawn animation"
hook "{\"hook_event_name\":\"SubagentStop\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\",\"agent_id\":\"sub-research-1\"}"
sleep 2

step "16/34" "Permission request for Bob" "Bob moves to front counter, activity=waiting, question bubble"
hook "{\"hook_event_name\":\"PostToolUse\",\"session_id\":\"$BOB\",\"username\":\"Bob\",\"avatar\":$A_BOB,\"cwd\":\"/home/bob/project\",\"tool_name\":\"mcp__slack__send_message\"}"
sleep 0.5
hook "{\"hook_event_name\":\"PermissionRequest\",\"session_id\":\"$BOB\",\"username\":\"Bob\",\"avatar\":$A_BOB,\"cwd\":\"/home/bob/project\"}"
sleep 3

step "17/34" "Tool failure for Alice" "Red/orange sparks, error effect"
hook "{\"hook_event_name\":\"PostToolUseFailure\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\",\"tool_name\":\"Bash\",\"reason\":\"exit code 1\"}"
sleep 2

step "18/34" "Alice starts compacting" "Activity=compacting, compress icon, purple sparks"
hook "{\"hook_event_name\":\"PreCompact\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\"}"
sleep 3

step "19/34" "Alice finishes compacting" "Activity=thinking, back to normal"
hook "{\"hook_event_name\":\"PostCompact\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\"}"
sleep 2

# ═══════════════════════════════════════════════════════
# ACT IV: Chat, Context & Info
# ═══════════════════════════════════════════════════════

step "20/34" "Alice chats" "Chat bubble: 'Almost done with the fix!'"
chat "{\"username\":\"Alice\",\"message\":\"Almost done with the fix!\"}"
sleep 3

step "21/34" "Bob chats back" "Chat bubble: 'Nice work, shipping it!'"
chat "{\"username\":\"Bob\",\"message\":\"Nice work, shipping it!\"}"
sleep 2

step "22/34" "Update Alice task context" "Alice tooltip now shows 'Fixing auth middleware'"
context "{\"username\":\"Alice\",\"summary\":\"Fixing auth middleware for session tokens\"}"
sleep 2

step "23/34" "Spawn Charlie" "Charlie (green) appears at entrance, walks to lounge — 3 agents on screen"
hook "{\"hook_event_name\":\"SessionStart\",\"session_id\":\"$CHARLIE\",\"username\":\"Charlie\",\"avatar\":$A_CHARLIE,\"cwd\":\"/home/charlie/project\"}"
sleep 3

step "24/34" "Notification + TaskCompleted for Alice" "Yellow sparks + message, then green 'DONE!' label"
hook "{\"hook_event_name\":\"Notification\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\",\"message\":\"Build passed\"}"
sleep 2
hook "{\"hook_event_name\":\"TaskCompleted\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\"}"
sleep 3

# ═══════════════════════════════════════════════════════
# ACT V: Emote Showcase
# ═══════════════════════════════════════════════════════

step "25/34" "Alice emote parade" "dance → jump → guitar → gun → laugh → wave (1.5s each)"
for e in dance jump guitar gun laugh wave; do
  echo "   Emote: $e"
  emote "{\"username\":\"Alice\",\"emote\":\"$e\"}"
  sleep 2
done

step "26/34" "Bob emote parade" "sleep → explode → dizzy → flex → rage → fart (1.5s each)"
# First give Bob a session that's not waiting so emotes look better
hook "{\"hook_event_name\":\"UserPromptSubmit\",\"session_id\":\"$BOB\",\"username\":\"Bob\",\"avatar\":$A_BOB,\"cwd\":\"/home/bob/project\",\"user_prompt\":\"Continue working\"}"
sleep 0.5
for e in sleep explode dizzy flex rage fart; do
  echo "   Emote: $e"
  emote "{\"username\":\"Bob\",\"emote\":\"$e\"}"
  sleep 2
done

# ═══════════════════════════════════════════════════════
# ACT VI: Advanced Features
# ═══════════════════════════════════════════════════════

step "27/34" "Elicitation for Charlie" "Charlie goes to waiting area, activity=waiting"
hook "{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"$CHARLIE\",\"username\":\"Charlie\",\"avatar\":$A_CHARLIE,\"cwd\":\"/home/charlie/project\",\"tool_name\":\"Read\",\"tool_input\":{\"file_path\":\"/tmp/a.ts\"}}"
sleep 2
hook "{\"hook_event_name\":\"PostToolUse\",\"session_id\":\"$CHARLIE\",\"username\":\"Charlie\",\"avatar\":$A_CHARLIE,\"cwd\":\"/home/charlie/project\",\"tool_name\":\"Read\"}"
sleep 1
hook "{\"hook_event_name\":\"Elicitation\",\"session_id\":\"$CHARLIE\",\"username\":\"Charlie\",\"avatar\":$A_CHARLIE,\"cwd\":\"/home/charlie/project\"}"
sleep 3

step "28/34" "ElicitationResult for Charlie" "Charlie goes back to thinking"
hook "{\"hook_event_name\":\"ElicitationResult\",\"session_id\":\"$CHARLIE\",\"username\":\"Charlie\",\"avatar\":$A_CHARLIE,\"cwd\":\"/home/charlie/project\"}"
sleep 2

step "29/34" "Stop for Alice" "Alice goes idle, walks to lounge area"
hook "{\"hook_event_name\":\"Stop\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\"}"
sleep 3

step "30/34" "VORTEX!" "All agents swirl toward center in a cosmic vortex"
vortex
sleep 8

# ═══════════════════════════════════════════════════════
# ACT VII: Shutdown
# ═══════════════════════════════════════════════════════

step "31/34" "Charlie ends session" "Death animation, red sparks, tombstone appears"
hook "{\"hook_event_name\":\"SessionEnd\",\"session_id\":\"$CHARLIE\",\"username\":\"Charlie\",\"avatar\":$A_CHARLIE,\"cwd\":\"/home/charlie/project\"}"
sleep 5

step "32/34" "Bob ends session" "Death animation, tombstone"
hook "{\"hook_event_name\":\"SessionEnd\",\"session_id\":\"$BOB\",\"username\":\"Bob\",\"avatar\":$A_BOB,\"cwd\":\"/home/bob/project\"}"
sleep 5

step "33/34" "Alice ends session" "Death animation, tombstone — last agent standing falls"
hook "{\"hook_event_name\":\"SessionEnd\",\"session_id\":\"$ALICE\",\"username\":\"Alice\",\"avatar\":$A_ALICE,\"cwd\":\"/home/alice/project\"}"
sleep 5

step "34/34" "Verify clean state" "0 agents remaining"
STATE=$(curl -s "$BASE/api/state")
COUNT=$(echo "$STATE" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['agents']))" 2>/dev/null)
echo "   Active agents: ${COUNT:-unknown}"
HEALTH=$(curl -s "$BASE/api/health")
echo "   Health: $HEALTH"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║               DEMO COMPLETE                              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Check server logs for [state] entries to verify all transitions."
