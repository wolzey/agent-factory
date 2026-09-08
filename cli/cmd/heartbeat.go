package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sort"
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
// interval at or past that guarantees gaps where sessions are reapable. A
// non-positive one would spin the reporter into a request loop.
const maxHeartbeatInterval = 45 * time.Second

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
		return fmt.Errorf("--interval must be %s or less, got %s -- the server forgets a session 90s after its last report", maxHeartbeatInterval, interval)
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

	for {
		if err := reportOnce(false); err != nil {
			// Keep beating: a server restart or a dropped network should not end
			// the daemon, or every session on this machine silently ages out.
			fmt.Fprintln(os.Stderr, "agent-factory: heartbeat failed: "+err.Error())
		}
		time.Sleep(heartbeatInterval)
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

	var lastErr error
	for _, batch := range batches {
		tracked, err := postHeartbeat(batch)
		if err != nil {
			lastErr = err
			if verbose {
				ui.Warn(fmt.Sprintf("%s: %s", batch.ServerURL, err.Error()))
			}
			continue
		}
		// The server answers with what it is actually holding. Reporting what was
		// sent instead would call a full registry a success.
		if tracked < len(batch.SessionIDs) {
			ui.Warn(fmt.Sprintf("%s: sent %d session(s), server is holding %d", batch.ServerURL, len(batch.SessionIDs), tracked))
			continue
		}
		if verbose {
			ui.Info(fmt.Sprintf("%s: reported %d session(s)", batch.ServerURL, tracked))
		}
	}
	return lastErr
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
		batches = append(batches, *batch)
	}
	sort.Slice(batches, func(i, j int) bool { return batches[i].ServerURL < batches[j].ServerURL })
	return batches, nil
}

// postHeartbeat reports one batch and returns how many sessions the server says
// it is holding.
func postHeartbeat(batch heartbeatBatch) (int, error) {
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
	request, err := newAuthenticatedJSONRequest(ctx, http.MethodPost, batch.ServerURL+"/api/registry/heartbeat", body)
	if err != nil {
		return 0, err
	}

	response, err := http.DefaultClient.Do(request)
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
