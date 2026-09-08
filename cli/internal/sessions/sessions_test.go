package sessions

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadSkipsDeadProcessesAndUnreadableFiles(t *testing.T) {
	dir := t.TempDir()
	write := func(name, body string) {
		t.Helper()
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	write("1.json", `{"pid":1,"sessionId":"alive","cwd":"/work/alive"}`)
	write("2.json", `{"pid":2,"sessionId":"dead","cwd":"/work/dead"}`)
	write("3.json", `{"pid":3,"cwd":"/work/nameless"}`)
	write("4.json", `not json`)
	write("5.key", `{"pid":5,"sessionId":"key","cwd":"/work/key"}`)
	write("6.json", `{"pid":6,"sessionId":"alive","cwd":"/work/duplicate"}`)

	entries, err := read(dir, func(pid int) bool { return pid != 2 })
	if err != nil {
		t.Fatal(err)
	}

	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %+v", entries)
	}
	if entries[0].SessionID != "alive" || entries[0].Cwd != "/work/alive" {
		t.Errorf("unexpected entry: %+v", entries[0])
	}
}

func TestReadReportsAMissingRegistry(t *testing.T) {
	if _, err := Read(filepath.Join(t.TempDir(), "absent")); err == nil {
		t.Fatal("expected an error for a missing registry directory")
	}
}
