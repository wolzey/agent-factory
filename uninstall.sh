#!/bin/bash
# Agent Factory - Uninstaller
# Removes hooks from Claude Code settings and cleans up config files.
# Run with: curl -fsSL https://raw.githubusercontent.com/wolzey/agent-factory/main/uninstall.sh | bash

set -e

BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

TTY=/dev/tty

echo "" >$TTY
echo -e "${RED}${BOLD}  Agent Factory - Uninstall${RESET}" >$TTY
echo -e "  ${DIM}─────────────────────────────${RESET}" >$TTY
echo "" >$TTY

SETTINGS="${HOME}/.claude/settings.json"
CONFIG_DIR="${HOME}/.config/agent-factory"

# ── Check if installed ───────────────────────────────────────────────
if [ ! -f "$SETTINGS" ]; then
  echo -e "  ${YELLOW}!${RESET} ~/.claude/settings.json not found. Nothing to uninstall." >$TTY
  exit 0
fi

HAS_HOOKS=$(grep -c "agent-factory-hook" "$SETTINGS" 2>/dev/null || true)
HAS_CONFIG=false
[ -d "$CONFIG_DIR" ] && HAS_CONFIG=true

if [ "$HAS_HOOKS" -eq 0 ] && [ "$HAS_CONFIG" = false ]; then
  echo -e "  ${GREEN}✓${RESET} Agent Factory is not installed. Nothing to do." >$TTY
  exit 0
fi

# ── Confirm ──────────────────────────────────────────────────────────
echo "  This will:" >$TTY
[ "$HAS_HOOKS" -gt 0 ] && echo -e "    - Remove Agent Factory hooks from ${DIM}~/.claude/settings.json${RESET}" >$TTY
[ "$HAS_CONFIG" = true ] && echo -e "    - Delete ${DIM}~/.config/agent-factory/${RESET} (config + hook script)" >$TTY
echo "" >$TTY
echo -ne "  ${CYAN}?${RESET} Continue? ${DIM}(y/N)${RESET}: " >$TTY
read -r confirm < /dev/tty

if [[ ! "$confirm" =~ ^[Yy] ]]; then
  echo "" >$TTY
  echo "  Cancelled." >$TTY
  exit 0
fi

echo "" >$TTY

# ── Remove hooks from settings.json ─────────────────────────────────
if [ "$HAS_HOOKS" -gt 0 ]; then
  if ! command -v jq &>/dev/null; then
    # Fallback: restore from backup if jq not available
    if [ -f "${SETTINGS}.agent-factory-backup" ]; then
      cp "${SETTINGS}.agent-factory-backup" "$SETTINGS"
      echo -e "  ${GREEN}✓${RESET} Restored settings from backup" >$TTY
    else
      echo -e "  ${RED}✗${RESET} jq not found and no backup available." >$TTY
      echo -e "    Manually remove lines containing 'agent-factory-hook' from" >$TTY
      echo -e "    ~/.claude/settings.json" >$TTY
      exit 1
    fi
  else
    # Use jq to surgically remove only our hook entries
    TEMP=$(mktemp)
    cp "$SETTINGS" "$TEMP"

    EVENTS=("SessionStart" "SessionEnd" "PreToolUse" "PostToolUse" "SubagentStart" "SubagentStop" "Stop")

    for EVENT in "${EVENTS[@]}"; do
      # Filter out any hook group whose command contains "agent-factory-hook"
      RESULT=$(jq --arg event "$EVENT" '
        if .hooks[$event] then
          .hooks[$event] |= [
            .[] | select(
              (.hooks // []) | all(.command | test("agent-factory-hook") | not)
            )
          ]
          # Remove the event key entirely if the array is now empty
          | if (.hooks[$event] | length) == 0
            then del(.hooks[$event])
            else .
            end
        else .
        end
      ' "$TEMP")
      echo "$RESULT" > "$TEMP"
    done

    # Remove .hooks key entirely if empty
    RESULT=$(jq 'if (.hooks | length) == 0 then del(.hooks) else . end' "$TEMP")
    echo "$RESULT" > "$TEMP"

    cp "$TEMP" "$SETTINGS"
    rm "$TEMP"

    echo -e "  ${GREEN}✓${RESET} Removed hooks from settings.json" >$TTY
  fi
fi

# ── Remove config directory ──────────────────────────────────────────
if [ "$HAS_CONFIG" = true ]; then
  rm -rf "$CONFIG_DIR"
  echo -e "  ${GREEN}✓${RESET} Removed ~/.config/agent-factory/" >$TTY
fi

# ── Clean up backup ──────────────────────────────────────────────────
if [ -f "${SETTINGS}.agent-factory-backup" ]; then
  rm -f "${SETTINGS}.agent-factory-backup"
  echo -e "  ${GREEN}✓${RESET} Removed settings backup" >$TTY
fi

echo "" >$TTY
echo -e "  ${GREEN}${BOLD}Uninstalled.${RESET} Agent Factory hooks are removed." >$TTY
echo -e "  ${DIM}Your Claude Code sessions will no longer send events.${RESET}" >$TTY
echo "" >$TTY
