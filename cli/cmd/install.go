package cmd

import (
	"fmt"
	"os"

	"github.com/charmbracelet/huh"
	"github.com/spf13/cobra"
	"github.com/wolzey/agent-factory/cli/internal/config"
	"github.com/wolzey/agent-factory/cli/internal/hooks"
	"github.com/wolzey/agent-factory/cli/internal/ui"
	"github.com/wolzey/agent-factory/cli/internal/wizard"
)

var (
	flagNonInteractive bool
	flagServerURL      string
	flagUsername        string
)

var installCmd = &cobra.Command{
	Use:   "install",
	Short: "Install Agent Factory hooks into Claude Code",
	RunE:  runInstall,
}

func init() {
	installCmd.Flags().BoolVar(&flagNonInteractive, "non-interactive", false, "Skip wizard, use defaults or flag values")
	installCmd.Flags().StringVar(&flagServerURL, "server-url", "", "Server URL (default: http://localhost:4242)")
	installCmd.Flags().StringVar(&flagUsername, "username", "", "Display name (default: OS username)")
}

func runInstall(cmd *cobra.Command, args []string) error {
	ui.PrintBanner()

	// Check Claude Code is installed
	if !hooks.SettingsExist() {
		ui.Error("~/.claude/settings.json not found. Is Claude Code installed?")
		return fmt.Errorf("claude Code settings not found")
	}

	// Check if already installed
	if config.Exists() {
		ui.Warn("Agent Factory is already installed!")
		fmt.Println()

		if !flagNonInteractive {
			var reinstall bool
			form := huh.NewForm(
				huh.NewGroup(
					huh.NewConfirm().
						Title("Reinstall and reconfigure?").
						Value(&reinstall),
				),
			)
			if err := form.Run(); err != nil {
				return err
			}
			if !reinstall {
				ui.Info("Exiting. Your existing config is at ~/.config/agent-factory/config.json")
				return nil
			}
		}
	}

	// Get config via wizard or flags
	var cfg config.UserConfig

	if flagNonInteractive {
		cfg = buildConfigFromFlags()
	} else {
		var err error
		cfg, err = wizard.Run()
		if err != nil {
			return fmt.Errorf("wizard cancelled: %w", err)
		}

		// Show summary and confirm
		fmt.Println()
		fmt.Printf("  %s\n", ui.BoldStyle.Render("Your config:"))
		fmt.Printf("    Name:   %s\n", ui.CyanStyle.Render(cfg.Username))
		fmt.Printf("    Server: %s\n", ui.DimStyle.Render(cfg.ServerURL))
		fmt.Printf("    Color:  %s\n", cfg.Avatar.Color)
		fmt.Printf("    Style:  %d\n", cfg.Avatar.SpriteIndex)
		fmt.Println()

		var confirm bool
		form := huh.NewForm(
			huh.NewGroup(
				huh.NewConfirm().
					Title("Look good?").
					Affirmative("Yes").
					Negative("No").
					Value(&confirm),
			),
		)
		if err := form.Run(); err != nil {
			return err
		}
		if !confirm {
			ui.Info("Run 'agent-factory install' again to reconfigure.")
			return nil
		}
	}

	// Install
	fmt.Println()
	fmt.Printf("  %s\n", ui.BoldStyle.Render("Installing..."))
	fmt.Println()

	// Write config
	if err := config.Write(cfg); err != nil {
		ui.Error("Failed to write config: " + err.Error())
		return err
	}
	ui.Success("Config saved to ~/.config/agent-factory/config.json")

	// Write hook script
	if err := hooks.WriteHookScript(); err != nil {
		ui.Error("Failed to write hook script: " + err.Error())
		return err
	}
	ui.Success("Hook script installed")

	// Backup settings
	if err := hooks.BackupSettings(); err != nil {
		ui.Warn("Could not backup settings: " + err.Error())
	}

	// Register hooks
	registered, skipped, err := hooks.RegisterHooks(hooks.HookScriptPath())
	if err != nil {
		ui.Error("Failed to register hooks: " + err.Error())
		return err
	}

	if skipped > 0 && registered == 0 {
		ui.Success(fmt.Sprintf("Hooks already registered (%d events)", skipped))
	} else if skipped > 0 {
		ui.Success(fmt.Sprintf("Registered %d hooks (%d already existed)", registered, skipped))
	} else {
		ui.Success(fmt.Sprintf("Registered %d hooks", registered))
	}

	// Success message
	fmt.Println()
	fmt.Printf("  %s\n", ui.SuccessStyle.Render(ui.BoldStyle.Render("Installation complete!")))
	fmt.Println()
	fmt.Printf("  %s\n", ui.BoldStyle.Render("What now?"))
	fmt.Println()

	if cfg.ServerURL == "http://localhost:4242" {
		fmt.Println(ui.DimStyle.Render("  To run the server locally:"))
		fmt.Println(ui.DimStyle.Render("    git clone https://github.com/wolzey/agent-factory.git"))
		fmt.Println(ui.DimStyle.Render("    cd agent-factory && pnpm install && pnpm dev"))
		fmt.Println()
	}

	fmt.Println("  Your avatar will appear in Agent Factory when")
	fmt.Println("  you start your next Claude Code session.")
	fmt.Println()
	fmt.Println(ui.DimStyle.Render("  Config:  ~/.config/agent-factory/config.json"))
	fmt.Println(ui.DimStyle.Render("  Hooks:   ~/.config/agent-factory/hooks/agent-factory-hook.sh"))
	fmt.Println(ui.DimStyle.Render("  Backup:  ~/.claude/settings.json.agent-factory-backup"))
	fmt.Println()

	return nil
}

func buildConfigFromFlags() config.UserConfig {
	username := flagUsername
	if username == "" {
		username = os.Getenv("USER")
		if username == "" {
			username = "anonymous"
		}
	}

	serverURL := flagServerURL
	if serverURL == "" {
		serverURL = "http://localhost:4242"
	}

	return config.UserConfig{
		Username:  username,
		ServerURL: serverURL,
		Avatar: config.AvatarConfig{
			SpriteIndex: 0,
			Color:       "#4a90d9",
			Hat:         nil,
			Trail:       nil,
		},
	}
}
