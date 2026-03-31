package hooks

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

type HookTarget string

const (
	TargetClaude HookTarget = "claude"
	TargetCodex  HookTarget = "codex"
)

var hookEventsClaude = []string{
	"SessionStart",
	"SessionEnd",
	"PreToolUse",
	"PostToolUse",
	"SubagentStart",
	"SubagentStop",
	"Stop",
	"PermissionRequest",
	"UserPromptSubmit",
	"PostToolUseFailure",
	"StopFailure",
	"Notification",
	"TaskCompleted",
	"InstructionsLoaded",
	"ConfigChange",
	"CwdChanged",
	"FileChanged",
	"WorktreeCreate",
	"WorktreeRemove",
	"PreCompact",
	"PostCompact",
	"TeammateIdle",
	"Elicitation",
	"ElicitationResult",
}

var hookEventsCodex = []string{
	"SessionStart",
	"PreToolUse",
	"PostToolUse",
	"UserPromptSubmit",
	"Stop",
}

func ClaudeSettingsPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".claude", "settings.json")
}

func CodexHooksPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".codex", "hooks.json")
}

func CodexConfigPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".codex", "config.toml")
}

func SettingsPath(target HookTarget) string {
	switch target {
	case TargetCodex:
		return CodexHooksPath()
	case TargetClaude:
		fallthrough
	default:
		return ClaudeSettingsPath()
	}
}

func BackupPath(target HookTarget) string {
	return SettingsPath(target) + ".agent-factory-backup"
}

func ClaudeDetected() bool {
	return fileExists(ClaudeSettingsPath())
}

func CodexDetected() bool {
	return fileExists(CodexConfigPath()) || fileExists(CodexHooksPath())
}

func DetectedTargets() []HookTarget {
	targets := make([]HookTarget, 0, 2)
	if ClaudeDetected() {
		targets = append(targets, TargetClaude)
	}
	if CodexDetected() {
		targets = append(targets, TargetCodex)
	}
	return targets
}

func BackupSettings(target HookTarget) error {
	src, err := os.ReadFile(SettingsPath(target))
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return os.WriteFile(BackupPath(target), src, 0o644)
}

// IsInstalled checks if any agent-factory hooks are registered for a target.
func IsInstalled(target HookTarget) bool {
	data, err := os.ReadFile(SettingsPath(target))
	if err != nil {
		return false
	}
	return strings.Contains(string(data), "agent-factory-hook")
}

func InstalledTargets() []HookTarget {
	targets := make([]HookTarget, 0, 2)
	for _, target := range []HookTarget{TargetClaude, TargetCodex} {
		if IsInstalled(target) {
			targets = append(targets, target)
		}
	}
	return targets
}

// RegisterHooks adds agent-factory hook entries to target hook settings
// for each event type, skipping events that already have one.
func RegisterHooks(target HookTarget, hookScriptPath string) (registered, skipped int, err error) {
	if target == TargetCodex {
		if err := EnsureCodexHooksEnabled(); err != nil {
			return 0, 0, fmt.Errorf("enabling codex hooks in config.toml: %w", err)
		}
	}

	settings, err := readSettings(target)
	if err != nil {
		return 0, 0, fmt.Errorf("reading settings: %w", err)
	}

	hooksMap := getOrCreateMap(settings, "hooks")
	events := eventsForTarget(target)

	for _, event := range events {
		if eventHasHook(hooksMap, event) {
			skipped++
			continue
		}

		entry := makeHookEntry(target, hookScriptPath)

		eventArr := getOrCreateArray(hooksMap, event)
		hooksMap[event] = append(eventArr, entry)
		registered++
	}

	settings["hooks"] = hooksMap

	if err := writeSettings(target, settings); err != nil {
		return 0, 0, fmt.Errorf("writing settings: %w", err)
	}

	return registered, skipped, nil
}

// UnregisterHooks removes all agent-factory hook entries from target settings.
func UnregisterHooks(target HookTarget) error {
	settings, err := readSettings(target)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("reading settings: %w", err)
	}

	hooksObj, ok := settings["hooks"]
	if !ok {
		return nil
	}

	hooksMap, ok := hooksObj.(map[string]interface{})
	if !ok {
		return nil
	}

	for event, eventArr := range hooksMap {
		arr, ok := eventArr.([]interface{})
		if !ok {
			continue
		}

		filtered := make([]interface{}, 0, len(arr))
		for _, entry := range arr {
			if !entryContainsHook(entry) {
				filtered = append(filtered, entry)
			}
		}

		if len(filtered) == 0 {
			delete(hooksMap, event)
		} else {
			hooksMap[event] = filtered
		}
	}

	if len(hooksMap) == 0 {
		delete(settings, "hooks")
	} else {
		settings["hooks"] = hooksMap
	}

	return writeSettings(target, settings)
}

func readSettings(target HookTarget) (map[string]interface{}, error) {
	data, err := os.ReadFile(SettingsPath(target))
	if err != nil {
		if os.IsNotExist(err) && target == TargetCodex {
			return map[string]interface{}{}, nil
		}
		return nil, err
	}
	if len(strings.TrimSpace(string(data))) == 0 {
		return map[string]interface{}{}, nil
	}

	var settings map[string]interface{}
	if err := json.Unmarshal(data, &settings); err != nil {
		return nil, err
	}

	return settings, nil
}

func writeSettings(target HookTarget, settings map[string]interface{}) error {
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')

	// Atomic write: write to temp file in same dir, then rename
	dir := filepath.Dir(SettingsPath(target))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".settings-*.json")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()

	if _, err := io.Copy(tmp, strings.NewReader(string(data))); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}

	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}

	return os.Rename(tmpPath, SettingsPath(target))
}

func EnsureCodexHooksEnabled() error {
	configPath := CodexConfigPath()
	if err := os.MkdirAll(filepath.Dir(configPath), 0o755); err != nil {
		return err
	}

	content, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return os.WriteFile(configPath, []byte("[features]\ncodex_hooks = true\n"), 0o644)
		}
		return err
	}

	updated := enableCodexHooksInToml(string(content))
	if updated == string(content) {
		return nil
	}

	return os.WriteFile(configPath, []byte(updated), 0o644)
}

func enableCodexHooksInToml(input string) string {
	lines := strings.Split(input, "\n")
	sectionRegex := regexp.MustCompile(`^\s*\[([^\]]+)\]\s*$`)
	flagRegex := regexp.MustCompile(`(?i)^\s*codex_hooks\s*=\s*(true|false)\s*(#.*)?$`)

	featuresStart := -1
	featuresEnd := len(lines)
	currentSection := ""
	flagLine := -1
	flagValue := ""

	for i, line := range lines {
		if m := sectionRegex.FindStringSubmatch(line); m != nil {
			if currentSection == "features" && featuresEnd == len(lines) {
				featuresEnd = i
			}
			currentSection = strings.TrimSpace(m[1])
			if currentSection == "features" && featuresStart == -1 {
				featuresStart = i
			}
			continue
		}

		if currentSection == "features" {
			m := flagRegex.FindStringSubmatch(line)
			if m == nil {
				continue
			}
			flagLine = i
			flagValue = strings.ToLower(m[1])
		}
	}

	if currentSection == "features" && featuresEnd == len(lines) {
		featuresEnd = len(lines)
	}

	if flagLine >= 0 {
		if flagValue == "true" {
			return input
		}
		lines[flagLine] = "codex_hooks = true"
		return strings.Join(lines, "\n")
	}

	if featuresStart >= 0 {
		newLines := make([]string, 0, len(lines)+1)
		newLines = append(newLines, lines[:featuresEnd]...)
		newLines = append(newLines, "codex_hooks = true")
		newLines = append(newLines, lines[featuresEnd:]...)
		return strings.Join(newLines, "\n")
	}

	out := strings.TrimRight(input, "\n")
	if out != "" {
		out += "\n\n"
	}
	out += "[features]\ncodex_hooks = true\n"
	return out
}

func eventsForTarget(target HookTarget) []string {
	if target == TargetCodex {
		return hookEventsCodex
	}
	return hookEventsClaude
}

func makeHookEntry(target HookTarget, hookScriptPath string) map[string]interface{} {
	command := interface{}(hookScriptPath)
	entry := map[string]interface{}{
		"hooks": []interface{}{
			map[string]interface{}{
				"type":    "command",
				"command": command,
			},
		},
	}

	if target == TargetCodex {
		entry["matcher"] = "*"
		entry["hooks"] = []interface{}{
			map[string]interface{}{
				"type":    "command",
				"command": []interface{}{hookScriptPath},
			},
		}
	}

	return entry
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func getOrCreateMap(parent map[string]interface{}, key string) map[string]interface{} {
	if v, ok := parent[key]; ok {
		if m, ok := v.(map[string]interface{}); ok {
			return m
		}
	}
	m := make(map[string]interface{})
	parent[key] = m
	return m
}

func getOrCreateArray(parent map[string]interface{}, key string) []interface{} {
	if v, ok := parent[key]; ok {
		if a, ok := v.([]interface{}); ok {
			return a
		}
	}
	return []interface{}{}
}

// eventHasHook checks if an event already has an agent-factory-hook entry.
func eventHasHook(hooksMap map[string]interface{}, event string) bool {
	eventArr, ok := hooksMap[event]
	if !ok {
		return false
	}

	arr, ok := eventArr.([]interface{})
	if !ok {
		return false
	}

	for _, entry := range arr {
		if entryContainsHook(entry) {
			return true
		}
	}

	return false
}

// entryContainsHook checks if a hook group entry contains an agent-factory-hook command.
func entryContainsHook(entry interface{}) bool {
	entryMap, ok := entry.(map[string]interface{})
	if !ok {
		return false
	}

	hooksArr, ok := entryMap["hooks"]
	if !ok {
		return false
	}

	arr, ok := hooksArr.([]interface{})
	if !ok {
		return false
	}

	for _, h := range arr {
		hookMap, ok := h.(map[string]interface{})
		if !ok {
			continue
		}
		cmd, ok := hookMap["command"]
		if !ok {
			continue
		}
		if commandContainsHook(cmd) {
			return true
		}
	}

	return false
}

func commandContainsHook(command interface{}) bool {
	switch cmd := command.(type) {
	case string:
		return strings.Contains(cmd, "agent-factory-hook")
	case []interface{}:
		for _, part := range cmd {
			partStr, ok := part.(string)
			if ok && strings.Contains(partStr, "agent-factory-hook") {
				return true
			}
		}
	}
	return false
}
