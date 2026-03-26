package hooks

import (
	_ "embed"
	"os"
	"path/filepath"
)

//go:embed update-status.md
var updateStatusSkill []byte

func CommandsDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".claude", "commands")
}

func WriteSkills() error {
	dir := CommandsDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, "update-status.md"), updateStatusSkill, 0o644)
}
