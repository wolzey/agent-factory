package cmd

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/wolzey/agent-factory/cli/internal/identity"
	"github.com/wolzey/agent-factory/cli/internal/sessions"
)

func writeConfig(t *testing.T, body string) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)

	dir := filepath.Join(home, ".config", "agent-factory")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestGroupBySessionServerUsesEachSessionsOwnRepositoryOverride(t *testing.T) {
	writeConfig(t, `{
	  "username": "jake",
	  "serverUrl": "http://localhost:4242",
	  "repositories": {
	    "~/projects": { "serverUrl": "https://team.example.com" },
	    "~/projects/private": { "serverUrl": "http://127.0.0.1:9", "username": "anon" }
	  }
	}`)
	home := os.Getenv("HOME")

	batches, err := groupBySessionServer([]sessions.Entry{
		{SessionID: "b", Cwd: filepath.Join(home, "projects", "work")},
		{SessionID: "a", Cwd: filepath.Join(home, "projects", "other")},
		{SessionID: "c", Cwd: filepath.Join(home, "projects", "private", "repo")},
		{SessionID: "d", Cwd: filepath.Join(home, "elsewhere")},
	})
	if err != nil {
		t.Fatal(err)
	}

	if len(batches) != 3 {
		t.Fatalf("expected 3 batches, got %d: %+v", len(batches), batches)
	}

	if batches[0].ServerURL != "http://127.0.0.1:9" {
		t.Errorf("expected the private override first, got %q", batches[0].ServerURL)
	}
	if batches[0].Username != "anon" {
		t.Errorf("expected the override username, got %q", batches[0].Username)
	}
	if len(batches[0].SessionIDs) != 1 || batches[0].SessionIDs[0] != "c" {
		t.Errorf("expected only session c on the private server, got %v", batches[0].SessionIDs)
	}

	if batches[1].ServerURL != "http://localhost:4242" {
		t.Errorf("expected the base server for ~/elsewhere, got %q", batches[1].ServerURL)
	}
	if len(batches[1].SessionIDs) != 1 || batches[1].SessionIDs[0] != "d" {
		t.Errorf("expected only session d on the base server, got %v", batches[1].SessionIDs)
	}

	if batches[2].ServerURL != "https://team.example.com" {
		t.Errorf("expected the team server, got %q", batches[2].ServerURL)
	}
	if len(batches[2].SessionIDs) != 2 || batches[2].SessionIDs[0] != "a" || batches[2].SessionIDs[1] != "b" {
		t.Errorf("expected sessions a and b on the team server, got %v", batches[2].SessionIDs)
	}
}

func TestGroupBySessionServerSkipsSessionsWithoutADirectory(t *testing.T) {
	writeConfig(t, `{"username": "jake", "serverUrl": "http://localhost:4242"}`)

	batches, err := groupBySessionServer([]sessions.Entry{{SessionID: "a", Cwd: ""}})
	if err != nil {
		t.Fatal(err)
	}

	if len(batches) != 0 {
		t.Fatalf("expected no batches, got %+v", batches)
	}
}

func TestGroupBySessionServerReportsAnUnreadableConfig(t *testing.T) {
	writeConfig(t, `{ this is not json`)

	// Dropping the sessions instead would let every one of them age out of the
	// world with the daemon reporting success.
	if _, err := groupBySessionServer([]sessions.Entry{{SessionID: "a", Cwd: os.Getenv("HOME")}}); err == nil {
		t.Fatal("expected an error for a malformed config")
	}
}

func TestValidateHeartbeatIntervalRejectsSpinAndGaps(t *testing.T) {
	for _, interval := range []time.Duration{0, -5 * time.Second, 90 * time.Second} {
		if err := validateHeartbeatInterval(interval); err == nil {
			t.Errorf("interval %s was accepted", interval)
		}
	}
	if err := validateHeartbeatInterval(DefaultHeartbeatInterval); err != nil {
		t.Errorf("the default interval was rejected: %v", err)
	}
}

func TestPostHeartbeatSendsTheSessionIdsWithAnInstallationCredential(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	var authorization string
	var body struct {
		SessionIDs []string `json:"session_ids"`
		Username   string   `json:"username"`
	}
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/api/registry/heartbeat" {
			t.Errorf("path = %q", request.URL.Path)
		}
		authorization = request.Header.Get("Authorization")
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		_, _ = response.Write([]byte(`{"ok":true,"tracked":2}`))
	}))
	defer server.Close()

	tracked, err := postHeartbeat(heartbeatBatch{ServerURL: server.URL, Username: "jake", SessionIDs: []string{"a", "b"}})
	if err != nil {
		t.Fatal(err)
	}
	if tracked != 2 {
		t.Errorf("tracked = %d, want the count the server reported", tracked)
	}

	device, deviceErr := identity.LoadOrCreate()
	if deviceErr != nil {
		t.Fatal(deviceErr)
	}
	if authorization != "Bearer "+device.Secret {
		t.Errorf("authorization = %q, want the installation credential", authorization)
	}
	if len(body.SessionIDs) != 2 || body.SessionIDs[0] != "a" || body.SessionIDs[1] != "b" {
		t.Errorf("session_ids = %v", body.SessionIDs)
	}
	if body.Username != "jake" {
		t.Errorf("username = %q", body.Username)
	}
}

func TestPostHeartbeatReportsANonSuccessStatus(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()

	_, err := postHeartbeat(heartbeatBatch{ServerURL: server.URL, SessionIDs: []string{"a"}})
	if err == nil {
		t.Fatal("expected an error for a 401")
	}
}
