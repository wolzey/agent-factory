#!/bin/bash
# Agent Factory - Interactive Installer
#
# Install with:
#   curl -fsSL https://raw.githubusercontent.com/wolzey/agent-factory/main/install.sh -o /tmp/af-install.sh && bash /tmp/af-install.sh
#
# What this does:
#   1. Walks you through configuration (username, server URL, avatar)
#   2. Installs the hook script to ~/.config/agent-factory/
#   3. Registers hooks in ~/.claude/settings.json
#
# Requirements: jq, curl, Claude Code installed

set -e

# ── Colors & formatting ─────────────────────────────────────────────
BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[36m'
MAGENTA='\033[35m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

NEON_MAGENTA='\033[95m'
NEON_CYAN='\033[96m'
NEON_GREEN='\033[92m'

# ── Banner ───────────────────────────────────────────────────────────
banner() {
  echo ""
  echo -e "${NEON_MAGENTA}${BOLD}"
  echo "    ╔═══════════════════════════════════════╗"
  echo "    ║         🕹️  AGENT FACTORY  🕹️          ║"
  echo "    ║   2D pixel art agent visualization    ║"
  echo "    ╚═══════════════════════════════════════╝"
  echo -e "${RESET}"
  echo -e "  ${DIM}See your team's Claude agents working in a retro arcade${RESET}"
  echo ""
}

# ── Helpers ──────────────────────────────────────────────────────────
info()    { echo -e "  ${CYAN}>${RESET} $1"; }
success() { echo -e "  ${GREEN}✓${RESET} $1"; }
warn()    { echo -e "  ${YELLOW}!${RESET} $1"; }
fail()    { echo -e "  ${RED}✗${RESET} $1"; exit 1; }

prompt_with_default() {
  local prompt="$1"
  local default="$2"
  local result

  echo -ne "  ${CYAN}?${RESET} ${prompt} ${DIM}(${default})${RESET}: "
  read -r result
  echo "${result:-$default}"
}

prompt_choice() {
  local prompt="$1"
  shift
  local options=("$@")

  echo -e "\n  ${CYAN}?${RESET} ${prompt}"
  for i in "${!options[@]}"; do
    echo -e "    ${BOLD}$((i + 1))${RESET}) ${options[$i]}"
  done

  local choice
  echo -ne "  ${DIM}Enter number${RESET}: "
  read -r choice

  # Default to 1 if empty
  choice="${choice:-1}"

  # Validate
  if [[ "$choice" -ge 1 && "$choice" -le "${#options[@]}" ]]; then
    echo "$((choice - 1))"
  else
    echo "0"
  fi
}

# ── Preflight checks ────────────────────────────────────────────────
preflight() {
  info "Checking requirements..."

  for cmd in jq curl; do
    if ! command -v "$cmd" &>/dev/null; then
      fail "$cmd is required but not installed. Install it and try again."
    fi
  done

  if [ ! -f "${HOME}/.claude/settings.json" ]; then
    fail "~/.claude/settings.json not found. Is Claude Code installed?"
  fi

  # Check if already installed
  if [ -f "${HOME}/.config/agent-factory/config.json" ]; then
    echo ""
    warn "Agent Factory is already installed!"
    echo -ne "  ${CYAN}?${RESET} Reinstall and reconfigure? ${DIM}(y/N)${RESET}: "
    read -r reinstall
    if [[ ! "$reinstall" =~ ^[Yy] ]]; then
      echo ""
      info "Exiting. Your existing config is at ~/.config/agent-factory/config.json"
      exit 0
    fi
    echo ""
  fi

  success "All requirements met"
}

# ── Wizard ───────────────────────────────────────────────────────────
run_wizard() {
  echo ""
  echo -e "  ${BOLD}Let's set up your agent avatar${RESET}"
  echo -e "  ${DIM}─────────────────────────────────${RESET}"

  # Username
  local default_user
  default_user=$(whoami)
  USERNAME=$(prompt_with_default "What's your display name?" "$default_user")

  # Server URL
  echo ""
  echo -e "  ${BOLD}Server connection${RESET}"
  echo -e "  ${DIM}─────────────────────────────────${RESET}"
  local mode_idx
  mode_idx=$(prompt_choice "How are you connecting?" \
    "Local server (I'm running it myself)" \
    "Team server (someone shared a URL with me)")

  if [ "$mode_idx" = "0" ]; then
    SERVER_URL="http://localhost:4242"
    info "Using localhost:4242"
  else
    SERVER_URL=$(prompt_with_default "Enter the server URL" "http://localhost:4242")
  fi

  # Avatar
  echo ""
  echo -e "  ${BOLD}Choose your avatar${RESET}"
  echo -e "  ${DIM}─────────────────────────────────${RESET}"

  local color_idx
  color_idx=$(prompt_choice "Pick a color" \
    "${CYAN}Blue${RESET}    (#4a90d9)" \
    "${RED}Red${RESET}     (#ff6b6b)" \
    "${GREEN}Green${RESET}   (#51cf66)" \
    "${YELLOW}Yellow${RESET}  (#ffd43b)")

  local COLORS=("#4a90d9" "#ff6b6b" "#51cf66" "#ffd43b")
  local COLOR_NAMES=("blue" "red" "green" "yellow")
  AVATAR_COLOR="${COLORS[$color_idx]}"

  local sprite_idx
  sprite_idx=$(prompt_choice "Pick a character style" \
    "Engineer" \
    "Hacker" \
    "Designer" \
    "Manager")
  AVATAR_SPRITE="$sprite_idx"

  # Graphic death animation
  echo ""
  echo -e "  ${BOLD}Death animation${RESET}"
  echo -e "  ${DIM}─────────────────────────────────${RESET}"
  echo -e "  ${DIM}When your session ends, your agent plays a death animation.${RESET}"
  echo -e "  ${DIM}The graphic version is... ${RED}very bloody${RESET}${DIM}. 🩸${RESET}"
  echo ""
  echo -ne "  ${CYAN}?${RESET} Allow graphic death animation? ${DIM}(y/N)${RESET}: "
  read -r graphic_death
  if [[ "$graphic_death" =~ ^[Yy] ]]; then
    GRAPHIC_DEATH=true
  else
    GRAPHIC_DEATH=false
  fi

  # Confirm
  echo ""
  echo -e "  ${DIM}─────────────────────────────────${RESET}"
  echo -e "  ${BOLD}Your config:${RESET}"
  echo -e "    Name:   ${NEON_CYAN}${USERNAME}${RESET}"
  echo -e "    Server: ${DIM}${SERVER_URL}${RESET}"
  echo -e "    Color:  ${AVATAR_COLOR}"
  echo -e "    Style:  ${COLOR_NAMES[$color_idx]} ${sprite_idx}"
  if [ "$GRAPHIC_DEATH" = "true" ]; then
    echo -e "    Death:  ${RED}☠ GRAPHIC${RESET}"
  else
    echo -e "    Death:  ${DIM}💀 Standard${RESET}"
  fi
  echo ""

  echo -ne "  ${CYAN}?${RESET} Look good? ${DIM}(Y/n)${RESET}: "
  read -r confirm
  if [[ "$confirm" =~ ^[Nn] ]]; then
    echo ""
    info "Run the installer again to reconfigure."
    exit 0
  fi
}

# ── Install ──────────────────────────────────────────────────────────
install_hook_script() {
  local hooks_dir="${HOME}/.config/agent-factory/hooks"
  mkdir -p "$hooks_dir"

  cat > "${hooks_dir}/agent-factory-hook.sh" << 'HOOKEOF'
#!/bin/bash
# Agent Factory hook - sends Claude Code events to the visualization server
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

  chmod +x "${hooks_dir}/agent-factory-hook.sh"
  success "Hook script installed"
}

install_config() {
  local config_dir="${HOME}/.config/agent-factory"
  mkdir -p "$config_dir"

  cat > "${config_dir}/config.json" << EOF
{
  "username": "${USERNAME}",
  "serverUrl": "${SERVER_URL}",
  "avatar": {
    "spriteIndex": ${AVATAR_SPRITE},
    "color": "${AVATAR_COLOR}",
    "hat": null,
    "trail": null,
    "graphicDeath": ${GRAPHIC_DEATH}
  }
}
EOF

  success "Config saved to ${config_dir}/config.json"
}

register_hooks() {
  local settings="${HOME}/.claude/settings.json"
  local hook_cmd="${HOME}/.config/agent-factory/hooks/agent-factory-hook.sh"
  local hook_entry="{\"hooks\":[{\"type\":\"command\",\"command\":\"${hook_cmd}\"}]}"
  local events=("SessionStart" "SessionEnd" "PreToolUse" "PostToolUse" "SubagentStart" "SubagentStop" "Stop")

  # Backup
  cp "$settings" "${settings}.agent-factory-backup"

  local temp
  temp=$(mktemp)
  cp "$settings" "$temp"

  local registered=0
  local skipped=0

  for event in "${events[@]}"; do
    local already
    already=$(jq -r ".hooks.${event}[]?.hooks[]?.command // empty" "$temp" 2>/dev/null | grep -c "agent-factory-hook" || true)

    if [ "$already" -gt 0 ]; then
      skipped=$((skipped + 1))
      continue
    fi

    local result
    result=$(jq --arg event "$event" --argjson entry "$hook_entry" \
      '.hooks //= {} | .hooks[$event] //= [] | .hooks[$event] += [$entry]' "$temp")
    echo "$result" > "$temp"
    registered=$((registered + 1))
  done

  cp "$temp" "$settings"
  rm "$temp"

  if [ "$skipped" -gt 0 ] && [ "$registered" -eq 0 ]; then
    success "Hooks already registered (${skipped} events)"
  elif [ "$skipped" -gt 0 ]; then
    success "Registered ${registered} hooks (${skipped} already existed)"
  else
    success "Registered ${registered} hooks"
  fi
}

# ── Main ─────────────────────────────────────────────────────────────
main() {
  banner
  preflight
  run_wizard

  echo ""
  echo -e "  ${BOLD}Installing...${RESET}"
  echo -e "  ${DIM}─────────────────────────────────${RESET}"

  install_hook_script
  install_config
  register_hooks

  echo ""
  echo -e "  ${NEON_GREEN}${BOLD}Installation complete!${RESET}"
  echo ""
  echo -e "  ${BOLD}What now?${RESET}"
  echo ""

  if [[ "$SERVER_URL" == *"localhost"* ]]; then
    echo -e "  To run the server locally:"
    echo -e "    ${DIM}git clone https://github.com/wolzey/agent-factory.git${RESET}"
    echo -e "    ${DIM}cd agent-factory && pnpm install && pnpm dev${RESET}"
    echo ""
  fi

  echo -e "  Your avatar will appear in Agent Factory when"
  echo -e "  you start your next Claude Code session."
  echo ""
  echo -e "  ${DIM}Config:  ~/.config/agent-factory/config.json${RESET}"
  echo -e "  ${DIM}Hooks:   ~/.config/agent-factory/hooks/agent-factory-hook.sh${RESET}"
  echo -e "  ${DIM}Backup:  ~/.claude/settings.json.agent-factory-backup${RESET}"
  echo ""
  echo -e "  ${DIM}To uninstall, run:${RESET}"
  echo -e "  ${DIM}  curl -fsSL https://raw.githubusercontent.com/wolzey/agent-factory/main/uninstall.sh -o /tmp/af-uninstall.sh && bash /tmp/af-uninstall.sh${RESET}"
  echo ""
}

main
