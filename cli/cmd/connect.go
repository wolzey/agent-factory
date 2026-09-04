package cmd

import (
	"fmt"
	"os"

	qrterminal "github.com/mdp/qrterminal/v3"
	"github.com/spf13/cobra"
	"github.com/wolzey/agent-factory/cli/internal/config"
	"github.com/wolzey/agent-factory/cli/internal/identity"
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

	cfg, err := config.ReadForCurrentPath()
	if err != nil {
		ui.Error("Failed to read config: " + err.Error())
		return err
	}

	if err := refreshInstalledAssets(); err != nil {
		ui.Warn("Could not refresh installed hook assets: " + err.Error())
	}
	device, err := identity.LoadOrCreate()
	if err != nil {
		ui.Error("Failed to load installation identity: " + err.Error())
		return err
	}
	handoff, err := requestLoginHandoff(cmd.Context(), loginHTTPClient, cfg.ServerURL, cfg.Username, device.Secret)
	if err != nil {
		ui.Error("Could not start browser login: " + err.Error())
		return err
	}
	loginURL := buildLoginURL(cfg.ServerURL, handoff.Code)

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
	ui.Info(fmt.Sprintf("One-time URL (expires in %d seconds): %s", handoff.ExpiresIn, loginURL))
	ui.Info(fmt.Sprintf("User: %s", cfg.Username))
	fmt.Println()

	return nil
}
