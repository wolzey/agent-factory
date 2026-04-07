#!/bin/bash
# Agent Factory - Lightweight Team Install
# This script installs ONLY the hook + config needed for a team member
# to connect to a shared Agent Factory server. No Node.js needed.
#
# Usage:
#   bash team-install.sh                           # defaults to localhost:4242
#   bash team-install.sh https://factory.team.com  # custom server URL
#   bash team-install.sh https://factory.team.com "alice"  # custom server + username
#
# Requirements: jq, curl

set -e

SERVER_URL="${1:-http://localhost:4242}"
USERNAME="${2:-$(whoami)}"

CONFIG_DIR="${HOME}/.config/agent-factory"
HOOKS_DIR="${CONFIG_DIR}/hooks"
SETTINGS_FILE="${HOME}/.claude/settings.json"

echo ""
echo "  Agent Factory - Team Install"
echo "  ============================"
echo "  Server: $SERVER_URL"
echo "  Username: $USERNAME"
echo ""

# Check dependencies
for cmd in jq curl; do
  if ! command -v $cmd &>/dev/null; then
    echo "  Error: $cmd is required but not installed"
    exit 1
  fi
done

if [ ! -f "$SETTINGS_FILE" ]; then
  echo "  Error: ~/.claude/settings.json not found. Is Claude Code installed?"
  exit 1
fi

# 1. Create directories
mkdir -p "$HOOKS_DIR"

# 2. Write the hook script inline (no need to clone the repo)
cat > "${HOOKS_DIR}/agent-factory-hook.sh" << 'HOOKEOF'
#!/bin/bash
CONFIG_FILE="${HOME}/.config/agent-factory/config.json"
SERVER_URL="http://localhost:4242"

if [ -f "$CONFIG_FILE" ]; then
  SERVER_URL=$(jq -r '.serverUrl // "http://localhost:4242"' "$CONFIG_FILE" 2>/dev/null || echo "http://localhost:4242")
  USERNAME=$(jq -r '.username // "anonymous"' "$CONFIG_FILE" 2>/dev/null || echo "anonymous")
  AVATAR=$(jq -c '.avatar // {}' "$CONFIG_FILE" 2>/dev/null || echo '{}')
else
  USERNAME=$(whoami)
  AVATAR='{}'
fi

# Strip trailing slash to avoid double-slash in URLs
SERVER_URL="${SERVER_URL%/}"

INPUT=$(cat)

PAYLOAD=$(echo "$INPUT" | jq -c \
  --arg username "$USERNAME" \
  --argjson avatar "$AVATAR" \
  '. + {username: $username, avatar: $avatar}' 2>/dev/null)

if [ -z "$PAYLOAD" ]; then
  PAYLOAD="$INPUT"
fi

curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "${SERVER_URL}/api/hooks" \
  --connect-timeout 1 \
  --max-time 2 \
  > /dev/null 2>&1 &

exit 0
HOOKEOF

chmod +x "${HOOKS_DIR}/agent-factory-hook.sh"
echo "  [ok] Hook script installed"

# 3. Create config file
SPRITE_INDEX=$((RANDOM % 8))
COLORS=("#4a90d9" "#ff6b6b" "#51cf66" "#ffd43b" "#cc5de8" "#ff922b" "#20c997" "#f06595")
COLOR=${COLORS[$((RANDOM % 8))]}

cat > "${CONFIG_DIR}/config.json" << EOF
{
  "username": "${USERNAME}",
  "serverUrl": "${SERVER_URL}",
  "avatar": {
    "spriteIndex": ${SPRITE_INDEX},
    "color": "${COLOR}",
    "hat": null,
    "trail": null
  }
}
EOF
echo "  [ok] Config created (sprite: ${SPRITE_INDEX}, color: ${COLOR})"

# 4. Register hooks in settings.json
cp "$SETTINGS_FILE" "${SETTINGS_FILE}.bak"
HOOK_CMD="${HOOKS_DIR}/agent-factory-hook.sh"
HOOK_ENTRY="{\"hooks\":[{\"type\":\"command\",\"command\":\"${HOOK_CMD}\"}]}"

EVENTS=("SessionStart" "SessionEnd" "PreToolUse" "PostToolUse" "SubagentStart" "SubagentStop" "Stop")

TEMP_FILE=$(mktemp)
cp "$SETTINGS_FILE" "$TEMP_FILE"

for EVENT in "${EVENTS[@]}"; do
  ALREADY=$(jq -r ".hooks.${EVENT}[]?.hooks[]?.command // empty" "$TEMP_FILE" 2>/dev/null | grep -c "agent-factory-hook" || true)
  if [ "$ALREADY" -gt 0 ]; then
    continue
  fi
  RESULT=$(jq --arg event "$EVENT" --argjson entry "$HOOK_ENTRY" \
    '.hooks //= {} | .hooks[$event] //= [] | .hooks[$event] += [$entry]' "$TEMP_FILE")
  echo "$RESULT" > "$TEMP_FILE"
done

cp "$TEMP_FILE" "$SETTINGS_FILE"
rm "$TEMP_FILE"
echo "  [ok] Hooks registered in settings.json"

echo ""
echo "  Done! Your avatar will appear in Agent Factory"
echo "  when you start your next Claude Code session."
echo ""
echo "  Config: ${CONFIG_DIR}/config.json"
echo "  Edit it to change your username, avatar color, etc."
echo ""
