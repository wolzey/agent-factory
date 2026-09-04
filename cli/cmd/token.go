package cmd

import "github.com/spf13/cobra"

var tokenCmd = &cobra.Command{
	Use:        "token",
	Short:      "Log this installation into Agent Factory in your browser",
	Deprecated: "use 'agent-factory login' instead",
	RunE:       runLogin,
}
