package cmd

import (
	"fmt"
	"os"
	"strings"

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
	flagUsername       string
	flagTarget         string
)

var installCmd = &cobra.Command{
	Use:   "install",
	Short: "Install Agent Factory hooks into Claude and/or Codex",
	RunE:  runInstall,
}

func init() {
	installCmd.Flags().BoolVar(&flagNonInteractive, "non-interactive", false, "Skip wizard, use defaults or flag values")
	installCmd.Flags().StringVar(&flagServerURL, "server-url", "", "Server URL (default: http://localhost:4242)")
	installCmd.Flags().StringVar(&flagUsername, "username", "", "Display name (default: OS username)")
	installCmd.Flags().StringVar(&flagTarget, "target", "", "Hook target: claude, codex, or both (default: auto-detect)")
}

func runInstall(cmd *cobra.Command, args []string) error {
	ui.PrintBanner()

	detectedTargets := hooks.DetectedTargets()
	selectedTargets, err := selectInstallTargets(detectedTargets)
	if err != nil {
		ui.Error(err.Error())
		return err
	}

	if containsTarget(selectedTargets, hooks.TargetClaude) && !hooks.ClaudeDetected() {
		ui.Error("~/.claude/settings.json not found. Is Claude Code installed?")
		return fmt.Errorf("~/.claude/settings.json not found. Is Claude Code installed?")
	}

	if containsTarget(selectedTargets, hooks.TargetCodex) && !hooks.CodexDetected() {
		ui.Warn("No Codex config detected. A minimal ~/.codex/config.toml will be created.")
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
		cfg, err = wizard.Run()
		if err != nil {
			return fmt.Errorf("wizard cancelled: %w", err)
		}

		// Show summary and confirm
		fmt.Println()
		fmt.Printf("  %s\n", ui.BoldStyle.Render("Your config:"))
		fmt.Printf("    Name:   %s\n", ui.CyanStyle.Render(cfg.Username))
		fmt.Printf("    Server: %s\n", ui.DimStyle.Render(cfg.ServerURL))
		fmt.Printf("    Shirt:  %s\n", cfg.Avatar.Color)
		if cfg.Avatar.HairStyle != nil {
			fmt.Printf("    Hair:   style %d\n", *cfg.Avatar.HairStyle)
		}
		if cfg.Avatar.SkinTone != nil {
			fmt.Printf("    Skin:   %s\n", *cfg.Avatar.SkinTone)
		}
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

	// Write skill files (e.g. /update-status)
	if containsTarget(selectedTargets, hooks.TargetClaude) {
		if err := hooks.WriteSkills(); err != nil {
			ui.Warn("Could not install skills: " + err.Error())
		} else {
			ui.Success("Skill /update-status installed to ~/.claude/commands/")
		}
	}

	// Backup settings and register hooks for each selected target.
	for _, target := range selectedTargets {
		if err := hooks.BackupSettings(target); err != nil {
			ui.Warn(fmt.Sprintf("Could not backup %s settings: %v", target, err))
		}

		registered, skipped, err := hooks.RegisterHooks(target, hooks.HookScriptPath())
		if err != nil {
			ui.Error(fmt.Sprintf("Failed to register %s hooks: %v", target, err))
			return err
		}

		prefix := strings.ToUpper(string(target))
		if skipped > 0 && registered == 0 {
			ui.Success(fmt.Sprintf("%s hooks already registered (%d events)", prefix, skipped))
		} else if skipped > 0 {
			ui.Success(fmt.Sprintf("%s registered %d hooks (%d already existed)", prefix, registered, skipped))
		} else {
			ui.Success(fmt.Sprintf("%s registered %d hooks", prefix, registered))
		}
	}

	// Fetch auth token from server
	token, tokenErr := fetchToken(cfg.ServerURL, cfg.Username)
	if tokenErr == nil {
		cfg.Token = token
		if writeErr := config.Write(cfg); writeErr == nil {
			ui.Success("Auth token generated")
		}
	} else {
		ui.Warn("Could not fetch auth token (server may not be running)")
		ui.Info("Run 'agent-factory token' later to generate your token")
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
	if containsTarget(selectedTargets, hooks.TargetClaude) && containsTarget(selectedTargets, hooks.TargetCodex) {
		fmt.Println("  you start your next Claude Code or Codex session.")
	} else if containsTarget(selectedTargets, hooks.TargetCodex) {
		fmt.Println("  you start your next Codex session.")
	} else {
		fmt.Println("  you start your next Claude Code session.")
	}
	fmt.Println()
	fmt.Println(ui.DimStyle.Render("  Config:  ~/.config/agent-factory/config.json"))
	fmt.Println(ui.DimStyle.Render("  Hooks:   ~/.config/agent-factory/hooks/agent-factory-hook.sh"))
	if containsTarget(selectedTargets, hooks.TargetClaude) {
		fmt.Println(ui.DimStyle.Render("  Backup:  ~/.claude/settings.json.agent-factory-backup"))
	}
	if containsTarget(selectedTargets, hooks.TargetCodex) {
		fmt.Println(ui.DimStyle.Render("  Backup:  ~/.codex/hooks.json.agent-factory-backup"))
	}
	fmt.Println()

	return nil
}

func selectInstallTargets(detected []hooks.HookTarget) ([]hooks.HookTarget, error) {
	if flagTarget != "" {
		return parseTargetChoice(flagTarget)
	}

	if flagNonInteractive {
		targets := defaultTargetsFromDetection(detected)
		if len(targets) == 0 {
			return nil, fmt.Errorf("no Claude/Codex config detected. Use --target (claude|codex|both)")
		}
		return targets, nil
	}

	defaultChoice := defaultChoiceFromDetection(detected)
	choice := defaultChoice
	claudeLabel := "Claude"
	if hooks.ClaudeDetected() {
		claudeLabel += " (detected)"
	}
	codexLabel := "Codex"
	if hooks.CodexDetected() {
		codexLabel += " (detected)"
	}

	form := huh.NewForm(
		huh.NewGroup(
			huh.NewSelect[string]().
				Title("Install hooks for which client?").
				Options(
					huh.NewOption(claudeLabel, "claude"),
					huh.NewOption(codexLabel, "codex"),
					huh.NewOption("Both", "both"),
				).
				Value(&choice),
		),
	)
	if err := form.Run(); err != nil {
		return nil, err
	}

	return parseTargetChoice(choice)
}

func parseTargetChoice(choice string) ([]hooks.HookTarget, error) {
	switch strings.ToLower(strings.TrimSpace(choice)) {
	case "claude":
		return []hooks.HookTarget{hooks.TargetClaude}, nil
	case "codex":
		return []hooks.HookTarget{hooks.TargetCodex}, nil
	case "both":
		return []hooks.HookTarget{hooks.TargetClaude, hooks.TargetCodex}, nil
	default:
		return nil, fmt.Errorf("invalid --target %q (expected claude, codex, or both)", choice)
	}
}

func defaultTargetsFromDetection(detected []hooks.HookTarget) []hooks.HookTarget {
	hasClaude := containsTarget(detected, hooks.TargetClaude)
	hasCodex := containsTarget(detected, hooks.TargetCodex)
	switch {
	case hasClaude && hasCodex:
		return []hooks.HookTarget{hooks.TargetClaude, hooks.TargetCodex}
	case hasClaude:
		return []hooks.HookTarget{hooks.TargetClaude}
	case hasCodex:
		return []hooks.HookTarget{hooks.TargetCodex}
	default:
		return nil
	}
}

func defaultChoiceFromDetection(detected []hooks.HookTarget) string {
	targets := defaultTargetsFromDetection(detected)
	if len(targets) == 2 {
		return "both"
	}
	if len(targets) == 1 {
		return string(targets[0])
	}
	return "claude"
}

func containsTarget(targets []hooks.HookTarget, target hooks.HookTarget) bool {
	for _, t := range targets {
		if t == target {
			return true
		}
	}
	return false
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
