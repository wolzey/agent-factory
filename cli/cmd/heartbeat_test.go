package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/wolzey/agent-factory/cli/internal/identity"
	"github.com/wolzey/agent-factory/cli/internal/service"
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
	for _, interval := range []time.Duration{0, -5 * time.Second, 45 * time.Second, 90 * time.Second} {
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

func TestReportOnceContactsEveryServerConcurrently(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	// Both handlers block until both requests have arrived. Serialized reporting
	// deadlocks until the request timeout, which is the regression this guards:
	// one slow server must not delay another server's heartbeat toward expiry.
	arrived := make(chan struct{}, 2)
	release := make(chan struct{})
	handler := http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		arrived <- struct{}{}
		<-release
		_, _ = response.Write([]byte(`{"ok":true,"tracked":1}`))
	})
	first := httptest.NewServer(handler)
	defer first.Close()
	second := httptest.NewServer(handler)
	defer second.Close()

	serialized := make(chan bool, 1)
	go func() {
		for range 2 {
			select {
			case <-arrived:
			case <-time.After(4 * time.Second):
				// Only one request ever arrived: the second is waiting for the
				// first to finish, which is the regression this test exists for.
				serialized <- true
				close(release)
				return
			}
		}
		serialized <- false
		close(release)
	}()

	batches := []heartbeatBatch{
		{ServerURL: first.URL, SessionIDs: []string{"a"}},
		{ServerURL: second.URL, SessionIDs: []string{"b"}},
	}
	if err := reportBatches(batches, false); err != nil {
		t.Fatal(err)
	}
	// A scheduling pause on a loaded machine must not read as serialization, so
	// the assertion is on what the watchdog saw rather than on elapsed time.
	if <-serialized {
		t.Error("the second server was not contacted until the first request finished")
	}
}

func TestHeartbeatInstallRefusesBeforeAgentFactoryIsInstalled(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	// Installing first would hand launchd a service that exits immediately and
	// is restarted forever.
	if err := heartbeatInstallCmd.RunE(heartbeatInstallCmd, nil); err == nil {
		t.Fatal("expected heartbeat install to refuse without a config")
	}

	path, err := service.Path()
	if err != nil {
		t.Skipf("no background service on this platform: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Errorf("a service definition was written to %s", path)
	}
}

func TestGroupBySessionServerSplitsBatchesTheServerWouldTruncate(t *testing.T) {
	writeConfig(t, `{"username": "jake", "serverUrl": "http://localhost:4242"}`)
	home := os.Getenv("HOME")

	entries := make([]sessions.Entry, 0, maxSessionsPerRequest+1)
	for index := range maxSessionsPerRequest + 1 {
		entries = append(entries, sessions.Entry{SessionID: fmt.Sprintf("session-%04d", index), Cwd: home})
	}

	batches, err := groupBySessionServer(entries)
	if err != nil {
		t.Fatal(err)
	}

	// The server reads only the first 500 ids of a request; a 501st session must
	// travel in its own batch rather than being dropped every cycle.
	if len(batches) != 2 {
		t.Fatalf("expected 2 batches, got %d", len(batches))
	}
	if len(batches[0].SessionIDs) != maxSessionsPerRequest || len(batches[1].SessionIDs) != 1 {
		t.Errorf("batch sizes = %d, %d", len(batches[0].SessionIDs), len(batches[1].SessionIDs))
	}
}

func TestHeartbeatEndpointRefusesAddressesTheCredentialCannotCross(t *testing.T) {
	for _, allowed := range []string{"https://factory.example", "http://localhost:4242", "http://127.0.0.1:4242", "http://[::1]:4242"} {
		if _, err := heartbeatEndpoint(allowed); err != nil {
			t.Errorf("%s was refused: %v", allowed, err)
		}
	}

	// The report carries a bearer credential, so a plaintext address must fail
	// before anything is sent -- a server that rejects the request rejects it
	// after the token has already crossed the wire.
	for _, refused := range []string{"http://factory.example", "ftp://factory.example", "https://user:pw@factory.example",
		"https://factory.example/?redirect=elsewhere", "https://factory.example/#fragment", "https://"} {
		if _, err := heartbeatEndpoint(refused); err == nil {
			t.Errorf("%s was accepted", refused)
		}
	}
}

func TestPostHeartbeatSendsNothingToAPlaintextAddress(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	var reached bool
	server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) { reached = true }))
	defer server.Close()
	plaintext := strings.Replace(server.URL, "127.0.0.1", "factory.example", 1)

	if _, err := postHeartbeat(heartbeatBatch{ServerURL: plaintext, SessionIDs: []string{"a"}}); err == nil {
		t.Fatal("expected a plaintext address to be refused")
	}
	if reached {
		t.Error("a request was sent to a plaintext address")
	}
}

func TestReportBatchesKeepsEveryFailure(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	short := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		_, _ = response.Write([]byte(`{"ok":true,"tracked":0}`))
	}))
	defer short.Close()
	unreachable := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {}))
	unreachableURL := unreachable.URL
	unreachable.Close()

	err := reportBatches([]heartbeatBatch{
		{ServerURL: unreachableURL, SessionIDs: []string{"a"}},
		{ServerURL: short.URL, SessionIDs: []string{"b"}},
	}, false)
	if err == nil {
		t.Fatal("expected an error")
	}

	// Keeping only the last failure would hide an unreachable server behind a
	// later server's refusal.
	message := err.Error()
	if !strings.Contains(message, unreachableURL) {
		t.Errorf("the unreachable server is missing from %q", message)
	}
	if !strings.Contains(message, short.URL) {
		t.Errorf("the refusing server is missing from %q", message)
	}
}
