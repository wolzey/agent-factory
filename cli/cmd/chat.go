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

const chatMaxLength = 200

var chatCmd = &cobra.Command{
	Use:   "chat <message>",
	Short: "Send a chat message to the Agent Factory",
	Long:  "Send a short chat message that appears in the bottom-right of the Agent Factory screen.",
	Args:  cobra.ExactArgs(1),
	RunE:  runChat,
}

func runChat(cmd *cobra.Command, args []string) error {
	message := args[0]

	if len(message) > chatMaxLength {
		ui.Error(fmt.Sprintf("Message too long (%d chars). Max is %d.", len(message), chatMaxLength))
		return fmt.Errorf("message too long")
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

	payload, err := json.Marshal(map[string]string{
		"username": cfg.Username,
		"message":  message,
	})
	if err != nil {
		return err
	}

	client := &http.Client{Timeout: 2 * time.Second}
	url := strings.TrimRight(cfg.ServerURL, "/") + "/api/chat"

	resp, err := client.Post(url, "application/json", bytes.NewReader(payload))
	if err != nil {
		ui.Error("Could not reach server at " + cfg.ServerURL)
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	switch resp.StatusCode {
	case 200:
		ui.Success("Message sent!")
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
