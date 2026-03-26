package cmd

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"runtime"
	"strings"

	"github.com/spf13/cobra"
	"github.com/wolzey/agent-factory/cli/internal/hooks"
	"github.com/wolzey/agent-factory/cli/internal/ui"
)

const (
	repo         = "wolzey/agent-factory"
	releasesAPI  = "https://api.github.com/repos/" + repo + "/releases/latest"
	downloadBase = "https://github.com/" + repo + "/releases/download"
)

var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Update Agent Factory CLI to the latest version",
	RunE:  runUpdate,
}

type ghRelease struct {
	TagName string `json:"tag_name"`
}

func runUpdate(cmd *cobra.Command, args []string) error {
	ui.PrintBanner()

	// Fetch latest release tag
	ui.Info("Checking for updates...")
	fmt.Println()

	resp, err := http.Get(releasesAPI)
	if err != nil {
		ui.Error("Failed to check for updates: " + err.Error())
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		ui.Error(fmt.Sprintf("GitHub API returned %d", resp.StatusCode))
		return fmt.Errorf("github API error: %d", resp.StatusCode)
	}

	var release ghRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		ui.Error("Failed to parse release info: " + err.Error())
		return err
	}

	fmt.Printf("  Latest version: %s\n", ui.CyanStyle.Render(release.TagName))

	// Determine platform asset name
	goos := runtime.GOOS
	goarch := runtime.GOARCH
	asset := fmt.Sprintf("agent-factory_%s_%s.tar.gz", goos, goarch)
	downloadURL := fmt.Sprintf("%s/%s/%s", downloadBase, release.TagName, asset)

	fmt.Printf("  Platform:       %s/%s\n", goos, goarch)
	fmt.Println()

	// Download
	ui.Info("Downloading " + asset + "...")

	dlResp, err := http.Get(downloadURL)
	if err != nil {
		ui.Error("Download failed: " + err.Error())
		return err
	}
	defer dlResp.Body.Close()

	if dlResp.StatusCode != 200 {
		ui.Error(fmt.Sprintf("Download returned %d — is %s available for your platform?", dlResp.StatusCode, release.TagName))
		return fmt.Errorf("download error: %d", dlResp.StatusCode)
	}

	// Extract the binary from the tarball
	binary, err := extractBinaryFromTarGz(dlResp.Body, "agent-factory")
	if err != nil {
		ui.Error("Failed to extract binary: " + err.Error())
		return err
	}

	// Find current binary path
	execPath, err := os.Executable()
	if err != nil {
		ui.Error("Cannot determine current binary path: " + err.Error())
		return err
	}

	// Resolve symlinks
	resolvedPath, err := resolveSymlinks(execPath)
	if err != nil {
		resolvedPath = execPath
	}

	// Write new binary over the old one
	ui.Info("Installing to " + resolvedPath + "...")

	if err := os.WriteFile(resolvedPath, binary, 0o755); err != nil {
		ui.Error("Failed to write binary: " + err.Error())
		ui.Info("You may need to run with sudo or check file permissions.")
		return err
	}

	fmt.Println()
	ui.Success(fmt.Sprintf("Updated to %s!", release.TagName))

	// Re-register hooks to pick up any new event types added in this version
	if hooks.IsInstalled() {
		registered, _, err := hooks.RegisterHooks(hooks.HookScriptPath())
		if err != nil {
			ui.Warn("Could not update hooks: " + err.Error())
			ui.Info("Run 'agent-factory install' to fix hooks manually.")
		} else if registered > 0 {
			ui.Success(fmt.Sprintf("Registered %d new hook event(s)", registered))
		}

		// Update skill files
		if err := hooks.WriteSkills(); err != nil {
			ui.Warn("Could not update skills: " + err.Error())
		}
	}

	fmt.Println()
	return nil
}

func extractBinaryFromTarGz(r io.Reader, name string) ([]byte, error) {
	gz, err := gzip.NewReader(r)
	if err != nil {
		return nil, fmt.Errorf("gzip error: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("tar error: %w", err)
		}

		// Match the binary name (may be in a subdirectory)
		if header.Typeflag == tar.TypeReg && strings.HasSuffix(header.Name, name) {
			data, err := io.ReadAll(tr)
			if err != nil {
				return nil, fmt.Errorf("read error: %w", err)
			}
			return data, nil
		}
	}

	return nil, fmt.Errorf("binary %q not found in archive", name)
}

func resolveSymlinks(path string) (string, error) {
	resolved, err := os.Readlink(path)
	if err != nil {
		return path, nil // Not a symlink
	}
	if !strings.HasPrefix(resolved, "/") {
		// Relative symlink — resolve relative to the original dir
		dir := path[:strings.LastIndex(path, "/")+1]
		resolved = dir + resolved
	}
	return resolved, nil
}
