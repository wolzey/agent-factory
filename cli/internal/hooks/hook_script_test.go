package hooks

import (
	"bytes"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestHookScriptUsesMostSpecificRepositoryConfig(t *testing.T) {
	if _, err := exec.LookPath("jq"); err != nil {
		t.Skip("jq is required to run the Agent Factory hook")
	}

	home := t.TempDir()
	configDir := filepath.Join(home, ".config", "agent-factory")
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		t.Fatal(err)
	}

	configJSON := `{
  "username": "global-user",
  "serverUrl": "https://global.example",
  "avatar": {"spriteIndex": 0, "color": "#000000"},
  "repositories": {
    "~/work/github.com/wolzey": {
      "username": "wolzey-user"
    },
    "~/work/github.com/wolzey/agent-factory": {
      "serverUrl": "https://factory.example/"
    }
  }
}`
	if err := os.WriteFile(filepath.Join(configDir, "config.json"), []byte(configJSON), 0o644); err != nil {
		t.Fatal(err)
	}

	binDir := filepath.Join(home, "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}
	fakeCurl := `#!/bin/sh
previous=""
for argument in "$@"; do
  if [ "$previous" = "-d" ]; then
    printf '%s' "$argument" > "$CAPTURE_PAYLOAD"
  fi
  case "$argument" in
    http://*|https://*) printf '%s' "$argument" > "$CAPTURE_URL" ;;
  esac
  previous="$argument"
done
`
	if err := os.WriteFile(filepath.Join(binDir, "curl"), []byte(fakeCurl), 0o755); err != nil {
		t.Fatal(err)
	}

	hookPath := filepath.Join(home, "agent-factory-hook.sh")
	if err := os.WriteFile(hookPath, hookScript, 0o755); err != nil {
		t.Fatal(err)
	}

	payloadPath := filepath.Join(home, "payload.json")
	urlPath := filepath.Join(home, "url.txt")
	cwd := filepath.Join(home, "work", "github.com", "wolzey", "agent-factory", "cli")
	input := `{"session_id":"session-1","cwd":` + quotedJSON(cwd) + `}`

	command := exec.Command("bash", hookPath)
	command.Stdin = strings.NewReader(input)
	command.Env = append(os.Environ(),
		"HOME="+home,
		"PATH="+binDir+string(os.PathListSeparator)+os.Getenv("PATH"),
		"CAPTURE_PAYLOAD="+payloadPath,
		"CAPTURE_URL="+urlPath,
	)
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("hook script error = %v, output = %s", err, output)
	}

	waitForFile(t, payloadPath)
	payloadData, err := os.ReadFile(payloadPath)
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal(payloadData, &payload); err != nil {
		t.Fatalf("invalid captured payload: %v", err)
	}
	if payload["username"] != "wolzey-user" {
		t.Fatalf("username = %v, want wolzey-user", payload["username"])
	}

	waitForFile(t, urlPath)
	urlData, err := os.ReadFile(urlPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(urlData) != "https://factory.example/api/hooks" {
		t.Fatalf("URL = %q, want %q", urlData, "https://factory.example/api/hooks")
	}
}

func quotedJSON(value string) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}

func waitForFile(t *testing.T, path string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := os.Stat(path); err == nil {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", path)
}

func TestSyncHookScriptRepairsStaleScript(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	// Not installed: nothing to repair, and `install` is what puts it there.
	if updated, err := SyncHookScript(); err != nil || updated {
		t.Fatalf("SyncHookScript on a clean machine = (%v, %v), want (false, nil)", updated, err)
	}
	if _, err := os.Stat(HookScriptPath()); !os.IsNotExist(err) {
		t.Fatal("SyncHookScript created a hook script that was never installed")
	}

	if err := WriteHookScript(); err != nil {
		t.Fatal(err)
	}
	if updated, err := SyncHookScript(); err != nil || updated {
		t.Fatalf("SyncHookScript on a current script = (%v, %v), want (false, nil)", updated, err)
	}

	// The case this exists for: an old script left behind by an update that
	// replaced only the binary.
	stale := []byte("#!/bin/bash\n# an older hook that forwarded the raw payload\n")
	if err := os.WriteFile(HookScriptPath(), stale, 0o755); err != nil {
		t.Fatal(err)
	}
	updated, err := SyncHookScript()
	if err != nil || !updated {
		t.Fatalf("SyncHookScript on a stale script = (%v, %v), want (true, nil)", updated, err)
	}
	repaired, err := os.ReadFile(HookScriptPath())
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(repaired, hookScript) {
		t.Fatal("stale hook script was not replaced with the embedded one")
	}
}
