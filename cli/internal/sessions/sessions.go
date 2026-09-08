// Package sessions reads Claude Code's local session registry -- the same
// ~/.claude/sessions files the server watches when it happens to run on the
// machine the agents run on.
package sessions

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

// Entry is the part of a registry file this CLI uses.
type Entry struct {
	PID       int    `json:"pid"`
	SessionID string `json:"sessionId"`
	Cwd       string `json:"cwd"`
}

// Dir returns the session registry directory.
func Dir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".claude", "sessions")
}

// Read returns every live session in dir.
//
// A registry file whose process is gone is skipped: reporting it would hold a
// dead agent on screen forever, which is worse than the reaping this fixes.
// The check is pid existence only -- an entry with no pid cannot be checked at
// all, and a pid reused by an unrelated process would keep its stale entry
// reported for as long as that process runs. Claude removes a session file when
// the session ends, so both are recovery paths for a file it did not get to
// remove, not the normal case.
func Read(dir string) ([]Entry, error) {
	return read(dir, processAlive)
}

func read(dir string, alive func(pid int) bool) ([]Entry, error) {
	files, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	entries := make([]Entry, 0, len(files))
	seen := make(map[string]bool, len(files))
	for _, file := range files {
		if file.IsDir() || !strings.HasSuffix(file.Name(), ".json") {
			continue
		}

		data, err := os.ReadFile(filepath.Join(dir, file.Name()))
		if err != nil {
			continue // a session file can be rewritten while we read the directory
		}

		var entry Entry
		if err := json.Unmarshal(data, &entry); err != nil {
			continue
		}
		if entry.SessionID == "" || seen[entry.SessionID] {
			continue
		}
		if entry.PID > 0 && !alive(entry.PID) {
			continue
		}

		seen[entry.SessionID] = true
		entries = append(entries, entry)
	}
	return entries, nil
}

func processAlive(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	// Signal 0 checks for existence without delivering anything.
	return process.Signal(syscall.Signal(0)) == nil
}
