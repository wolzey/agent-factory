package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/wolzey/agent-factory/cli/internal/config"
	"github.com/wolzey/agent-factory/cli/internal/hooks"
	"github.com/wolzey/agent-factory/cli/internal/identity"
)

var refreshAssetsCmd = &cobra.Command{
	Use:    "_refresh-assets",
	Hidden: true,
	RunE: func(_ *cobra.Command, _ []string) error {
		return refreshInstalledAssets()
	},
}

func refreshInstalledAssets() error {
	if config.Exists() {
		if _, err := identity.LoadOrCreate(); err != nil {
			return fmt.Errorf("refresh installation identity: %w", err)
		}
	}

	installedTargets := hooks.InstalledTargets()
	if len(installedTargets) == 0 {
		return nil
	}
	if err := hooks.WriteHookScript(); err != nil {
		return fmt.Errorf("refresh hook script: %w", err)
	}
	for _, target := range installedTargets {
		if _, _, err := hooks.RegisterHooks(target, hooks.HookScriptPath()); err != nil {
			return fmt.Errorf("refresh %s hooks: %w", target, err)
		}
	}
	if containsTarget(installedTargets, hooks.TargetClaude) {
		if err := hooks.WriteSkills(); err != nil {
			return fmt.Errorf("refresh Claude skill files: %w", err)
		}
	}
	return nil
}
