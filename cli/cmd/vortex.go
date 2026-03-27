package cmd

import (
	"bytes"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/wolzey/agent-factory/cli/internal/config"
	"github.com/wolzey/agent-factory/cli/internal/ui"
)

var vortexCmd = &cobra.Command{
	Use:   "vortex",
	Short: "Trigger a massive vortex that swirls all agents for 15 seconds",
	Args:  cobra.NoArgs,
	RunE:  runVortex,
}

func runVortex(cmd *cobra.Command, args []string) error {
	if !config.Exists() {
		ui.Error("Agent Factory is not installed. Run 'agent-factory install' first.")
		return fmt.Errorf("config not found")
	}

	cfg, err := config.Read()
	if err != nil {
		ui.Error("Failed to read config: " + err.Error())
		return err
	}

	client := &http.Client{Timeout: 2 * time.Second}
	url := strings.TrimRight(cfg.ServerURL, "/") + "/api/vortex"

	resp, err := client.Post(url, "application/json", bytes.NewReader([]byte("{}")))
	if err != nil {
		ui.Error("Could not reach server at " + cfg.ServerURL)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		ui.Success("Vortex activated!")
	} else {
		ui.Error(fmt.Sprintf("Server returned %d", resp.StatusCode))
	}

	return nil
}
