package hooks

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMakeHookEntryUsesStringCommandForCodex(t *testing.T) {
	entry := makeHookEntry(TargetCodex, "/tmp/agent-factory-hook.sh")
	hookList, ok := entry["hooks"].([]interface{})
	if !ok || len(hookList) != 1 {
		t.Fatalf("hooks = %#v, want one hook", entry["hooks"])
	}
	hook, ok := hookList[0].(map[string]interface{})
	if !ok {
		t.Fatalf("hook = %#v, want object", hookList[0])
	}
	if command, ok := hook["command"].(string); !ok || command != "/tmp/agent-factory-hook.sh" {
		t.Fatalf("command = %#v, want string path", hook["command"])
	}
	if matcher := entry["matcher"]; matcher != "*" {
		t.Fatalf("matcher = %#v, want *", matcher)
	}
}

func TestNormalizeCodexHookCommandsMigratesLegacyAgentFactoryEntry(t *testing.T) {
	hook := map[string]interface{}{
		"type":    "command",
		"command": []interface{}{`/tmp/agent-factory-hook.sh`},
	}
	otherHook := map[string]interface{}{
		"type":    "command",
		"command": []interface{}{`/tmp/other-hook.sh`},
	}
	hooksMap := map[string]interface{}{
		"SessionStart": []interface{}{
			map[string]interface{}{
				"hooks": []interface{}{hook, otherHook},
			},
		},
	}

	normalizeCodexHookCommands(hooksMap)

	if command, ok := hook["command"].(string); !ok || command != "/tmp/agent-factory-hook.sh" {
		t.Fatalf("Agent Factory command = %#v, want string path", hook["command"])
	}
	if _, ok := otherHook["command"].([]interface{}); !ok {
		t.Fatalf("unrelated command = %#v, want original array preserved", otherHook["command"])
	}
}

func TestRegisterHooksMigratesLegacyCodexSchema(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	codexDir := filepath.Join(home, ".codex")
	if err := os.MkdirAll(codexDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(CodexConfigPath(), []byte("[features]\ncodex_hooks = true\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	legacy := `{"hooks":{"SessionStart":[{"matcher":"*","hooks":[{"type":"command","command":["/tmp/agent-factory-hook.sh"]}]}]}}`
	if err := os.WriteFile(CodexHooksPath(), []byte(legacy), 0o600); err != nil {
		t.Fatal(err)
	}

	registered, skipped, err := RegisterHooks(TargetCodex, "/tmp/agent-factory-hook.sh")
	if err != nil {
		t.Fatal(err)
	}
	if registered != 4 || skipped != 1 {
		t.Fatalf("registered, skipped = %d, %d; want 4, 1", registered, skipped)
	}

	config, err := os.ReadFile(CodexConfigPath())
	if err != nil {
		t.Fatal(err)
	}
	if string(config) != "[features]\nhooks = true\n" {
		t.Fatalf("config = %q, want canonical hooks flag", config)
	}
	settings, err := os.ReadFile(CodexHooksPath())
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(settings), `"command": [`) {
		t.Fatalf("legacy command array remains in %s", settings)
	}
	if strings.Count(string(settings), `"command": "/tmp/agent-factory-hook.sh"`) != 5 {
		t.Fatalf("Agent Factory string command count is not 5 in %s", settings)
	}
}

func TestEnableCodexHooksInToml(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "new config",
			input: "",
			want:  "[features]\nhooks = true\n",
		},
		{
			name:  "existing features section",
			input: "[features]\nexperimental = true\n\n[model]\nname = \"test\"\n",
			want:  "[features]\nhooks = true\nexperimental = true\n\n[model]\nname = \"test\"\n",
		},
		{
			name:  "deprecated alias",
			input: "[features]\ncodex_hooks = false\nexperimental = true\n",
			want:  "[features]\nhooks = true\nexperimental = true\n",
		},
		{
			name:  "duplicate canonical and alias flags",
			input: "[features]\nhooks = false\ncodex_hooks = true\n",
			want:  "[features]\nhooks = true\n",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := enableCodexHooksInToml(test.input)
			if got != test.want {
				t.Fatalf("enableCodexHooksInToml() = %q, want %q", got, test.want)
			}
			if strings.Count(got, "hooks = true") != 1 {
				t.Fatalf("hook flag count = %d, want 1 in %q", strings.Count(got, "hooks = true"), got)
			}
			if strings.Contains(got, "codex_hooks") {
				t.Fatalf("deprecated alias remains in %q", got)
			}
		})
	}
}
