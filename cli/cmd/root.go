package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "agent-factory",
	Short: "Agent Factory CLI - install/uninstall Claude/Codex visualization hooks",
	Long:  "Install and manage Agent Factory hooks for Claude Code and Codex.\nYour coding sessions will appear as pixel art avatars in a retro arcade.",
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.AddCommand(installCmd)
	rootCmd.AddCommand(uninstallCmd)
	rootCmd.AddCommand(avatarCmd)
	rootCmd.AddCommand(updateCmd)
	rootCmd.AddCommand(emoteCmd)
	rootCmd.AddCommand(chatCmd)
	rootCmd.AddCommand(tokenCmd)
	rootCmd.AddCommand(configCmd)
}
