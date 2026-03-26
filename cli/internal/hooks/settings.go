package hooks

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

var hookEvents = []string{
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

func SettingsPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".claude", "settings.json")
}

func BackupPath() string {
	return SettingsPath() + ".agent-factory-backup"
}

func SettingsExist() bool {
	_, err := os.Stat(SettingsPath())
	return err == nil
}

func BackupSettings() error {
	src, err := os.ReadFile(SettingsPath())
	if err != nil {
		return err
	}
	return os.WriteFile(BackupPath(), src, 0o644)
}

// IsInstalled checks if any agent-factory hooks are registered in settings.json.
func IsInstalled() bool {
	data, err := os.ReadFile(SettingsPath())
	if err != nil {
		return false
	}
	return strings.Contains(string(data), "agent-factory-hook")
}

// RegisterHooks adds agent-factory hook entries to ~/.claude/settings.json
// for each event type, skipping events that already have one.
func RegisterHooks(hookScriptPath string) (registered, skipped int, err error) {
	settings, err := readSettings()
	if err != nil {
		return 0, 0, fmt.Errorf("reading settings: %w", err)
	}

	hooksMap := getOrCreateMap(settings, "hooks")

	for _, event := range hookEvents {
		if eventHasHook(hooksMap, event) {
			skipped++
			continue
		}

		entry := map[string]interface{}{
			"hooks": []interface{}{
				map[string]interface{}{
					"type":    "command",
					"command": hookScriptPath,
				},
			},
		}

		eventArr := getOrCreateArray(hooksMap, event)
		hooksMap[event] = append(eventArr, entry)
		registered++
	}

	settings["hooks"] = hooksMap

	if err := writeSettings(settings); err != nil {
		return 0, 0, fmt.Errorf("writing settings: %w", err)
	}

	return registered, skipped, nil
}

// UnregisterHooks removes all agent-factory hook entries from settings.json.
func UnregisterHooks() error {
	settings, err := readSettings()
	if err != nil {
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

	for _, event := range hookEvents {
		eventArr, ok := hooksMap[event]
		if !ok {
			continue
		}

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

	return writeSettings(settings)
}

func readSettings() (map[string]interface{}, error) {
	data, err := os.ReadFile(SettingsPath())
	if err != nil {
		return nil, err
	}

	var settings map[string]interface{}
	if err := json.Unmarshal(data, &settings); err != nil {
		return nil, err
	}

	return settings, nil
}

func writeSettings(settings map[string]interface{}) error {
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')

	// Atomic write: write to temp file in same dir, then rename
	dir := filepath.Dir(SettingsPath())
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

	return os.Rename(tmpPath, SettingsPath())
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
		cmdStr, ok := cmd.(string)
		if !ok {
			continue
		}
		if strings.Contains(cmdStr, "agent-factory-hook") {
			return true
		}
	}

	return false
}
