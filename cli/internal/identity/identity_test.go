package identity

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadOrCreatePersistsSecureIdentity(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	first, err := LoadOrCreate()
	if err != nil {
		t.Fatal(err)
	}
	second, err := LoadOrCreate()
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Fatalf("identity changed: first = %#v, second = %#v", first, second)
	}

	info, err := os.Stat(Path())
	if err != nil {
		t.Fatal(err)
	}
	if permission := info.Mode().Perm(); permission != 0o600 {
		t.Fatalf("identity permissions = %o, want 600", permission)
	}
}

func TestLoadRejectsMalformedIdentity(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	if err := os.MkdirAll(filepath.Dir(Path()), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(Path(), []byte(`{"version":1,"secret":"not-a-device-secret"}`), 0o600); err != nil {
		t.Fatal(err)
	}

	if _, err := Load(); err == nil {
		t.Fatal("Load() succeeded for a malformed identity")
	}
}

func TestDeletePreservesMissingIdentity(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	if err := Delete(); err != nil {
		t.Fatalf("Delete() error = %v", err)
	}
}
