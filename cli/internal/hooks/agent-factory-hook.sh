#!/bin/bash
# Agent Factory hook - sends Claude/Codex events to the visualization server
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
