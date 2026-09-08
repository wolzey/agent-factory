package cmd

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/spf13/cobra"
	"github.com/wolzey/agent-factory/cli/internal/config"
	"github.com/wolzey/agent-factory/cli/internal/service"
	"github.com/wolzey/agent-factory/cli/internal/sessions"
	"github.com/wolzey/agent-factory/cli/internal/ui"
)

// DefaultHeartbeatInterval matches HEARTBEAT_INTERVAL_MS in shared/constants.ts.
// The server expires a reported session after three missed beats.
const DefaultHeartbeatInterval = 30 * time.Second

const heartbeatRequestTimeout = 5 * time.Second

// The server forgets a reported session 90 seconds after the last report, so an
// interval must leave room for a failed report and its retry inside that
// window: at 45s a single failure already opens a gap where the session is
// reapable. A non-positive interval would spin the reporter into a request loop.
const maxHeartbeatInterval = 30 * time.Second

// maxSessionsPerRequest matches MAX_HEARTBEAT_SESSION_IDS in shared/constants.ts.
// The server reads no more than this many ids from one request, so a machine
// with more sessions than that must split them or silently lose the remainder.
const maxSessionsPerRequest = 500

// Never follow a redirect: it would forward the installation credential to
// whatever address the response names.
var heartbeatHTTPClient = &http.Client{
	CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
}

var (
	heartbeatInterval time.Duration
	heartbeatOnce     bool
)

var heartbeatCmd = &cobra.Command{
	Use:   "heartbeat",
	Short: "Report locally running sessions so a remote server stops reaping them",
	Long: "Reports the sessions running on this machine to the Agent Factory server.\n\n" +
		"The server drops any session that goes 30 minutes without a hook event. It can\n" +
		"normally tell an idle-but-open session from a finished one by reading Claude's\n" +
		"session registry -- but that registry is on this machine, so a server hosted\n" +
		"anywhere else cannot see it and drops both. This pushes the same signal to it.\n\n" +
		"Sessions are grouped by the server their directory resolves to, so per-repository\n" +
		"server overrides keep working: a session only ever reports to its own server.",
	RunE: runHeartbeat,
}

func validateHeartbeatInterval(interval time.Duration) error {
	if interval <= 0 {
		return fmt.Errorf("--interval must be positive, got %s", interval)
	}
	if interval > maxHeartbeatInterval {
		return fmt.Errorf("--interval must be %s or less, got %s -- the server forgets a session 90s after its last report, and one failed report must still leave room for a retry", maxHeartbeatInterval, interval)
	}
	return nil
}

func runHeartbeat(cmd *cobra.Command, args []string) error {
	if err := validateHeartbeatInterval(heartbeatInterval); err != nil {
		ui.Error(err.Error())
		return err
	}

	if !config.Exists() {
		ui.Error("Agent Factory is not installed. Run 'agent-factory install' first.")
		return fmt.Errorf("not installed")
	}

	if heartbeatOnce {
		return reportOnce(true)
	}

	// A ticker rather than sleeping after each report: sleeping adds however long
	// the request took to every cycle, which quietly stretches the real interval
	// toward the server's expiry window.
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()
	for {
		if err := reportOnce(false); err != nil {
			// Keep beating: a server restart or a dropped network should not end
			// the daemon, or every session on this machine silently ages out.
			fmt.Fprintln(os.Stderr, "agent-factory: heartbeat failed: "+err.Error())
		}
		<-ticker.C
	}
}

func reportOnce(verbose bool) error {
	entries, err := sessions.Read(sessions.Dir())
	if os.IsNotExist(err) {
		// A machine with no Claude session registry (Codex only, or nothing has
		// run yet) has nothing to report and is not misconfigured.
		if verbose {
			ui.Info("No Claude session registry on this machine.")
		}
		return nil
	}
	if err != nil {
		return err
	}

	batches, err := groupBySessionServer(entries)
	if err != nil {
		// Silently reporting nothing here would let every session on this machine
		// age out with no indication that the config is the reason.
		return err
	}
	if len(batches) == 0 {
		if verbose {
			ui.Info("No running sessions to report.")
		}
		return nil
	}

	return reportBatches(batches, verbose)
}

// reportBatches posts every batch and returns the last error, if any.
func reportBatches(batches []heartbeatBatch, verbose bool) error {
	// Reported concurrently: done in sequence, one unreachable server spends its
	// whole timeout before the next is even tried, and the machine's real cadence
	// to a healthy server drifts toward the server's 90-second expiry.
	type outcome struct {
		batch   heartbeatBatch
		tracked int
		err     error
	}
	results := make([]outcome, len(batches))
	var waiting sync.WaitGroup
	for index, batch := range batches {
		waiting.Add(1)
		go func(index int, batch heartbeatBatch) {
			defer waiting.Done()
			tracked, err := postHeartbeat(batch)
			results[index] = outcome{batch: batch, tracked: tracked, err: err}
		}(index, batch)
	}
	waiting.Wait()

	// Joined rather than kept as the last one: a machine reporting to several
	// servers would otherwise hear only about whichever failed last, and an
	// unreachable server is exactly what its owner needs to be told about.
	var failures []error
	for _, result := range results {
		if result.err != nil {
			failures = append(failures, fmt.Errorf("%s: %w", result.batch.ServerURL, result.err))
			continue
		}
		// The server answers with what it is actually holding. A refused report
		// leaves sessions unprotected, so it fails the command rather than
		// printing a warning that a service health check would never see.
		if result.tracked < len(result.batch.SessionIDs) {
			failures = append(failures, fmt.Errorf("%s: sent %d session(s), server is holding %d",
				result.batch.ServerURL, len(result.batch.SessionIDs), result.tracked))
			continue
		}
		if verbose {
			ui.Info(fmt.Sprintf("%s: reported %d session(s)", result.batch.ServerURL, result.tracked))
		}
	}
	for _, failure := range failures {
		ui.Warn(failure.Error())
	}
	return errors.Join(failures...)
}

// heartbeatBatch is the set of sessions that report to one server.
type heartbeatBatch struct {
	ServerURL  string
	Username   string
	SessionIDs []string
}

// groupBySessionServer resolves each session's own directory through the config,
// so a session in a repository with a server override is reported to that server
// and to no other.
func groupBySessionServer(entries []sessions.Entry) ([]heartbeatBatch, error) {
	byServer := make(map[string]*heartbeatBatch)
	for _, entry := range entries {
		if entry.Cwd == "" {
			continue
		}

		cfg, err := config.ReadForPath(entry.Cwd)
		if err != nil {
			// An unreadable or malformed config affects every session on this
			// machine, so it is reported rather than dropping them one by one.
			return nil, err
		}
		if cfg.ServerURL == "" {
			continue
		}

		batch, ok := byServer[cfg.ServerURL]
		if !ok {
			batch = &heartbeatBatch{ServerURL: cfg.ServerURL, Username: cfg.Username}
			byServer[cfg.ServerURL] = batch
		}
		batch.SessionIDs = append(batch.SessionIDs, entry.SessionID)
	}

	batches := make([]heartbeatBatch, 0, len(byServer))
	for _, batch := range byServer {
		sort.Strings(batch.SessionIDs)
		// Split rather than truncate: the server reads a bounded number of ids
		// per request, and a session past that bound would be refused on every
		// cycle and reaped while it is still running.
		for start := 0; start < len(batch.SessionIDs); start += maxSessionsPerRequest {
			end := start + maxSessionsPerRequest
			if end > len(batch.SessionIDs) {
				end = len(batch.SessionIDs)
			}
			batches = append(batches, heartbeatBatch{
				ServerURL:  batch.ServerURL,
				Username:   batch.Username,
				SessionIDs: batch.SessionIDs[start:end],
			})
		}
	}
	sort.Slice(batches, func(i, j int) bool { return batches[i].ServerURL < batches[j].ServerURL })
	return batches, nil
}

// heartbeatEndpoint validates a server address before anything is sent to it.
//
// The report carries this installation's credential, so the address is checked
// here rather than trusting the far end to refuse it: a server that rejects a
// plaintext request rejects it after the bearer token has already crossed the
// wire.
func heartbeatEndpoint(serverURL string) (string, error) {
	endpoint, err := url.Parse(strings.TrimRight(serverURL, "/") + "/api/registry/heartbeat")
	if err != nil || endpoint.Host == "" || endpoint.User != nil || endpoint.RawQuery != "" || endpoint.Fragment != "" {
		return "", fmt.Errorf("invalid factory server address")
	}
	ip := net.ParseIP(endpoint.Hostname())
	local := endpoint.Hostname() == "localhost" || ip != nil && ip.IsLoopback()
	if endpoint.Scheme != "https" && !(endpoint.Scheme == "http" && local) {
		return "", fmt.Errorf("use an HTTPS factory address to report sessions")
	}
	return endpoint.String(), nil
}

// postHeartbeat reports one batch and returns how many sessions the server says
// it is holding.
func postHeartbeat(batch heartbeatBatch) (int, error) {
	endpoint, err := heartbeatEndpoint(batch.ServerURL)
	if err != nil {
		return 0, err
	}

	body, err := json.Marshal(map[string]any{
		"session_ids": batch.SessionIDs,
		"username":    batch.Username,
	})
	if err != nil {
		return 0, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), heartbeatRequestTimeout)
	defer cancel()

	// Authenticated like the hook script is, so this machine's sessions are held
	// open by this installation and no other.
	request, err := newAuthenticatedJSONRequest(ctx, http.MethodPost, endpoint, body)
	if err != nil {
		return 0, err
	}

	response, err := heartbeatHTTPClient.Do(request)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return 0, fmt.Errorf("server returned %d", response.StatusCode)
	}

	var result struct {
		Tracked int `json:"tracked"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return 0, err
	}
	return result.Tracked, nil
}

func init() {
	heartbeatCmd.Flags().BoolVar(&heartbeatOnce, "once", false, "report a single time and exit")
	heartbeatCmd.PersistentFlags().DurationVar(&heartbeatInterval, "interval", DefaultHeartbeatInterval, "how often to report")
	heartbeatCmd.AddCommand(heartbeatInstallCmd)
	heartbeatCmd.AddCommand(heartbeatUninstallCmd)
}

var heartbeatInstallCmd = &cobra.Command{
	Use:   "install",
	Short: "Run the heartbeat in the background (launchd on macOS, systemd --user on Linux)",
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := validateHeartbeatInterval(heartbeatInterval); err != nil {
			ui.Error(err.Error())
			return err
		}

		// Checked here as well as in the reporter: installing first would hand
		// launchd a service that exits immediately and is restarted forever.
		if !config.Exists() {
			ui.Error("Agent Factory is not installed. Run 'agent-factory install' first.")
			return fmt.Errorf("not installed")
		}

		binaryPath, err := os.Executable()
		if err != nil {
			return err
		}

		path, err := service.Install(binaryPath, heartbeatInterval, config.ConfigDir())
		if err != nil {
			ui.Error("Could not install the heartbeat service: " + err.Error())
			return err
		}

		ui.Success("Heartbeat service installed: " + path)
		ui.Info(fmt.Sprintf("Reporting every %s. Remove it with 'agent-factory heartbeat uninstall'.", heartbeatInterval))
		return nil
	},
}

var heartbeatUninstallCmd = &cobra.Command{
	Use:   "uninstall",
	Short: "Stop and remove the background heartbeat service",
	RunE: func(cmd *cobra.Command, args []string) error {
		path, err := service.Uninstall()
		if err != nil {
			ui.Error("Could not remove the heartbeat service: " + err.Error())
			return err
		}

		ui.Success("Heartbeat service removed: " + path)
		return nil
	},
}
