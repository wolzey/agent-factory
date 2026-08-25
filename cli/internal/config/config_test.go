package config

import (
	"os"
	"path/filepath"
	"testing"
)

func stringPointer(value string) *string {
	return &value
}

func TestResolveForPathMergesRepositoryPrefixes(t *testing.T) {
	home := filepath.Join(string(filepath.Separator), "home", "test-user")
	cfg := UserConfig{
		Username:  "global-user",
		ServerURL: "https://global.example/",
		Token:     "global-token",
		Repositories: map[string]RepositoryConfig{
			"~/work/github.com/wolzey": {
				Username: stringPointer("wolzey-user"),
			},
			"~/work/github.com/wolzey/agent-factory": {
				ServerURL: stringPointer("https://factory.example/"),
				Token:     stringPointer("factory-token"),
			},
		},
	}

	resolved := resolveForPath(cfg, filepath.Join(home, "work", "github.com", "wolzey", "agent-factory", "cli"), home)

	if resolved.Username != "wolzey-user" {
		t.Fatalf("Username = %q, want %q", resolved.Username, "wolzey-user")
	}
	if resolved.ServerURL != "https://factory.example" {
		t.Fatalf("ServerURL = %q, want %q", resolved.ServerURL, "https://factory.example")
	}
	if resolved.Token != "factory-token" {
		t.Fatalf("Token = %q, want %q", resolved.Token, "factory-token")
	}
}

func TestResolveForPathDoesNotMatchSiblingPrefix(t *testing.T) {
	home := filepath.Join(string(filepath.Separator), "home", "test-user")
	cfg := UserConfig{
		Username:  "global-user",
		ServerURL: "https://global.example",
		Token:     "global-token",
		Repositories: map[string]RepositoryConfig{
			"~/work/github.com/wolzey": {
				Username: stringPointer("wolzey-user"),
			},
		},
	}

	resolved := resolveForPath(cfg, filepath.Join(home, "work", "github.com", "wolzey-other", "repo"), home)

	if resolved.Username != "global-user" {
		t.Fatalf("Username = %q, want global config", resolved.Username)
	}
	if resolved.Token != "global-token" {
		t.Fatalf("Token = %q, want global token", resolved.Token)
	}
}

func TestResolveForPathClearsInheritedTokenWhenIdentityChanges(t *testing.T) {
	home := t.TempDir()
	cfg := UserConfig{
		Username:  "global-user",
		ServerURL: "https://global.example",
		Token:     "global-token",
		Repositories: map[string]RepositoryConfig{
			filepath.Join(home, "work"): {
				Username: stringPointer("work-user"),
			},
		},
	}

	resolved := resolveForPath(cfg, filepath.Join(home, "work", "repo"), home)

	if resolved.Token != "" {
		t.Fatalf("Token = %q, want empty token after identity override", resolved.Token)
	}
}

func TestResolveForPathKeepsTokenWhenNormalizedIdentityIsUnchanged(t *testing.T) {
	home := t.TempDir()
	cfg := UserConfig{
		Username:  "global-user",
		ServerURL: "https://global.example/",
		Token:     "global-token",
		Repositories: map[string]RepositoryConfig{
			filepath.Join(home, "work"): {
				ServerURL: stringPointer("https://global.example"),
			},
		},
	}

	resolved := resolveForPath(cfg, filepath.Join(home, "work", "repo"), home)

	if resolved.Token != "global-token" {
		t.Fatalf("Token = %q, want unchanged token", resolved.Token)
	}
}

func TestReadForPathSupportsConfigWithoutRepositories(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	if err := os.MkdirAll(ConfigDir(), 0o755); err != nil {
		t.Fatal(err)
	}
	legacyConfig := `{
  "username": "legacy-user",
  "serverUrl": "https://legacy.example/",
  "token": "legacy-token",
  "avatar": {
    "spriteIndex": 0,
    "color": "#4a90d9",
    "hat": null,
    "trail": null
  }
}`
	if err := os.WriteFile(ConfigPath(), []byte(legacyConfig), 0o644); err != nil {
		t.Fatal(err)
	}

	resolved, err := ReadForPath(filepath.Join(home, "work", "repo"))
	if err != nil {
		t.Fatalf("ReadForPath() error = %v", err)
	}
	if resolved.Username != "legacy-user" || resolved.ServerURL != "https://legacy.example" || resolved.Token != "legacy-token" {
		t.Fatalf("ReadForPath() = %#v, want unchanged legacy values", resolved)
	}
}

func TestReadKeepsBaseAndCurrentPathResolutionExplicit(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	repositoryPath := filepath.Join(home, "work", "repo")
	if err := os.MkdirAll(repositoryPath, 0o755); err != nil {
		t.Fatal(err)
	}

	originalDirectory, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(repositoryPath); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(originalDirectory) })
	currentDirectory, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}

	cfg := UserConfig{
		Username:  "global-user",
		ServerURL: "https://global.example",
		Repositories: map[string]RepositoryConfig{
			currentDirectory: {
				Username: stringPointer("repo-user"),
			},
		},
	}
	if err := Write(cfg); err != nil {
		t.Fatalf("Write() error = %v", err)
	}

	base, err := Read()
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}
	if base.Username != "global-user" {
		t.Fatalf("Read().Username = %q, want global-user", base.Username)
	}

	resolved, err := ReadForCurrentPath()
	if err != nil {
		t.Fatalf("ReadForCurrentPath() error = %v", err)
	}
	if resolved.Username != "repo-user" {
		t.Fatalf("ReadForCurrentPath().Username = %q, want repo-user", resolved.Username)
	}
}

func TestWriteTokenForPathStoresTokenOnMostSpecificPrefix(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	broadPath := filepath.Join(home, "work")
	specificPath := filepath.Join(broadPath, "repo")
	cfg := UserConfig{
		Username:  "global-user",
		ServerURL: "https://global.example",
		Token:     "global-token",
		Repositories: map[string]RepositoryConfig{
			broadPath: {
				Username: stringPointer("work-user"),
			},
			specificPath: {
				ServerURL: stringPointer("https://repo.example"),
			},
		},
	}
	if err := Write(cfg); err != nil {
		t.Fatalf("Write() error = %v", err)
	}

	if err := WriteTokenForPath(filepath.Join(specificPath, "nested"), "repo-token"); err != nil {
		t.Fatalf("WriteTokenForPath() error = %v", err)
	}

	stored, err := ReadBase()
	if err != nil {
		t.Fatalf("ReadBase() error = %v", err)
	}
	if stored.Token != "global-token" {
		t.Fatalf("global Token = %q, want unchanged", stored.Token)
	}
	if stored.Repositories[broadPath].Token != nil {
		t.Fatal("broad repository token was unexpectedly changed")
	}
	storedToken := stored.Repositories[specificPath].Token
	if storedToken == nil || *storedToken != "repo-token" {
		t.Fatalf("specific repository Token = %v, want repo-token", storedToken)
	}
}
