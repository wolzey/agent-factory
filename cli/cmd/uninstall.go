package cmd

import (
	"fmt"
	"os"

	"github.com/charmbracelet/huh"
	"github.com/spf13/cobra"
	"github.com/wolzey/agent-factory/cli/internal/config"
	"github.com/wolzey/agent-factory/cli/internal/hooks"
	"github.com/wolzey/agent-factory/cli/internal/ui"
)

var flagForce bool

var uninstallCmd = &cobra.Command{
	Use:   "uninstall",
	Short: "Remove Agent Factory hooks from Claude Code",
	RunE:  runUninstall,
}

func init() {
	uninstallCmd.Flags().BoolVar(&flagForce, "force", false, "Skip confirmation prompt")
}

func runUninstall(cmd *cobra.Command, args []string) error {
	fmt.Println()
	fmt.Printf("  %s\n", ui.ErrorStyle.Render(ui.BoldStyle.Render("Agent Factory - Uninstall")))
	fmt.Println()

	hasHooks := hooks.IsInstalled()
	hasConfig := config.Exists()

	if !hasHooks && !hasConfig {
		ui.Success("Agent Factory is not installed. Nothing to do.")
		return nil
	}

	// Show what will be removed
	fmt.Println("  This will:")
	if hasHooks {
		fmt.Printf("    - Remove Agent Factory hooks from %s\n", ui.DimStyle.Render("~/.claude/settings.json"))
	}
	if hasConfig {
		fmt.Printf("    - Delete %s\n", ui.DimStyle.Render("~/.config/agent-factory/"))
	}
	fmt.Println()

	// Confirm
	if !flagForce {
		var confirm bool
		form := huh.NewForm(
			huh.NewGroup(
				huh.NewConfirm().
					Title("Continue?").
					Affirmative("Yes").
					Negative("No").
					Value(&confirm),
			),
		)
		if err := form.Run(); err != nil {
			return err
		}
		if !confirm {
			fmt.Println("  Cancelled.")
			return nil
		}
	}

	fmt.Println()

	// Remove hooks from settings.json
	if hasHooks {
		if err := hooks.UnregisterHooks(); err != nil {
			ui.Error("Failed to remove hooks: " + err.Error())
			return err
		}
		ui.Success("Removed hooks from settings.json")
	}

	// Remove config directory
	if hasConfig {
		if err := os.RemoveAll(config.ConfigDir()); err != nil {
			ui.Error("Failed to remove config: " + err.Error())
			return err
		}
		ui.Success("Removed ~/.config/agent-factory/")
	}

	// Remove backup
	backupPath := hooks.BackupPath()
	if _, err := os.Stat(backupPath); err == nil {
		os.Remove(backupPath)
		ui.Success("Removed settings backup")
	}

	fmt.Println()
	fmt.Printf("  %s Agent Factory hooks are removed.\n", ui.SuccessStyle.Render(ui.BoldStyle.Render("Uninstalled.")))
	fmt.Println(ui.DimStyle.Render("  Your Claude Code sessions will no longer send events."))
	fmt.Println()

	return nil
}
