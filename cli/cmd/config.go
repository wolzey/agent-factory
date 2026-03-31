package cmd

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"
	"github.com/wolzey/agent-factory/cli/internal/config"
	"github.com/wolzey/agent-factory/cli/internal/ui"
)

var validKeys = []string{"serverUrl", "username", "token"}

var configCmd = &cobra.Command{
	Use:   "config",
	Short: "Manage Agent Factory configuration",
}

var configSetCmd = &cobra.Command{
	Use:   "set <key> <value>",
	Short: "Set a configuration value",
	Long:  "Set a configuration value. Valid keys: " + strings.Join(validKeys, ", "),
	Args:  cobra.ExactArgs(2),
	RunE:  runConfigSet,
}

func init() {
	configCmd.AddCommand(configSetCmd)
}

func runConfigSet(cmd *cobra.Command, args []string) error {
	key, value := args[0], args[1]

	if !config.Exists() {
		ui.Error("Agent Factory is not installed. Run 'agent-factory install' first.")
		return fmt.Errorf("not installed")
	}

	cfg, err := config.Read()
	if err != nil {
		ui.Error("Failed to read config: " + err.Error())
		return err
	}

	switch key {
	case "serverUrl":
		cfg.ServerURL = value
	case "username":
		cfg.Username = value
	case "token":
		cfg.Token = value
	default:
		ui.Error(fmt.Sprintf("Unknown key %q. Valid keys: %s", key, strings.Join(validKeys, ", ")))
		return fmt.Errorf("unknown config key: %s", key)
	}

	if err := config.Write(cfg); err != nil {
		ui.Error("Failed to save config: " + err.Error())
		return err
	}

	ui.Success(fmt.Sprintf("Set %s = %s", key, value))
	return nil
}
