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
# Agent Factory hook - sends Claude/Codex events to the visualization server
#
# Privacy boundary. Claude and Codex put a lot more on stdin than an avatar needs:
# UserPromptSubmit carries the entire prompt, PreToolUse carries the entire
# tool_input (whole Bash command lines, the file contents handed to Write/Edit),
# and PostToolUse adds tool_response, which is tool output. This script therefore
# sends an explicit allowlist -- never the raw payload -- so a session working in
# a private repo or against production does not stream its contents to the server.
#
# The allowlist is exactly the set of fields server/state.ts reads. The two
# features that used to read prompt text and tool_input are derived here instead,
# at the boundary, and sent as small fields:
#   session_name -- from `/rename <name>`, or a worktree's tool_input.name
#   git_action   -- "commit" or "pr_merge", derived from a Bash command
CONFIG_FILE="${HOME}/.config/agent-factory/config.json"
IDENTITY_FILE="${HOME}/.config/agent-factory/identity.json"
SERVER_URL="http://localhost:4242"
DEVICE_SECRET=""

ensure_identity() {
  if [ -f "$IDENTITY_FILE" ]; then return; fi

  local generated temp
  generated=$(dd if=/dev/urandom bs=32 count=1 2>/dev/null | base64 | tr '+/' '-_' | tr -d '=\n\r')
  if [ "${#generated}" -ne 43 ]; then return; fi

  mkdir -p "$(dirname "$IDENTITY_FILE")" || return
  temp="${IDENTITY_FILE}.$$"
  (umask 077 && printf '{\n  "version": 1,\n  "secret": "afd1_%s"\n}\n' "$generated" > "$temp") || return
  if ln "$temp" "$IDENTITY_FILE" 2>/dev/null; then
    chmod 600 "$IDENTITY_FILE"
  fi
  rm -f "$temp"
}

ensure_identity
INPUT=$(cat)
WORKING_DIR=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
if [ -z "$WORKING_DIR" ]; then
  WORKING_DIR="$PWD"
fi

if [ -f "$CONFIG_FILE" ]; then
  RESOLVED_CONFIG=$(jq -c --arg cwd "$WORKING_DIR" --arg home "$HOME" '
    def expand_path:
      if . == "~" then $home
      elif startswith("~/") then $home + .[1:]
      else .
      end
      | if . == "/" then . else rtrimstr("/") end;

    ($cwd | if . == "/" then . else rtrimstr("/") end) as $workingDir
    | . as $base
    | [
        ($base.repositories // {} | to_entries[]?)
        | select(.value | type == "object")
        | . + {resolvedPath: (.key | expand_path)}
        | .resolvedPath as $repositoryPath
        | select(
            $repositoryPath != "" and (
              $workingDir == $repositoryPath
              or ($repositoryPath == "/" and ($workingDir | startswith("/")))
              or ($workingDir | startswith($repositoryPath + "/"))
            )
          )
      ]
    | sort_by(.resolvedPath | length)
    | reduce .[] as $entry ($base; . + $entry.value)
  ' "$CONFIG_FILE" 2>/dev/null)
  if [ -z "$RESOLVED_CONFIG" ]; then
    RESOLVED_CONFIG='{}'
  fi

  SERVER_URL=$(echo "$RESOLVED_CONFIG" | jq -r '.serverUrl // "http://localhost:4242"' 2>/dev/null || echo "http://localhost:4242")
  USERNAME=$(echo "$RESOLVED_CONFIG" | jq -r '.username // "anonymous"' 2>/dev/null || echo "anonymous")
  AVATAR=$(echo "$RESOLVED_CONFIG" | jq -c '.avatar // {}' 2>/dev/null || echo '{}')
else
  USERNAME=$(whoami)
  AVATAR='{}'
fi

if [ -f "$IDENTITY_FILE" ]; then
  DEVICE_SECRET=$(jq -r 'select(.version == 1) | .secret // empty' "$IDENTITY_FILE" 2>/dev/null)
fi

# Strip trailing slash to avoid double-slash in URLs
SERVER_URL="${SERVER_URL%/}"

# The server can only reject plaintext after the installation credential has
# crossed the wire. Refuse unsafe destinations before invoking curl.
safe_factory_url() {
  local address="$1" authority host part
  [[ "$address" != *[[:space:]\\\?\#]* ]] || return 1
  case "$address" in
    https://*) authority="${address#https://}" ;;
    http://*) authority="${address#http://}" ;;
    *) return 1 ;;
  esac
  authority="${authority%%/*}"
  [[ "$authority" =~ ^([A-Za-z0-9.-]+|\[[A-Fa-f0-9:.]+\])(:[0-9]+)?$ ]] || return 1
  [[ "$address" == https://* ]] && return 0
  [[ "$authority" =~ ^localhost(:[0-9]+)?$ ]] && return 0
  [[ "$authority" =~ ^\[(::1|0:0:0:0:0:0:0:1)\](:[0-9]+)?$ ]] && return 0
  host="${authority%%:*}"
  [[ "$host" =~ ^127\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || return 1
  for part in "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"; do
    [[ "$part" == 0 || "$part" != 0* ]] || return 1
    (( 10#$part <= 255 )) || return 1
  done
}
safe_factory_url "$SERVER_URL" || exit 0

PAYLOAD=$(echo "$INPUT" | jq -c \
  --arg username "$USERNAME" \
  --argjson avatar "$AVATAR" \
  '
  # Derived strings are capped: they end up as a curl argument, and an enormous
  # one would blow the argument limit and silently lose the event.
  def cap: if type == "string" then .[0:200] else null end;
  # Identity and paths are bounded too, for the same reason.
  def cap_field: if type == "string" then .[0:512] else null end;

  . as $in
  | ($in.tool_input | if type == "object" then . else {} end) as $ti
  | ($in.hook_event_name // "") as $ev
  | ($in.tool_name // "") as $tool
  | (($ev == "WorktreeCreate") or ($ev == "WorktreeRemove")
     or ($tool == "EnterWorktree") or ($tool == "ExitWorktree")) as $isWorktree

  # `/rename <name>` is the one prompt-derived feature. Deliberately unanchored at
  # the end, matching the server regex it replaces: `/rename foo\nbar` names the
  # session `foo` rather than failing to match.
  | ((($in.user_prompt // $in.prompt) | if type == "string" then . else "" end)
     | (capture("^/rename\\s+(?<n>.+)") // null)
     | if . == null then null else (.n | gsub("^\\s+|\\s+$"; "")) end) as $renamed

  # tool_input.name is read only for worktree events, so it is only forwarded for
  # worktree events -- another tool may put something private in a `name` field.
  | (if $isWorktree
     then (if ($ti.name | type) == "string" then $ti.name
           elif ($in.name | type) == "string" then $in.name
           else null end)
     else null end) as $worktreeName

  # An explicit rename wins over a worktree name, rather than being overwritten.
  | (if ($renamed // "") != "" then $renamed
     elif ($worktreeName // "") != "" then $worktreeName
     else null end) as $sessionName

  # Only PostToolUse, matching the one place the server plays these effects.
  | (if $ev == "PostToolUse" and $tool == "Bash"
     then (($ti.command // "") | if type == "string" then . else "" end)
          | if test("git\\s+commit\\b") then "commit"
            elif test("gh\\s+pr\\s+merge\\b|git\\s+merge\\b") then "pr_merge"
            else null end
     else null end) as $gitAction

  | {
      session_id: ($in.session_id | cap_field),
      hook_event_name: ($in.hook_event_name | cap_field),
      cwd: ($in.cwd | cap_field),
      tool_name: ($in.tool_name | cap_field),
      # An opaque call id: async hooks arrive in any order, so the server pairs start and end.
      tool_use_id: ($in.tool_use_id | cap_field),
      reason: ($in.reason | cap),
      agent_id: ($in.agent_id | cap_field),
      agent_type: ($in.agent_type | cap_field),
      message: ($in.message | cap),
      session_name: ($sessionName | cap),
      git_action: $gitAction,
      username: ($username | cap_field),
      avatar: $avatar
    }
  | with_entries(select(.value != null))
  ' 2>/dev/null)

# No silent fallback to the raw input. If the filter fails the event is dropped,
# because sending an unfiltered payload is the exact outcome this guards against.
if [ -z "$PAYLOAD" ]; then
  exit 0
fi

CURL_ARGS=(
  -s -X POST
  -H "Content-Type: application/json"
  -d "$PAYLOAD"
  "${SERVER_URL}/api/hooks"
  --connect-timeout 1
  --max-time 2
  --max-redirs 0
)
if [ -n "$DEVICE_SECRET" ]; then
  CURL_ARGS=(-H "Authorization: Bearer ${DEVICE_SECRET}" "${CURL_ARGS[@]}")
fi

# Ignore ~/.curlrc so a user's global --location cannot forward credentials.
if [[ "$PAYLOAD" == *'"hook_event_name":"SessionStart"'* ]]; then
  # A sleeping or restarting server would drop the one event that admits this
  # session, hiding it until it ends. Retry for about a minute and a half, detached
  # from the hook's stdio so Claude Code never waits on the retries.
  ( for delay in 0 5 20 60; do
      sleep "$delay"
      curl --disable --fail "${CURL_ARGS[@]}" > /dev/null 2>&1 && break
    done ) > /dev/null 2>&1 < /dev/null &
else
  curl --disable "${CURL_ARGS[@]}" > /dev/null 2>&1 &
fi

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

# Session boundaries stay synchronous; every other event runs in the background so
# Claude Code does not wait on the hook around each tool call (the server pairs tool
# events by tool_use_id). Existing entries are brought in line on every install.
SET_ASYNC='.hooks[$event] |= map(if (.hooks | type) == "array" then .hooks |= map(if ((.command // "") | tostring | contains("agent-factory-hook")) then (if $async then .async = true else del(.async) end) else . end) else . end)'
for EVENT in "${EVENTS[@]}"; do
  ASYNC=true; case "$EVENT" in SessionStart|SessionEnd) ASYNC=false ;; esac
  ALREADY=$(jq -r ".hooks.${EVENT}[]?.hooks[]?.command // empty" "$TEMP_FILE" 2>/dev/null | grep -c "agent-factory-hook" || true)
  if [ "$ALREADY" -gt 0 ]; then
    RESULT=$(jq --arg event "$EVENT" --argjson async "$ASYNC" "$SET_ASYNC" "$TEMP_FILE")
  else
    RESULT=$(jq --arg event "$EVENT" --argjson entry "$HOOK_ENTRY" --argjson async "$ASYNC" \
      '.hooks //= {} | .hooks[$event] //= [] | .hooks[$event] += [$entry | if $async then .hooks[0].async = true else . end]' "$TEMP_FILE")
  fi
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
