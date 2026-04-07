# Go CLI Patterns — Detailed Reference

## Command Architecture

### Cobra Command Registration

**Where**: `cli/cmd/root.go:23-32`, `cli/cmd/install.go`, `cli/cmd/chat.go`, etc.

**What**: The root command registers all subcommands in its `init()` function. Each command file defines a package-level `*cobra.Command` variable and a private `run*()` function.

**Why**: Cobra's convention of `init()` registration ensures all commands are available before `Execute()`. The `RunE` pattern (vs `Run`) allows returning errors that Cobra prints and translates to exit code 1.

```go
// From: cli/cmd/root.go:23-32
func init() {
    rootCmd.AddCommand(installCmd)
    rootCmd.AddCommand(uninstallCmd)
    rootCmd.AddCommand(connectCmd)
    rootCmd.AddCommand(chatCmd)
    rootCmd.AddCommand(tokenCmd)
    rootCmd.AddCommand(avatarCmd)
    rootCmd.AddCommand(emoteCmd)
    rootCmd.AddCommand(updateCmd)
    rootCmd.AddCommand(vortexCmd)
}
```

### Flag Declaration Pattern

**Where**: `cli/cmd/install.go:16-34`

**What**: Flags are declared in the command file's `init()` function using `cmd.Flags().StringVar()` etc. No global/persistent flags are used.

**Why**: Each command owns its flags. The install command has the most flags (server URL, username, targets).

## TUI Components

### Avatar Designer (Bubbletea)

**Where**: `cli/internal/designer/designer.go` (318 lines), `cli/internal/designer/preview.go` (618 lines)

**What**: Full-featured TUI for designing pixel-art avatars:
- `designer.go`: `tea.Model` with field navigation, scroll windowing, color pickers
- `preview.go`: Renders a 32x32 sprite grid using Unicode half-block characters (`▀▄█`) with alpha blending

**Why**: Users customize their agent's appearance in the terminal. The preview renders the same sprite that Phaser's BootScene generates on the client.

```go
// From: cli/internal/designer/designer.go:312
p := tea.NewProgram(model, tea.WithAltScreen())
result, err := p.Run()
```

**Key implementation details**:
- Vim keybindings (`j/k/h/l`) plus arrow keys for navigation
- Scroll window adjusts when cursor moves beyond visible area
- Each field has a type (select, color picker, toggle) rendered differently in `View()`

### Lipgloss Style System

**Where**: `cli/internal/ui/styles.go:9-16`

**What**: Package-level style variables defined once, used throughout the CLI:

```go
// From: cli/internal/ui/styles.go:9-16
var TitleStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#ff00ff"))
var SuccessStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#00ff00"))
var ErrorStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#ff0000"))
```

**Why**: Consistent styling across all commands without re-declaring styles. Helper functions (`Success()`, `Error()`, `Info()`) wrap `fmt.Println` with the styled output.

### Huh Forms for Interactive Wizards

**Where**: `cli/cmd/install.go:62-76`, line 245-255

**What**: Installation uses multi-step Huh forms:
1. Target selection (Claude Code, Codex, both)
2. Server URL input
3. Username input
4. Confirmation

Forms support conditional fields via `.WithHideFunc()` to show/hide based on prior selections.

## Hook System

### Embedded Shell Script

**Where**: `cli/internal/hooks/hook_script.go:9-10`, `cli/internal/hooks/agent-factory-hook.sh`

**What**: The bash hook script is embedded at compile time. At install, it's written to `~/.config/agent-factory/hooks/agent-factory-hook.sh` with `0o755` permissions.

**Why**: Single binary distribution — no need to ship the script separately.

### Settings File Manipulation

**Where**: `cli/internal/hooks/settings.go` (482 lines)

**What**: The install command modifies Claude Code's `~/.claude/settings.json` and Codex's `~/.codex/hooks.json` to register the hook. Uses atomic writes (temp file + rename) to prevent corruption.

**Why**: Hook registration requires editing external tool configs. Atomic writes prevent data loss if the process is interrupted.

**Gotcha**: Uses `map[string]interface{}` for JSON manipulation because Claude's settings.json has a dynamic schema. This is the largest anti-pattern in the codebase but is pragmatically motivated.

## Configuration

### UserConfig Struct

**Where**: `cli/internal/config/config.go:10-33`

**What**: Config stored at `~/.config/agent-factory/config.json`. `AvatarConfig` uses `*string` and `*int` pointers for optional fields (null vs zero-value distinction).

```go
// From: cli/internal/config/config.go:10-26
type AvatarConfig struct {
    SkinTone  *string `json:"skinTone,omitempty"`
    HairStyle *string `json:"hairStyle,omitempty"`
    HairColor *string `json:"hairColor,omitempty"`
    ShirtColor *string `json:"shirtColor,omitempty"`
    // ...
}
type UserConfig struct {
    ServerURL string       `json:"serverUrl"`
    Username  string       `json:"username"`
    Avatar    AvatarConfig `json:"avatar"`
}
```

## Release & Distribution

### GoReleaser

**Where**: `cli/.goreleaser.yaml`

**What**: Cross-compiles for darwin/linux on amd64/arm64. Produces tar.gz archives. GitHub Actions triggers on `v*` tags.

**Why**: Single `git tag v1.x.x && git push --tags` workflow produces binaries for all platforms.

### Self-Update Mechanism

**Where**: `cli/cmd/update.go`

**What**: The `update` command fetches the latest release from GitHub API, downloads the appropriate binary, and replaces itself. Handles symlink resolution to update the actual binary, not the symlink.

## Edge Cases & Gotchas

- **Pointer config fields**: `AvatarConfig` uses `*string` pointers. Check for nil before dereferencing. `json:"...,omitempty"` skips nil pointers in serialization.
- **HTTP timeout**: Default 2-5s timeouts on server requests. If the server is slow to start, the CLI may fail before it's ready.
- **Symlink resolution in update**: `update.go` resolves symlinks before replacing the binary. Homebrew installs use symlinks, so this is critical.
- **Codex vs Claude config formats**: Claude uses `settings.json` with nested hooks; Codex uses a separate `hooks.json` with a different structure. Both paths are handled in `settings.go`.
- **`//go:embed` path**: The embed directive in `hook_script.go` is relative to the file's directory. Moving the file requires updating the embed path.
