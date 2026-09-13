package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/wolzey/agent-factory/cli/internal/config"
	"github.com/wolzey/agent-factory/cli/internal/designer"
	"github.com/wolzey/agent-factory/cli/internal/identity"
	"github.com/wolzey/agent-factory/cli/internal/ui"
)

var avatarCmd = &cobra.Command{
	Use:   "avatar",
	Short: "Launch the avatar designer to customize your character",
	RunE:  runAvatar,
}

func runAvatar(cmd *cobra.Command, args []string) error {
	ui.PrintBanner()

	if !config.Exists() {
		ui.Error("Agent Factory is not installed. Run 'agent-factory install' first.")
		return fmt.Errorf("config not found")
	}

	cfg, err := config.ReadBase()
	if err != nil {
		ui.Error("Failed to read config: " + err.Error())
		return err
	}

	device, identityErr := identity.LoadOrCreate()
	initial := cfg.Avatar
	revision := ""
	if identityErr == nil {
		if current, syncErr := syncAvatar(cmd.Context(), avatarHTTPClient, cfg.ServerURL, device.Secret, nil); syncErr == nil {
			revision = current.Revision
			if current.Saved {
				initial = current.Avatar
			}
		} else {
			ui.Warn("Starting from your local avatar: " + syncErr.Error())
		}
	}
	result, err := designer.Run(&initial)
	if err != nil {
		return fmt.Errorf("avatar designer error: %w", err)
	}

	if result.Cancelled {
		ui.Info("Avatar design cancelled. No changes made.")
		return nil
	}

	cfg.Avatar = result.Avatar
	if err := config.Write(cfg); err != nil {
		ui.Error("Failed to save config: " + err.Error())
		return err
	}

	fmt.Println()
	if identityErr != nil {
		ui.Warn("Avatar saved locally. Your installation identity could not be loaded, so the factory has not been updated.")
	} else if _, syncErr := syncAvatar(cmd.Context(), avatarHTTPClient, cfg.ServerURL, device.Secret, &result.Avatar, revision); syncErr != nil {
		ui.Warn("Avatar saved locally; the factory save could not be confirmed: " + syncErr.Error())
		ui.Info("Run 'agent-factory avatar' and save again when the factory is available.")
	} else {
		ui.Success("Avatar updated in the factory and saved locally!")
	}
	fmt.Println()
	return nil
}
