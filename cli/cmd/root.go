package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/wolzey/agent-factory/cli/internal/hooks"
)

var rootCmd = &cobra.Command{
	Use:   "agent-factory",
	Short: "Agent Factory CLI - install/uninstall Claude/Codex visualization hooks",
	Long:  "Install and manage Agent Factory hooks for Claude Code and Codex.\nYour coding sessions will appear as pixel art avatars in a retro arcade.",
	// `update` rewrites the binary from inside the old process, so the old code
	// finishes that run and a changed hook script is never written by the upgrade
	// delivering it. Repair it here instead, on the first run of the new binary,
	// so a fix to what the hook sends cannot sit undeployed on someone's machine.
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		updated, err := hooks.SyncHookScript()
		switch {
		case err != nil:
			// Failing quietly here would leave an older script in place, still
			// forwarding raw payloads, with nothing to indicate it.
			fmt.Fprintln(os.Stderr, "agent-factory: could not update the hook script: "+err.Error())
			fmt.Fprintln(os.Stderr, "agent-factory: run 'agent-factory install' to reinstall it")
		case updated:
			fmt.Fprintln(os.Stderr, "agent-factory: hook script updated to match this version")
		}
	},
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
