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
SERVER_URL="http://localhost:4242"
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

# Strip trailing slash to avoid double-slash in URLs
SERVER_URL="${SERVER_URL%/}"

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

curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "${SERVER_URL}/api/hooks" \
  --connect-timeout 1 \
  --max-time 2 \
  > /dev/null 2>&1 &

exit 0
