#!/bin/bash
# Installs Agent Factory hooks into ~/.claude/settings.json
# Safely merges with existing hooks - never overwrites

set -e

SETTINGS_FILE="${HOME}/.claude/settings.json"
HOOK_SCRIPT="${HOME}/.config/agent-factory/hooks/agent-factory-hook.sh"
CONFIG_DIR="${HOME}/.config/agent-factory"
HOOKS_DIR="${CONFIG_DIR}/hooks"

echo "Agent Factory - Hook Installer"
echo "==============================="

# 1. Create config directory
mkdir -p "$HOOKS_DIR"

# 2. Copy hook script to config dir
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cp "$SCRIPT_DIR/agent-factory-hook.sh" "$HOOKS_DIR/agent-factory-hook.sh"
chmod +x "$HOOKS_DIR/agent-factory-hook.sh"
echo "  Installed hook script to $HOOKS_DIR/"

# 3. Create default config if not exists
if [ ! -f "${CONFIG_DIR}/config.json" ]; then
  cat > "${CONFIG_DIR}/config.json" <<EOF
{
  "username": "$(whoami)",
  "serverUrl": "http://localhost:4242",
  "avatar": {
    "spriteIndex": 0,
    "color": "#4a90d9",
    "hat": null,
    "trail": null
  }
}
EOF
  echo "  Created default config at ${CONFIG_DIR}/config.json"
else
  echo "  Config already exists at ${CONFIG_DIR}/config.json"
fi

# 4. Merge hooks into settings.json
if [ ! -f "$SETTINGS_FILE" ]; then
  echo "  Error: $SETTINGS_FILE not found"
  exit 1
fi

# Backup settings
cp "$SETTINGS_FILE" "${SETTINGS_FILE}.bak"
echo "  Backed up settings to ${SETTINGS_FILE}.bak"

# Hook events to register
EVENTS=("SessionStart" "SessionEnd" "PreToolUse" "PostToolUse" "SubagentStart" "SubagentStop" "Stop")

# Build the hook entry
HOOK_ENTRY=$(cat <<EOF
{
  "hooks": [
    {
      "type": "command",
      "command": "${HOOK_SCRIPT}"
    }
  ]
}
EOF
)

# Session boundaries stay synchronous; every other event runs in the background so
# Claude Code does not wait on the hook around each tool call (the server pairs tool
# events by tool_use_id). Existing entries are brought in line on every install.
SET_ASYNC='.hooks[$event] |= map(if (.hooks | type) == "array" then .hooks |= map(if ((.command // "") | tostring | contains("agent-factory-hook")) then (if $async then .async = true else del(.async) end) else . end) else . end)'

# For each event, append our hook entry if not already present
TEMP_FILE=$(mktemp)
cp "$SETTINGS_FILE" "$TEMP_FILE"

for EVENT in "${EVENTS[@]}"; do
  ASYNC=true; case "$EVENT" in SessionStart|SessionEnd) ASYNC=false ;; esac

  # Check if our hook is already registered for this event
  ALREADY=$(jq -r ".hooks.${EVENT}[]?.hooks[]?.command // empty" "$TEMP_FILE" 2>/dev/null | grep -c "agent-factory-hook" || true)

  if [ "$ALREADY" -gt 0 ]; then
    RESULT=$(jq --arg event "$EVENT" --argjson async "$ASYNC" "$SET_ASYNC" "$TEMP_FILE")
    echo "$RESULT" > "$TEMP_FILE"
    echo "  Hook already registered for $EVENT, updated"
    continue
  fi

  # Ensure the hooks object and event array exist, then append
  RESULT=$(jq \
    --arg event "$EVENT" \
    --argjson entry "$HOOK_ENTRY" \
    --argjson async "$ASYNC" \
    '.hooks //= {} | .hooks[$event] //= [] | .hooks[$event] += [$entry | if $async then .hooks[0].async = true else . end]' \
    "$TEMP_FILE")

  echo "$RESULT" > "$TEMP_FILE"
  echo "  Registered hook for $EVENT"
done

# Write back
cp "$TEMP_FILE" "$SETTINGS_FILE"
rm "$TEMP_FILE"

echo ""
echo "Done! Agent Factory hooks installed."
echo ""
echo "Next steps:"
echo "  1. Edit ~/.config/agent-factory/config.json to set your username and avatar"
echo "  2. Start the server: cd $(dirname "$SCRIPT_DIR") && pnpm dev"
echo "  3. Open http://localhost:5173 in your browser"
echo ""
