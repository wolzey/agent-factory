---
name: go-cli
description: |
  Agent Factory Go CLI patterns and conventions.
  Use when: editing files in cli/, working with Cobra commands, Bubbletea TUI models,
  Lipgloss styles, Huh forms, hook installation, or GoReleaser config.
user-invocable: false
---

# Go CLI — Agent Factory

Go 1.25.1 CLI built with Cobra (commands), Bubbletea (TUI), Lipgloss (styling), and Huh (forms).
The CLI connects users to the Agent Factory server, manages hook installation into Claude Code
and Codex, and provides an avatar designer with terminal pixel-art preview.

## Patterns

### Cobra RunE with Delegated Functions

Every command uses `RunE` (not `Run`) and delegates to a private `run*()` function for proper
error propagation.

```go
// From: cli/cmd/install.go:23-27
var installCmd = &cobra.Command{
    Use:   "install",
    Short: "Install Agent Factory hooks",
    RunE:  runInstall,
}
```

### Bubbletea Model Pattern

The avatar designer implements the full `tea.Model` interface with vim-style navigation
and scroll windowing.

```go
// From: cli/internal/designer/designer.go:104-148
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
    switch msg := msg.(type) {
    case tea.KeyMsg:
        switch msg.String() {
        case "j", "down": m.cursorDown()
        case "k", "up":   m.cursorUp()
        }
    }
    return m, nil
}
```

### Huh Form Builder for Wizard Steps

Interactive installation uses Huh forms with fluent builder syntax and conditional fields.

```go
// From: cli/cmd/install.go:62-76
form := huh.NewForm(
    huh.NewGroup(
        huh.NewConfirm().Title("Install for Claude Code?").Value(&installClaude),
        huh.NewInput().Title("Server URL").Value(&serverURL),
    ),
)
form.Run()
```

### Embedded Bash Hook Script

The hook shell script is compiled into the binary via `//go:embed` and written to disk at
install time with executable permissions.

```go
// From: cli/internal/hooks/hook_script.go:9-10
//go:embed agent-factory-hook.sh
var hookScript []byte
```

## Conventions

- **File structure**: `cli/main.go` (entry), `cli/cmd/` (Cobra commands), `cli/internal/` (config, ui, hooks, designer)
- **Command naming**: One file per command (`install.go`, `chat.go`, `token.go`), exported `*Cmd` variable, private `run*()` function
- **Imports**: stdlib first, then Charmbracelet libs, then Cobra, then internal packages
- **Error handling**: Wrap with context via `fmt.Errorf("...: %w", err)`; `ui.Error()` for user-visible messages
- **Config**: JSON at `~/.config/agent-factory/config.json`; `config.Read()` returns `UserConfig` struct
- **HTTP**: `http.Client{Timeout: 2*time.Second}` for server requests; string-concatenated URLs

## Common Workflow: Adding a New CLI Command

1. Create `cli/cmd/yourcommand.go` with a `var yourCmd = &cobra.Command{...}`
2. Set `RunE: runYourCommand` pointing to a private function
3. Register in `cli/cmd/root.go` init: `rootCmd.AddCommand(yourCmd)`
4. Add flags in an `init()` function if needed
5. Build and test: `cd cli && go build -o agent-factory && ./agent-factory yourcommand`

## Anti-Patterns

### WARNING: Discarded io.ReadAll Errors

HTTP response bodies are read with `io.ReadAll()` but the error is discarded.

```go
// BAD — from cli/cmd/chat.go:64
body, _ := io.ReadAll(resp.Body)

// GOOD — check the error:
body, err := io.ReadAll(resp.Body)
if err != nil {
    return fmt.Errorf("reading response: %w", err)
}
```

### WARNING: Untyped interface{} for JSON Settings

Hook registration uses `map[string]interface{}` requiring repeated type assertions that can
panic. Use typed structs with JSON tags instead.

```go
// BAD — from cli/internal/hooks/settings.go:222-239
data := map[string]interface{}{}
json.Unmarshal(raw, &data)
hooks := data["hooks"].(map[string]interface{}) // can panic

// GOOD — define a struct:
type ClaudeSettings struct {
    Hooks map[string]HookConfig `json:"hooks"`
}
```

## References

- [Detailed patterns and examples](references/patterns.md)

## Related Skills

- **[fastify](../fastify/SKILL.md)** — Server receiving hook events posted by the CLI
- **[typescript](../typescript/SKILL.md)** — Shared types defining the hook event payload format
