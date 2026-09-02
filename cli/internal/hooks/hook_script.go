package hooks

import (
	"bytes"
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

// HookScriptMatchesEmbedded reports whether the installed hook script is the one
// embedded in this binary.
func HookScriptMatchesEmbedded() bool {
	onDisk, err := os.ReadFile(HookScriptPath())
	if err != nil {
		return false
	}
	return bytes.Equal(onDisk, hookScript)
}

// SyncHookScript rewrites the installed hook script when it differs from the one
// embedded here, and reports whether it rewrote anything.
//
// `update` replaces the binary from inside the *old* process, so the old code is
// what finishes that run -- a fix to the hook script would not be written by the
// upgrade that delivers it. Every command therefore repairs the script on the
// next run of the new binary instead of relying on the upgrade itself.
func SyncHookScript() (bool, error) {
	if _, err := os.Stat(HookScriptPath()); err != nil {
		return false, nil // not installed; `install` is what puts it there
	}
	if HookScriptMatchesEmbedded() {
		return false, nil
	}
	if err := WriteHookScript(); err != nil {
		return false, err
	}
	return true, nil
}
