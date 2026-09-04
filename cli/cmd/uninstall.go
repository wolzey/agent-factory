package cmd

import (
	"fmt"
	"os"

	"github.com/charmbracelet/huh"
	"github.com/spf13/cobra"
	"github.com/wolzey/agent-factory/cli/internal/config"
	"github.com/wolzey/agent-factory/cli/internal/hooks"
	"github.com/wolzey/agent-factory/cli/internal/identity"
	"github.com/wolzey/agent-factory/cli/internal/ui"
)

var (
	flagForce         bool
	flagPurgeIdentity bool
)

var uninstallCmd = &cobra.Command{
	Use:   "uninstall",
	Short: "Remove Agent Factory hooks from Claude/Codex",
	RunE:  runUninstall,
}

func init() {
	uninstallCmd.Flags().BoolVar(&flagForce, "force", false, "Skip confirmation prompt")
	uninstallCmd.Flags().BoolVar(&flagPurgeIdentity, "purge-identity", false, "Also delete the persistent installation identity")
}

func runUninstall(cmd *cobra.Command, args []string) error {
	fmt.Println()
	fmt.Printf("  %s\n", ui.ErrorStyle.Render(ui.BoldStyle.Render("Agent Factory - Uninstall")))
	fmt.Println()

	installedTargets := hooks.InstalledTargets()
	hasHooks := len(installedTargets) > 0
	hasConfig := config.Exists()
	hasIdentity := identity.Exists()

	if !hasHooks && !hasConfig && !(flagPurgeIdentity && hasIdentity) {
		ui.Success("Agent Factory is not installed. Nothing to do.")
		return nil
	}

	// Show what will be removed
	fmt.Println("  This will:")
	for _, target := range installedTargets {
		switch target {
		case hooks.TargetClaude:
			fmt.Printf("    - Remove Agent Factory hooks from %s\n", ui.DimStyle.Render("~/.claude/settings.json"))
		case hooks.TargetCodex:
			fmt.Printf("    - Remove Agent Factory hooks from %s\n", ui.DimStyle.Render("~/.codex/hooks.json"))
		}
	}
	if hasConfig {
		fmt.Printf("    - Delete %s\n", ui.DimStyle.Render("~/.config/agent-factory/config.json and hooks/"))
	}
	if hasIdentity {
		if flagPurgeIdentity {
			fmt.Printf("    - Delete %s\n", ui.DimStyle.Render("~/.config/agent-factory/identity.json"))
		} else {
			fmt.Printf("    - Preserve %s\n", ui.DimStyle.Render("~/.config/agent-factory/identity.json"))
		}
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
	for _, target := range installedTargets {
		if err := hooks.UnregisterHooks(target); err != nil {
			ui.Error(fmt.Sprintf("Failed to remove %s hooks: %v", target, err))
			return err
		}
		switch target {
		case hooks.TargetClaude:
			ui.Success("Removed hooks from ~/.claude/settings.json")
		case hooks.TargetCodex:
			ui.Success("Removed hooks from ~/.codex/hooks.json")
		}
	}

	// Remove mutable config and generated hooks while preserving installation identity by default.
	if hasConfig {
		if err := os.Remove(config.ConfigPath()); err != nil && !os.IsNotExist(err) {
			ui.Error("Failed to remove config: " + err.Error())
			return err
		}
		if err := os.RemoveAll(hooks.HooksDir()); err != nil {
			ui.Error("Failed to remove hook scripts: " + err.Error())
			return err
		}
		ui.Success("Removed Agent Factory config and hook scripts")
	}
	if flagPurgeIdentity && hasIdentity {
		if err := identity.Delete(); err != nil {
			ui.Error("Failed to remove installation identity: " + err.Error())
			return err
		}
		ui.Success("Removed persistent installation identity")
	} else if hasIdentity {
		ui.Info("Preserved installation identity for future reinstalls")
	}

	// Remove backup
	for _, target := range []hooks.HookTarget{hooks.TargetClaude, hooks.TargetCodex} {
		backupPath := hooks.BackupPath(target)
		if _, err := os.Stat(backupPath); err == nil {
			os.Remove(backupPath)
			ui.Success("Removed settings backup")
		}
	}

	fmt.Println()
	fmt.Printf("  %s Agent Factory hooks are removed.\n", ui.SuccessStyle.Render(ui.BoldStyle.Render("Uninstalled.")))
	fmt.Println(ui.DimStyle.Render("  Your Claude/Codex sessions will no longer send events."))
	fmt.Println()

	return nil
}
