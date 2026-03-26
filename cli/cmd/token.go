package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/spf13/cobra"
	"github.com/wolzey/agent-factory/cli/internal/config"
	"github.com/wolzey/agent-factory/cli/internal/ui"
)

var tokenCmd = &cobra.Command{
	Use:   "token",
	Short: "Display your Agent Factory auth token for browser login",
	RunE:  runToken,
}

func runToken(cmd *cobra.Command, args []string) error {
	if !config.Exists() {
		ui.Error("Agent Factory is not installed. Run 'agent-factory install' first.")
		return fmt.Errorf("not installed")
	}

	cfg, err := config.Read()
	if err != nil {
		ui.Error("Failed to read config: " + err.Error())
		return err
	}

	if cfg.Token == "" {
		token, err := fetchToken(cfg.ServerURL, cfg.Username)
		if err != nil {
			ui.Error("Could not fetch token from server: " + err.Error())
			ui.Info("Make sure the Agent Factory server is running at " + cfg.ServerURL)
			return err
		}
		cfg.Token = token
		if writeErr := config.Write(cfg); writeErr != nil {
			ui.Warn("Could not save token to config: " + writeErr.Error())
		}
	}

	fmt.Println(cfg.Token)
	return nil
}

func fetchToken(serverURL, username string) (string, error) {
	tokenURL := fmt.Sprintf("%s/api/auth/token?username=%s", serverURL, url.QueryEscape(username))

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(tokenURL)
	if err != nil {
		return "", fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("server returned %d", resp.StatusCode)
	}

	var result struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("invalid response: %w", err)
	}

	if result.Token == "" {
		return "", fmt.Errorf("empty token in response")
	}

	return result.Token, nil
}
