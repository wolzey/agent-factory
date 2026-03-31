package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/wolzey/agent-factory/cli/internal/config"
	"github.com/wolzey/agent-factory/cli/internal/designer"
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

	cfg, err := config.Read()
	if err != nil {
		ui.Error("Failed to read config: " + err.Error())
		return err
	}

	result, err := designer.Run(&cfg.Avatar)
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
	ui.Success("Avatar updated! Changes take effect on your next Claude Code/Codex session.")
	fmt.Println()
	return nil
}
