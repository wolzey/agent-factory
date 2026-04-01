package cmd

import (
	"fmt"
	"net/url"
	"os"
	"strings"

	qrterminal "github.com/mdp/qrterminal/v3"
	"github.com/spf13/cobra"
	"github.com/wolzey/agent-factory/cli/internal/config"
	"github.com/wolzey/agent-factory/cli/internal/ui"
)

var connectCmd = &cobra.Command{
	Use:   "connect",
	Short: "Show a QR code to login from your phone or another device",
	Long:  "Generates a QR code containing a login URL. Scan it with your phone to open Agent Factory and auto-login.",
	RunE:  runConnect,
}

func runConnect(cmd *cobra.Command, args []string) error {
	if !config.Exists() {
		ui.Error("Agent Factory is not installed. Run 'agent-factory install' first.")
		return fmt.Errorf("not installed")
	}

	cfg, err := config.Read()
	if err != nil {
		ui.Error("Failed to read config: " + err.Error())
		return err
	}

	// Ensure we have a token
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

	// Build the login URL: http://server/#token=<token>
	serverURL := strings.TrimRight(cfg.ServerURL, "/")
	loginURL := fmt.Sprintf("%s/#token=%s", serverURL, url.QueryEscape(cfg.Token))

	fmt.Println()
	ui.Info("Scan this QR code to connect to Agent Factory:")
	fmt.Println()

	qrterminal.GenerateWithConfig(loginURL, qrterminal.Config{
		Level:     qrterminal.M,
		Writer:    os.Stdout,
		BlackChar: qrterminal.WHITE,
		WhiteChar: qrterminal.BLACK,
		QuietZone: 1,
	})

	fmt.Println()
	ui.Info(fmt.Sprintf("URL: %s", loginURL))
	ui.Info(fmt.Sprintf("User: %s", cfg.Username))
	fmt.Println()

	return nil
}
