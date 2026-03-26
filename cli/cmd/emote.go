package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/wolzey/agent-factory/cli/internal/config"
	"github.com/wolzey/agent-factory/cli/internal/ui"
)

var validEmotes = []string{"dance", "jump", "guitar", "gun", "laugh", "wave", "sleep", "explode", "dizzy", "flex", "rage", "fart"}

var emoteCmd = &cobra.Command{
	Use:   "emote <name>",
	Short: "Trigger an emote on your active agent",
	Long:  fmt.Sprintf("Trigger an emote animation on your active agent.\n\nAvailable emotes: %s", strings.Join(validEmotes, ", ")),
	Args:  cobra.ExactArgs(1),
	RunE:  runEmote,
}

func runEmote(cmd *cobra.Command, args []string) error {
	emote := strings.ToLower(args[0])

	// Validate emote name
	valid := false
	for _, e := range validEmotes {
		if e == emote {
			valid = true
			break
		}
	}
	if !valid {
		ui.Error(fmt.Sprintf("Unknown emote: %s", emote))
		ui.Info(fmt.Sprintf("Available emotes: %s", strings.Join(validEmotes, ", ")))
		return fmt.Errorf("invalid emote: %s", emote)
	}

	if !config.Exists() {
		ui.Error("Agent Factory is not installed. Run 'agent-factory install' first.")
		return fmt.Errorf("config not found")
	}

	cfg, err := config.Read()
	if err != nil {
		ui.Error("Failed to read config: " + err.Error())
		return err
	}

	// Build payload
	payload, err := json.Marshal(map[string]string{
		"username": cfg.Username,
		"emote":    emote,
	})
	if err != nil {
		return err
	}

	// POST to server
	client := &http.Client{Timeout: 2 * time.Second}
	url := strings.TrimRight(cfg.ServerURL, "/") + "/api/emote"

	resp, err := client.Post(url, "application/json", bytes.NewReader(payload))
	if err != nil {
		ui.Error("Could not reach server at " + cfg.ServerURL)
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	switch resp.StatusCode {
	case 200:
		ui.Success(fmt.Sprintf("Emote '%s' sent!", emote))
	case 404:
		ui.Warn("No active session found. Start a Claude Code session first.")
	default:
		var result map[string]string
		if json.Unmarshal(body, &result) == nil {
			ui.Error(fmt.Sprintf("Server error: %s", result["error"]))
		} else {
			ui.Error(fmt.Sprintf("Server returned %d", resp.StatusCode))
		}
	}

	return nil
}
