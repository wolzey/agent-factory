package hooks

import (
	_ "embed"
	"os"
	"path/filepath"
)

//go:embed agent-factory-hook.sh
var hookScript []byte

func HooksDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "agent-factory", "hooks")
}

func HookScriptPath() string {
	return filepath.Join(HooksDir(), "agent-factory-hook.sh")
}

func WriteHookScript() error {
	dir := HooksDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(HookScriptPath(), hookScript, 0o755)
}
